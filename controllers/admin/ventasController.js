import pool from "../../config/db.js"

const calcCambio = (actual, anterior) => {
  if (anterior == 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
};

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
    const { search = '', page = 1, limit = 10 } = req.query;

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
        dp_sum.cantidad_total
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
      LEFT JOIN LATERAL (
        SELECT pr.nombre AS producto_nombre, pr.categoria_producto
        FROM detalle_pedidos dp
        JOIN productos pr ON pr.id_producto = dp.id_producto
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
      SELECT id_cliente, nombre, apellido, email
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
      SELECT id_producto, nombre, precio, stock, categoria_producto
      FROM productos
      WHERE stock > 0
      ORDER BY nombre
    `);
    res.json({ ok: true, productos: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearVenta = async (req, res) => {
  const { id_cliente, metodo_pago, estado, items } = req.body;

  if (!id_cliente || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Selecciona un cliente y al menos un producto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idsProductos = items.map(i => i.id_producto);
    const productosResult = await client.query(
      `SELECT id_producto, nombre, precio, stock FROM productos WHERE id_producto = ANY($1::int[])`,
      [idsProductos]
    );
    const productosMap = {};
    productosResult.rows.forEach(p => { productosMap[p.id_producto] = p; });

    let total = 0;
    const detalles = [];

    for (const item of items) {
      const producto = productosMap[item.id_producto];
      if (!producto) throw new Error(`Producto ${item.id_producto} no existe.`);

      const cantidad = Number(item.cantidad);
      if (!cantidad || cantidad <= 0) throw new Error(`Cantidad inválida para ${producto.nombre}.`);
      if (cantidad > Number(producto.stock)) {
        throw new Error(`Stock insuficiente para ${producto.nombre} (disponible: ${producto.stock}).`);
      }

      const precio_unitario = Number(producto.precio);
      const subtotal = precio_unitario * cantidad;
      total += subtotal;
      detalles.push({ id_producto: producto.id_producto, cantidad, precio_unitario, subtotal });
    }

    // Estados válidos: 'Pendiente' o 'Confirmado' (ya pagado/aceptado).
    const estadoFinal = estado === 'Confirmado' ? 'Confirmado' : 'Pendiente';

    const pedidoResult = await client.query(`
      INSERT INTO pedidos (id_cliente, fecha_pedido, estado, metodo_pago, total)
      VALUES ($1, NOW(), $2, $3, $4)
      RETURNING id_pedido
    `, [id_cliente, estadoFinal, metodo_pago || null, total]);

    const id_pedido = pedidoResult.rows[0].id_pedido;

    for (const d of detalles) {
      await client.query(`
        INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
        VALUES ($1, $2, $3, $4, $5)
      `, [id_pedido, d.id_producto, d.cantidad, d.precio_unitario, d.subtotal]);

      await client.query(`
        UPDATE productos SET stock = stock - $1 WHERE id_producto = $2
      `, [d.cantidad, d.id_producto]);
    }

    const numeroFactura = `F-${String(id_pedido).padStart(5, '0')}`;
    await client.query(`
      INSERT INTO facturas (id_pedido, numero_factura, fecha_emision, subtotal, impuestos, total, estado)
      VALUES ($1, $2, NOW(), $3, 0, $3, $4)
    `, [id_pedido, numeroFactura, total, estadoFinal]);

    await client.query('COMMIT');
    res.json({ ok: true, id_pedido, numero_factura: numeroFactura, total });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
};

export { getResumen, getVentas, getClientes, getProductosDisponibles, crearVenta };