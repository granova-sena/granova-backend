import pool from "../config/db.js";
import { crearSesionPago } from "../utils/pasarela.js";
import { obtenerParametro } from "./admin/parametrosController.js";
import { formatearNumeroPedido } from "../utils/formatearNumeroPedido.js";

// ─────────────────────────────────────────
// POST /api/pedidos (requiere token de cliente)
// ─────────────────────────────────────────
export const crearPedido = async (req, res) => {

  const { id_cliente, metodo_pago, direccion_envio, ciudad_envio, productos, codigo_cupon, sector_envio } = req.body;

  // Validación de campos obligatorios
  if (!id_cliente || !metodo_pago || !direccion_envio || !ciudad_envio || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({
      ok: false,
      mensaje: "Faltan campos obligatorios"
    });
  }

  if (Number.isNaN(Number(id_cliente))) {
    return res.status(400).json({ ok: false, mensaje: "El id del cliente debe ser un número" });
  }

  // Tope de ítems: evita que un carrito gigante meta queries N+1 y sature la BD.
  if (productos.length > 60) {
    return res.status(400).json({ ok: false, mensaje: "Un pedido no puede tener más de 60 productos" });
  }

  if (String(direccion_envio).length > 200 || String(ciudad_envio).length > 100 || String(sector_envio || "").length > 100) {
    return res.status(400).json({ ok: false, mensaje: "Dirección, ciudad o sector demasiado largos" });
  }

  // Solo el cliente dueño de la cuenta puede crear su pedido.
  // Antes la ruta estaba abierta: cualquiera podía pedir a nombre de cualquier cliente.
  if (req.usuario?.rol || Number(req.usuario?.id) !== Number(id_cliente)) {
    return res.status(403).json({
      ok: false,
      mensaje: "Solo puedes crear pedidos con tu propia cuenta"
    });
  }

  // Validar que metodo_pago sea un valor permitido por la base de datos
  const metodosPagoPermitidos = ["tarjeta", "pse", "efectivo", "transferencia", "contra_entrega", "nequi", "daviplata"];
  if (!metodosPagoPermitidos.includes(metodo_pago)) {
    return res.status(400).json({
      ok: false,
      mensaje: `Método de pago inválido. Opciones: ${metodosPagoPermitidos.join(", ")}`
    });
  }

  // Validar cada producto antes de tocar la BD
  for (const p of productos) {
    if (!p.id_producto || !Number.isInteger(Number(p.cantidad)) || Number(p.cantidad) <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: `Producto con id ${p.id_producto || '?'} tiene cantidad inválida: ${p.cantidad}`
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que el cliente existe y traer su tipo (define qué precio aplica)
    const clienteExiste = await client.query(
      `SELECT id_cliente, tipo_cliente, tipo_persona, unidades_acumuladas FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteExiste.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        mensaje: "Cliente no encontrado"
      });
    }

    const esMayorista = clienteExiste.rows[0].tipo_cliente === 'mayorista';
    // Personas jurídicas no usan cupones de lealtad: tienen su descuento de
    // empresa (configurable en la tabla parametros_cafe, default 20%).
    const esJuridica = clienteExiste.rows[0].tipo_persona === 'juridica';
    const descuentoEmpresaPct = esJuridica
      ? await obtenerParametro('descuento_empresa_pct', 20)
      : 0;

    // Premio de lealtad: cada 5 unidades acumuladas dan 10% (persona natural).
    // Se liquida/consume cuando el pago se confirma (ver finalizarLealtad).
    const acumuladoPrevio = Number(clienteExiste.rows[0].unidades_acumuladas) || 0;
    const premioActivo = !esJuridica && acumuladoPrevio >= 5;
    const pctPremio = premioActivo ? 10 : 0;

    // Verificar productos, stock y traer el precio real desde la BD.
    // El precio nunca se toma del body: si el cliente lo manda, se ignora.
    // Mayorista usa precio_mayorista (si existe); minorista siempre precio público.
    // Luego se aplica "mayor gana": max(descuento volumen, descuento promo).
    const productosConPrecio = [];
    for (const p of productos) {
      const productoExiste = await client.query(
        `SELECT id_producto, stock, nombre, precio, precio_mayorista FROM productos WHERE id_producto = $1 AND estado = 'activo'`,
        [p.id_producto]
      );

      if (productoExiste.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          mensaje: `Producto con id ${p.id_producto} no encontrado o inactivo`
        });
      }

      const { stock, nombre, precio, precio_mayorista } = productoExiste.rows[0];
      const cantidad = Math.floor(Number(p.cantidad));

      // Si el cliente eligió un formato (bolsa/presentación), se valida contra
      // el stock de ESE formato y se cobra el precio del formato.
      let id_formato = p.id_formato || null;
      let formatoStock = null;
      let precioFormato = null;
      if (id_formato) {
        const formatoExiste = await client.query(
          `SELECT id_formato, precio, stock FROM formatos_producto
           WHERE id_formato = $1 AND id_producto = $2 AND activo = true`,
          [id_formato, p.id_producto]
        );

        if (formatoExiste.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            ok: false,
            mensaje: `El formato ${id_formato} no pertenece al producto "${nombre}" o está inactivo`
          });
        }
        formatoStock = Number(formatoExiste.rows[0].stock);
        precioFormato = Number(formatoExiste.rows[0].precio);
        id_formato = Number(id_formato);
      }

      const stockDisponible = formatoStock != null ? formatoStock : Number(stock);
      if (stockDisponible < cantidad) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: `Stock insuficiente${formatoStock != null ? " de este formato" : ""} para "${nombre}". Disponible: ${stockDisponible}`
        });
      }

      // Precio base: el del formato elegido, o según tipo de cliente
      const precioBase =
        precioFormato != null
          ? precioFormato
          : esMayorista && precio_mayorista != null ? Number(precio_mayorista) : Number(precio);

      // Consultar si tiene promoción vigente
      const promoResult = await client.query(
        `SELECT pr.valor_descuento
         FROM promocion_productos pp
         JOIN promociones pr ON pr.id_promocion = pp.id_promocion
         WHERE pp.id_producto = $1 AND pr.estado = 'activa'
           AND (pr.fecha_fin IS NULL OR pr.fecha_fin >= CURRENT_DATE)`,
        [p.id_producto]
      );
      const promoPct = promoResult.rows.length > 0 ? Number(promoResult.rows[0].valor_descuento) : 0;

      productosConPrecio.push({ ...p, id_formato, precio_base: precioBase, promo_pct: promoPct, cantidad });
    }

    // ── "Mayor gana": calcular descuento por volumen según unidades totales ──
    const totalUnidades = productosConPrecio.reduce((acc, p) => acc + p.cantidad, 0);
    const UNIDADES_MINIMAS_DESCUENTO_MINORISTA = 5;
    const DESCUENTO_MAYORISTA = 12;
    const DESCUENTO_MINORISTA = 6;

    const pctVolumen = esMayorista
      ? DESCUENTO_MAYORISTA
      : (totalUnidades >= UNIDADES_MINIMAS_DESCUENTO_MINORISTA ? DESCUENTO_MINORISTA : 0);

    // Aplicar "mayor gana" por producto: el descuento más alto entre volumen,
    // promo, el descuento de empresa (personas jurídicas) y el premio de lealtad.
    for (const p of productosConPrecio) {
      const pctGanador = Math.max(p.promo_pct || 0, pctVolumen, descuentoEmpresaPct, pctPremio);
      const precioReal = pctGanador > 0
        ? Math.round(p.precio_base * (1 - pctGanador / 100))
        : p.precio_base;
      p.precio_unitario = precioReal;
    }

    // ── Cupón: validar, bloquear, calcular descuento ──
    // Las personas jurídicas no usan cupones (su beneficio es el descuento de empresa)
    let cupon = null;
    let descuentoCuponMonto = 0;
    if (codigo_cupon && String(codigo_cupon).trim()) {
      if (esJuridica) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: "Los cupones de lealtad no aplican para cuentas empresariales"
        });
      }
      const r = await client.query(
        `SELECT id_cupon, codigo, descuento_pct FROM cupones
         WHERE UPPER(codigo) = UPPER($1) AND id_cliente = $2 AND usado = false
           AND fecha_vencimiento > CURRENT_DATE
         FOR UPDATE`,
        [String(codigo_cupon).trim(), id_cliente]
      );
      if (r.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: "Cupón inválido, vencido o ya utilizado"
        });
      }
      cupon = r.rows[0];
    }

    // Calcular subtotal con precio real (sin cupón — el cupón es adicional)
    const subtotalSinCupon = productosConPrecio.reduce(
      (acc, p) => acc + p.precio_unitario * p.cantidad,
      0
    );

    // Aplicar cupón sobre el subtotal
    if (cupon) {
      descuentoCuponMonto = Math.round(subtotalSinCupon * Number(cupon.descuento_pct) / 100);
    }

    const total = subtotalSinCupon - descuentoCuponMonto;

    // ── Operación: reparto (empresas/pedidos grandes) o domicilio ──
    // Igual que MercadoLibre elige modalidad según el perfil: mayorista,
    // empresa (jurídica) o volumen alto → reparto con vehículo; lo demás
    // es domicilio. El despachador puede reclasificar a mano después.
    const UMBRAL_UNIDADES_REPARTO = 20;
    const UMBRAL_TOTAL_REPARTO = 500000;
    const esReparto =
      esMayorista || esJuridica ||
      totalUnidades >= UMBRAL_UNIDADES_REPARTO ||
      total >= UMBRAL_TOTAL_REPARTO;
    const operacion = esReparto ? "reparto" : "domicilio";
    const sector = String(sector_envio || "").trim() || null;

    // Estado inicial: el pedido nace 'confirmado' (no hay Pendiente de fábrica).
    // El estado_pago es independiente (doc 01): la pasarela lo paga al aprobar;
    // manual (transferencia/efectivo) lo marca el panel y contra entrega lo
    // confirma el cliente al recibir.
    const ES_PASARELA = ["tarjeta", "pse", "nequi", "daviplata"].includes(metodo_pago);
    const estadoInicial = "confirmado";
    const estadoPagoInicial =
      metodo_pago === "contra_entrega"
        ? "pendiente"
        : ES_PASARELA ? "pendiente" : "pendiente_verificacion";

    // Insertar pedido principal (con código_cupon para auditoría).
    // El cupón se marca usado (abajo); si el pago falla se devuelve el stock.
    const resultadoPedido = await client.query(
      `INSERT INTO pedidos (id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago, operacion, sector_envio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id_pedido`,
      [id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuentoCuponMonto, cupon ? cupon.codigo : null, estadoInicial, estadoPagoInicial, operacion, sector]
    );

    const id_pedido = resultadoPedido.rows[0].id_pedido;

    // Crear la sesión de pago de pasarela (simulada hoy)
    let referenciaPago = null;
    if (ES_PASARELA) {
      const sesion = crearSesionPago({ monto: total, metodo_pago });
      referenciaPago = sesion.referencia;
      await client.query(
        `INSERT INTO pagos (id_pedido, metodo_pago, monto, referencia, estado)
         VALUES ($1, $2, $3, $4, 'pendiente')`,
        [id_pedido, metodo_pago, total, referenciaPago]
      );
    }

    // Insertar detalle y descontar stock
    for (const p of productosConPrecio) {
      const subtotal = p.precio_unitario * p.cantidad;

      await client.query(
        `INSERT INTO detalle_pedidos (id_pedido, id_producto, id_formato, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id_pedido, p.id_producto, p.id_formato, p.cantidad, p.precio_unitario, subtotal]
      );

      await client.query(
        `UPDATE productos
         SET stock = stock - $1
         WHERE id_producto = $2`,
        [p.cantidad, p.id_producto]
      );

      // Stock fino: descontar también la bolsa/presentación elegida
      if (p.id_formato) {
        await client.query(
          `UPDATE formatos_producto SET stock = stock - $1 WHERE id_formato = $2`,
          [p.cantidad, p.id_formato]
        );
      }
    }

    // El cupón de este pedido se consume cuando el pago se confirma
    // (pasarela aprobada o marca manual del panel), no al crear el pedido:
    // así, si el pago falla, el cliente no pierde su cupón.

    await client.query("COMMIT");

    // Nota: los puntos de lealtad (1 punto por cada $1.000) se otorgan cuando el
    // PAGO se confirma (POST /api/pagos/:referencia/procesar o el empleado marca
    // el pago), no al crear el pedido: así no se regalan puntos por pedidos que
    // luego son rechazados o fallan en el pago.

    res.status(201).json({
      ok: true,
      data: {
        id_pedido,
        numero_pedido: formatearNumeroPedido(id_pedido),
        estado: estadoInicial,
        estado_pago: estadoPagoInicial,
        operacion,
        sector_envio: sector,
        total,
        pago: referenciaPago ? { referencia: referenciaPago, metodo_pago } : null,
        puntos_pendientes: esJuridica ? 0 : Math.floor(total / 1000),
        descuento_productos: productosConPrecio.reduce((acc, p) => acc + (p.precio_base - p.precio_unitario) * p.cantidad, 0),
        descuento_empresa: esJuridica && descuentoEmpresaPct > 0,
        ...(premioActivo && {
          descuento_ganado: true,
          descuento_fuente: 'premio',
          unidades_acumuladas: acumuladoPrevio,
        }),
        ...(!premioActivo && { unidades_acumuladas: acumuladoPrevio }),
        ...(cupon && {
          descuento_aplicado: descuentoCuponMonto,
          descuento_fuente: 'cupon',
          codigo_cupon: cupon.codigo,
        }),
      },
      mensaje:
        estadoPagoInicial === "pendiente_verificacion"
          ? "Pedido creado. Tu pago está pendiente de verificación por el equipo."
          : metodo_pago === "contra_entrega"
            ? "Pedido creado. Pagas al recibir."
            : "Pedido creado. Completa tu pago para confirmarlo."
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creando pedido:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "Error interno al crear el pedido"
    });

  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// GET /api/pedidos/:id
// ─────────────────────────────────────────
export const obtenerPedido = async (req, res) => {

  const { id } = req.params;

  // Validar que el id sea un número
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({
      ok: false,
      mensaje: "El id del pedido debe ser un número"
    });
  }

  try {
    const pedido = await pool.query(
      `SELECT 
         p.*,
         c.nombre,
         c.apellido,
         c.email
       FROM pedidos p
       JOIN clientes c ON p.id_cliente = c.id_cliente
       WHERE p.id_pedido = $1`,
      [id]
    );

    if (pedido.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Pedido no encontrado"
      });
    }

    const esAdmin = !!req.usuario?.rol;
    const esDueno = req.usuario?.id === pedido.rows[0].id_cliente;
    if (!esAdmin && !esDueno) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tienes permiso para ver este pedido"
      });
    }

      const detalle = await pool.query(
        `SELECT 
          dp.*,
          pr.nombre AS producto_nombre,
          pr.presentacion,
          pr.id_lote
        FROM detalle_pedidos dp
        JOIN productos pr ON dp.id_producto = pr.id_producto
        WHERE dp.id_pedido = $1`,
        [id]
      );

    res.status(200).json({
      ok: true,
      data: {
        ...pedido.rows[0],
        numero_pedido: formatearNumeroPedido(pedido.rows[0].id_pedido),
        productos: detalle.rows
      }
    });

  } catch (error) {
    console.error("Error obteniendo pedido:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "Error interno al obtener el pedido"
    });
  }
};
// GET /api/pedidos/cliente/:id_cliente
export const obtenerPedidosCliente = async (req, res) => {
  const { id_cliente } = req.params

  if (Number.isNaN(Number(id_cliente))) {
    return res.status(400).json({
      ok: false,
      mensaje: "El id del cliente debe ser un número"
    })
  }

  const esAdmin = !!req.usuario?.rol;
  const esDueno = req.usuario?.id === Number(id_cliente);
  if (!esAdmin && !esDueno) {
    return res.status(403).json({
      ok: false,
      mensaje: "No tienes permiso para ver estos pedidos"
    })
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const offset = (page - 1) * limit;
  const q = String(req.query.q || "").trim();

  try {
    const [resultado, total] = await Promise.all([
      pool.query(
        `SELECT 
           p.id_pedido,
           p.fecha_pedido,
           p.estado,
           p.estado_pago,
           p.metodo_pago,
           p.direccion_envio,
           p.ciudad_envio,
           p.operacion,
           p.sector_envio,
           p.total
         FROM pedidos p
         WHERE p.id_cliente = $1
           AND (
             $4::text = ''
             OR p.id_pedido::text ILIKE '%' || $4 || '%'
             OR EXISTS (
               SELECT 1 FROM detalle_pedidos dp
               JOIN productos pr ON pr.id_producto = dp.id_producto
               WHERE dp.id_pedido = p.id_pedido
                 AND (pr.nombre ILIKE '%' || $4 || '%' OR pr.descripcion ILIKE '%' || $4 || '%')
             )
           )
         ORDER BY p.fecha_pedido DESC
         LIMIT $2 OFFSET $3`,
        [id_cliente, limit, offset, q]
      ),
      pool.query(
        `SELECT COUNT(*)
         FROM pedidos p
         WHERE p.id_cliente = $1
           AND (
             $2::text = ''
             OR p.id_pedido::text ILIKE '%' || $2 || '%'
             OR EXISTS (
               SELECT 1 FROM detalle_pedidos dp
               JOIN productos pr ON pr.id_producto = dp.id_producto
               WHERE dp.id_pedido = p.id_pedido
                 AND (pr.nombre ILIKE '%' || $2 || '%' OR pr.descripcion ILIKE '%' || $2 || '%')
             )
           )`,
        [id_cliente, q]
      )
    ])

    const totalRows = Number(total.rows[0].count);
    const totalPages = Math.ceil(totalRows / limit);

    const filas = resultado.rows.map((p) => ({
      ...p,
      numero_pedido: formatearNumeroPedido(p.id_pedido),
    }));

    res.status(200).json({
      ok: true,
      data: filas,
      paginacion: {
        page,
        limit,
        totalRows,
        totalPages,
      }
    })

  } catch (error) {
    console.error("Error obteniendo pedidos del cliente:", error.message)
    res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los pedidos"
    })
  }
};