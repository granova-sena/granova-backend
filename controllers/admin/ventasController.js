import pool from "../../config/db.js";
import { insertarFactura } from "../../models/facturasModel.js";
import { obtenerParametro } from "./parametrosController.js";

const calcCambio = (actual, anterior) => {
  if (anterior == 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
};

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const METODOS_PAGO = ["tarjeta", "pse", "efectivo", "transferencia", "contra_entrega", "nequi", "daviplata"];
const ESTADOS_PAGO = ["pendiente", "pendiente_verificacion", "pagado", "fallido", "reembolsado"];
const ESTADOS_PEDIDO = ["pendiente", "confirmado", "en_proceso", "enviado", "entregado", "cancelado"];

// Misma regla que el checkout público (pedidosController): "mayor gana" entre
// descuento por volumen, promoción vigente y descuento de empresa configurable.
async function computarItems(client, items, cliente, totalUnidades) {
  const idsProductos = items.map(i => i.id_producto).filter(Boolean);
  const productosResult = await client.query(
    `SELECT id_producto, nombre, precio, precio_mayorista, stock, categoria_producto, iva_pct
     FROM productos WHERE id_producto = ANY($1::int[]) AND estado = 'activo'`,
    [idsProductos]
  );
  const productosMap = {};
  productosResult.rows.forEach(p => { productosMap[p.id_producto] = p; });

  const esMayorista = cliente.tipo_cliente === 'mayorista';
  const esJuridica = cliente.tipo_persona === 'juridica';
  const descuentoEmpresaPct = esJuridica
    ? await obtenerParametro('descuento_empresa_pct', 15)
    : 0;

  const pctVolumen = esMayorista
    ? 12
    : (totalUnidades >= 5 ? 6 : 0);

  const detalles = [];
  let total = 0;

  for (const item of items) {
    const producto = productosMap[item.id_producto];
    if (!producto) throw new Error(`Producto ${item.id_producto} no existe o está inactivo.`);

    const cantidad = Math.floor(Number(item.cantidad));
    if (!cantidad || cantidad <= 0) throw new Error(`Cantidad inválida para ${producto.nombre}.`);

    // Formato (bolsa/presentación) opcional por ítem
    let id_formato = item.id_formato ? Number(item.id_formato) : null;
    let formatoStock = null;
    let precioFormato = null;
    if (id_formato) {
      const f = await client.query(
        `SELECT id_formato, precio, stock, etiqueta FROM formatos_producto
         WHERE id_formato = $1 AND id_producto = $2`,
        [id_formato, item.id_producto]
      );
      if (f.rows.length === 0) {
        throw new Error(`El formato ${id_formato} no pertenece al producto "${producto.nombre}".`);
      }
      formatoStock = Number(f.rows[0].stock);
      precioFormato = Number(f.rows[0].precio);
    }

    const stockDisponible = formatoStock != null ? formatoStock : Number(producto.stock);
    if (stockDisponible < cantidad) {
      throw new Error(`Stock insuficiente${formatoStock != null ? " de este formato" : ""} para ${producto.nombre} (disponible: ${stockDisponible}).`);
    }

    // Promoción vigente
    const promoResult = await client.query(
      `SELECT pr.valor_descuento
       FROM promocion_productos pp
       JOIN promociones pr ON pr.id_promocion = pp.id_promocion
       WHERE pp.id_producto = $1 AND pr.estado = 'activa'
         AND (pr.fecha_fin IS NULL OR pr.fecha_fin >= CURRENT_DATE)
       ORDER BY pr.valor_descuento DESC LIMIT 1`,
      [item.id_producto]
    );
    const promoPct = promoResult.rows.length > 0 ? Number(promoResult.rows[0].valor_descuento) : 0;

    const precioBase =
      precioFormato != null
        ? precioFormato
        : (esMayorista && producto.precio_mayorista != null ? Number(producto.precio_mayorista) : Number(producto.precio));

    const pctGanador = Math.max(promoPct || 0, pctVolumen, descuentoEmpresaPct);
    const precioUnitario = pctGanador > 0
      ? Math.round(precioBase * (1 - pctGanador / 100))
      : precioBase;

    const subtotal = precioUnitario * cantidad;
    total += subtotal;

    detalles.push({
      id_producto: producto.id_producto,
      id_formato,
      cantidad,
      precio_unitario: precioUnitario,
      precio_original: precioBase,
      subtotal,
      iva_pct: Number(producto.iva_pct) || 0,
      stock_metodo: formatoStock != null ? 'formato' : 'producto',
    });
  }

  return { detalles, total };
}

// Desglose de IVA por tasa real (5% tostado, 19% máquinas, 0% verde), igual que
// facturasController: los precios ya incluyen IVA.
function calcularValoresPorTasa(items) {
  const porTasa = new Map();
  for (const item of items) {
    const bruto = Number(item.precio_unitario) * Number(item.cantidad);
    const tasa = Math.round(Number(item.iva_pct ?? 0));
    const subtotalItem = tasa === 0 ? bruto : bruto / (1 + tasa / 100);
    const impuestoItem = bruto - subtotalItem;
    const acumulado = porTasa.get(tasa) || { tasa, base: 0, impuesto: 0 };
    acumulado.base += subtotalItem;
    acumulado.impuesto += impuestoItem;
    porTasa.set(tasa, acumulado);
  }
  return [...porTasa.values()]
    .sort((a, b) => a.tasa - b.tasa)
    .map(t => ({ tasa: t.tasa, base: Math.round(t.base * 100) / 100, valor: Math.round(t.impuesto * 100) / 100 }));
}

const getResumen = async (req, res) => {
  try {
    const ventas = await pool.query(`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE date_trunc('month', fecha_pedido) = date_trunc('month', CURRENT_DATE)), 0) AS actual,
        COALESCE(SUM(total) FILTER (WHERE date_trunc('month', fecha_pedido) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')), 0) AS anterior
      FROM pedidos
    `);

    const kg = await pool.query(`
      SELECT COALESCE(SUM(dp.cantidad) FILTER (
        WHERE date_trunc('month', p.fecha_pedido) = date_trunc('month', CURRENT_DATE)
      ), 0) AS actual
      FROM detalle_pedidos dp
      JOIN pedidos p ON p.id_pedido = dp.id_pedido
    `);

    const clientesActivos = await pool.query(`SELECT COUNT(*) AS total FROM clientes WHERE estado = 'activo'`);
    const clientesNuevos = await pool.query(`
      SELECT COUNT(*) AS total FROM clientes
      WHERE date_trunc('month', fecha_registro) = date_trunc('month', CURRENT_DATE)
    `);

    const facturas = await pool.query(`
      SELECT COUNT(*) AS total FROM facturas
      WHERE date_trunc('month', fecha_emision) = date_trunc('month', CURRENT_DATE)
    `);

    const actual = Number(ventas.rows[0].actual);
    const anterior = Number(ventas.rows[0].anterior);

    res.json({
      ok: true,
      ventasDelMes: actual,
      cambioVentas: calcCambio(actual, anterior),
      clientesActivos: Number(clientesActivos.rows[0].total),
      clientesNuevos: Number(clientesNuevos.rows[0].total),
      kgVendidos: Number(kg.rows[0].actual),
      facturasEmitidas: Number(facturas.rows[0].total)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const getVentas = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const search = String(req.query.search || '');

    const result = await pool.query(`
      SELECT
        f.numero_factura,
        p.id_pedido,
        p.fecha_pedido,
        p.estado,
        p.total,
        c.nombre, c.apellido, c.email,
        dp1.producto_nombre,
        dp1.categoria_producto,
        dp1.finca_nombre, dp1.codigo_lote,
        dp_sum.cantidad_total
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
      LEFT JOIN LATERAL (
        SELECT pr.nombre AS producto_nombre, pr.categoria_producto, l.finca AS finca_nombre, l.codigo_lote
        FROM detalle_pedidos dp
        JOIN productos pr ON pr.id_producto = dp.id_producto
        LEFT JOIN lotes l ON l.id_lote = pr.id_lote
        WHERE dp.id_pedido = p.id_pedido
        ORDER BY dp.id_detalle
        LIMIT 1
      ) dp1 ON true
      LEFT JOIN LATERAL (
        SELECT SUM(dp.cantidad) AS cantidad_total
        FROM detalle_pedidos dp
        WHERE dp.id_pedido = p.id_pedido
      ) dp_sum ON true
      ORDER BY p.fecha_pedido DESC
    `);

    let ventas = result.rows.map(v => ({
      id: v.id_pedido,
      factura: v.numero_factura || `Pedido #${v.id_pedido}`,
      cliente: `${v.nombre} ${v.apellido}`,
      email: v.email,
      producto: v.producto_nombre || 'Sin producto',
      esMaquina: v.categoria_producto === 'maquina',
      finca: v.finca_nombre || null,
      lote: v.codigo_lote || null,
      cantidad: Number(v.cantidad_total) || 0,
      total: Number(v.total),
      estado: v.estado,
      fecha: v.fecha_pedido,
    }));

    if (search) {
      const q = normalizar(search);
      ventas = ventas.filter(v =>
        normalizar(v.cliente).includes(q) ||
        normalizar(v.producto).includes(q) ||
        normalizar(v.factura).includes(q) ||
        normalizar(v.email).includes(q)
      );
    }

    const totalFiltrados = ventas.length;
    const start = (Number(page) - 1) * Number(limit);
    const pagina = ventas.slice(start, start + Number(limit));

    res.json({
      ok: true,
      ventas: pagina,
      totalFiltrados,
      page: Number(page),
      totalPaginas: Math.max(Math.ceil(totalFiltrados / Number(limit)), 1)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const getClientes = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_cliente, nombre, apellido, email, tipo_cliente, tipo_persona, razon_social, numero_documento, tipo_documento
      FROM clientes
      ORDER BY nombre
    `);
    res.json({ ok: true, clientes: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const getProductosDisponibles = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id_producto, p.nombre, p.precio, p.precio_mayorista, p.stock,
        p.categoria_producto, p.iva_pct,
        COALESCE((
          SELECT pr.valor_descuento
          FROM promocion_productos pp
          JOIN promociones pr ON pr.id_promocion = pp.id_promocion
          WHERE pp.id_producto = p.id_producto AND pr.estado = 'activa'
            AND (pr.fecha_fin IS NULL OR pr.fecha_fin >= CURRENT_DATE)
          ORDER BY pr.valor_descuento DESC
          LIMIT 1
        ), 0) AS promo_pct
      FROM productos p
      WHERE p.stock > 0 AND p.estado = 'activo'
      ORDER BY p.nombre
    `);

    const formatosResult = await pool.query(`
      SELECT id_formato, id_producto, etiqueta, peso_kg, precio, activo, stock
      FROM formatos_producto
      ORDER BY precio
    `);
    const formatosPorProducto = {};
    formatosResult.rows.forEach(f => {
      if (!formatosPorProducto[f.id_producto]) formatosPorProducto[f.id_producto] = [];
      formatosPorProducto[f.id_producto].push(f);
    });

    const productos = result.rows.map(p => ({
      ...p,
      precio: Number(p.precio),
      precio_mayorista: p.precio_mayorista != null ? Number(p.precio_mayorista) : null,
      promo_pct: Number(p.promo_pct) || 0,
      formatos: formatosPorProducto[p.id_producto] || [],
    }));

    res.json({ ok: true, productos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearVenta = async (req, res) => {
  const {
    id_cliente, metodo_pago, estado_pago, estado,
    items, direccion_envio, ciudad_envio, sector_envio,
    codigo_cupon,
  } = req.body;

  if (!id_cliente || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Selecciona un cliente y al menos un producto.' });
  }
  if (Number.isNaN(Number(id_cliente))) {
    return res.status(400).json({ ok: false, error: 'El id del cliente debe ser un número.' });
  }
  if (items.length > 60) {
    return res.status(400).json({ ok: false, error: 'Una venta no puede tener más de 60 productos.' });
  }
  if (!metodo_pago || !METODOS_PAGO.includes(String(metodo_pago).toLowerCase())) {
    return res.status(400).json({ ok: false, error: `Método de pago inválido. Opciones: ${METODOS_PAGO.join(', ')}.` });
  }

  const metodoPagoFinal = String(metodo_pago).toLowerCase();
  const estadoPagoFinal = estado_pago && ESTADOS_PAGO.includes(String(estado_pago).toLowerCase())
    ? String(estado_pago).toLowerCase()
    : 'pendiente';
  const estadoFinal = estado && ESTADOS_PEDIDO.includes(String(estado).toLowerCase())
    ? String(estado).toLowerCase()
    : 'confirmado';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const clienteRes = await client.query(
      `SELECT id_cliente, nombre, apellido, email, tipo_cliente, tipo_persona,
              razon_social, numero_documento, tipo_documento, puntos
       FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );
    if (clienteRes.rows.length === 0) throw new Error('Cliente no encontrado.');
    const cliente = clienteRes.rows[0];
    const esJuridica = cliente.tipo_persona === 'juridica';

    // Descuento por volumen según unidades totales del pedido (misma regla del checkout)
    const totalUnidades = items.reduce((acc, i) => acc + (Math.floor(Number(i.cantidad)) || 0), 0);
    const { detalles, total } = await computarItems(client, items, cliente, totalUnidades);

    // Descuento aplicado por "mayor gana" (sin contar cupón)
    const descuentoProductos = detalles.reduce(
      (acc, d) => acc + (d.precio_original - d.precio_unitario) * d.cantidad,
      0
    );

    // ── Cupón de lealtad (misma validación que el checkout) ──
    let cupon = null;
    let descuentoCuponMonto = 0;
    if (codigo_cupon && String(codigo_cupon).trim()) {
      if (esJuridica) {
        throw new Error('Los cupones de lealtad no aplican para cuentas empresariales');
      }
      const r = await client.query(
        `SELECT id_cupon, codigo, descuento_pct FROM cupones
         WHERE UPPER(codigo) = UPPER($1) AND id_cliente = $2 AND usado = false
           AND fecha_vencimiento > CURRENT_DATE
         FOR UPDATE`,
        [String(codigo_cupon).trim(), id_cliente]
      );
      if (r.rows.length === 0) {
        throw new Error('Cupón inválido, vencido o ya utilizado');
      }
      cupon = r.rows[0];
      descuentoCuponMonto = Math.round(total * Number(cupon.descuento_pct) / 100);
    }
    const totalFinal = total - descuentoCuponMonto;

    // Operación: misma heurística que la tienda (reparto para empresas/volumen alto)
    const UMBRAL_UNIDADES_REPARTO = 20;
    const UMBRAL_TOTAL_REPARTO = 500000;
    const esReparto =
      cliente.tipo_cliente === 'mayorista' || esJuridica ||
      totalUnidades >= UMBRAL_UNIDADES_REPARTO || total >= UMBRAL_TOTAL_REPARTO;
    const operacion = esReparto ? 'reparto' : 'domicilio';
    const sector = String(sector_envio || '').trim() || null;

    const pedidoResult = await client.query(`
      INSERT INTO pedidos (id_cliente, fecha_pedido, estado, estado_pago, metodo_pago,
                           direccion_envio, ciudad_envio, total, descuento, codigo_cupon, operacion, sector_envio)
      VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id_pedido
    `, [id_cliente, estadoFinal, estadoPagoFinal, metodoPagoFinal,
        direccion_envio || null, ciudad_envio || null, totalFinal, descuentoCuponMonto,
        cupon ? cupon.codigo : null, operacion, sector]);

    const id_pedido = pedidoResult.rows[0].id_pedido;

    for (const d of detalles) {
      await client.query(`
        INSERT INTO detalle_pedidos (id_pedido, id_producto, id_formato, cantidad, precio_unitario, subtotal)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id_pedido, d.id_producto, d.id_formato, d.cantidad, d.precio_unitario, d.subtotal]);

      await client.query(`UPDATE productos SET stock = stock - $1 WHERE id_producto = $2`, [d.cantidad, d.id_producto]);
      if (d.id_formato) {
        await client.query(`UPDATE formatos_producto SET stock = stock - $1 WHERE id_formato = $2`, [d.cantidad, d.id_formato]);
      }
    }

    // Factura inmediata con IVA por tasa y datos fiscales congelados
    const contarFacturas = await client.query('SELECT COUNT(*) AS total FROM facturas');
    const numeroFactura = `FE-${new Date().getFullYear()}-${String(Number(contarFacturas.rows[0].total) + 1).padStart(4, '0')}`;
    const valores = calcularValoresPorTasa(detalles);
    const razonSocial = esJuridica
      ? (cliente.razon_social || `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim())
      : `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
    const numeroDocumento = esJuridica
      ? (cliente.numero_documento || '')
      : (cliente.numero_documento || cliente.tipo_documento || '');

    await insertarFactura(client, {
      id_pedido,
      numero_factura: numeroFactura,
      subtotal: valores.subtotal,
      impuestos: valores.impuestos,
      total: totalFinal,
      tipo_persona_cliente: cliente.tipo_persona || 'natural',
      numero_documento_cliente: numeroDocumento || null,
      razon_social_cliente: razonSocial || null,
      email_cliente: cliente.email || null,
    });

    // Bloquear el cupón una vez usado
    if (cupon) {
      await client.query(`UPDATE cupones SET usado = true WHERE id_cupon = $1`, [cupon.id_cupon]);
    }

    // Si el pago ya está confirmado, acreditar puntos de lealtad (1 por $1.000)
    let puntosGanados = 0;
    if (estadoPagoFinal === 'pagado' && !esJuridica && totalFinal > 0) {
      puntosGanados = Math.floor(totalFinal / 1000);
      if (puntosGanados > 0) {
        await client.query(`UPDATE clientes SET puntos = puntos + $1 WHERE id_cliente = $2`, [puntosGanados, id_cliente]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({
      ok: true,
      id_pedido,
      numero_factura: numeroFactura,
      total: totalFinal,
      descuento_productos: Math.round(descuentoProductos),
      descuento_cupon: descuentoCuponMonto,
      puntos_ganados: puntosGanados,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
};

export { getResumen, getVentas, getClientes, getProductosDisponibles, crearVenta };