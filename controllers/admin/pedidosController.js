import pool from "../../config/db.js"

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatearPedido(id) {
  return `#P-${String(id).padStart(5, '0')}`;
}

// Normaliza estados históricos: los pedidos creados desde Registro de ventas
// pueden venir como 'Pendiente' o 'Pagado'. 'Cancelado' (nombre viejo) y
// 'Rechazado' (nombre nuevo) se tratan igual, para no perder pedidos
// rechazados antes de este cambio. Todo insensible a mayúsculas/espacios.
function bucketEstado(estadoCrudo) {
  const estado = normalizar(estadoCrudo);
  if (estado === 'cancelado' || estado === 'rechazado') return 'Rechazado';
  if (estado === 'pendiente') return 'Pendiente';
  return 'Confirmado'; // 'confirmado' o 'pagado'
}

const getResumen = async (req, res) => {
  try {
    const result = await pool.query(`SELECT estado, total FROM pedidos`);

    let pendientes = 0, confirmados = 0, rechazados = 0, totalEnPedidos = 0;
    result.rows.forEach(p => {
      const bucket = bucketEstado(p.estado);
      if (bucket === 'Pendiente') pendientes++;
      if (bucket === 'Confirmado') confirmados++;
      if (bucket === 'Rechazado') rechazados++;
      if (bucket !== 'Rechazado') totalEnPedidos += Number(p.total);
    });

    const totalMesAnterior = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total FROM pedidos
      WHERE lower(estado) NOT IN ('cancelado', 'rechazado')
        AND date_trunc('month', fecha_pedido) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
    `);
    const anterior = Number(totalMesAnterior.rows[0].total);
    let cambio;
if (anterior === 0) {
    cambio = totalEnPedidos > 0 ? 100 : 0;
} else {
    cambio = Math.round(((totalEnPedidos - anterior) / anterior) * 100);
}

    res.json({
      ok: true,
      pendientes,
      confirmados,
      rechazados,
      cancelados: rechazados, // alias por compatibilidad con el frontend viejo
      total: result.rows.length,
      totalEnPedidos,
      cambioTotal: cambio
    });
  } catch (error) {
    console.error('Error en getResumen (pedidos):', error);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el resumen de pedidos.' });
  }
};

const getPedidos = async (req, res) => {
  try {
    const { tab = 'Todos', search = '', page = 1, limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT
        p.id_pedido, p.fecha_pedido, p.estado, p.total,
        c.nombre, c.apellido, c.email,
        dp1.producto_nombre,
        dp_sum.cantidad_total
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN LATERAL (
        SELECT pr.nombre AS producto_nombre
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

    let pedidos = result.rows.map(p => ({
      id: p.id_pedido,
      pedido: formatearPedido(p.id_pedido),
      cliente: `${p.nombre} ${p.apellido}`,
      email: p.email,
      producto: p.producto_nombre || 'Sin producto',
      cantidad: Number(p.cantidad_total) || 0,
      total: Number(p.total),
      estado: bucketEstado(p.estado),
      fecha: p.fecha_pedido,
    }));

    if (tab !== 'Todos') {
      const tabAEstado = { Pendientes: 'Pendiente', Confirmados: 'Confirmado', Rechazados: 'Rechazado' };
      pedidos = pedidos.filter(p => p.estado === tabAEstado[tab]);
    }

    if (search) {
      const q = normalizar(search);
      pedidos = pedidos.filter(p =>
        normalizar(p.cliente).includes(q) ||
        normalizar(p.producto).includes(q) ||
        normalizar(p.pedido).includes(q)
      );
    }

    const totalFiltrados = pedidos.length;
    const start = (Number(page) - 1) * Number(limit);
    const pagina = pedidos.slice(start, start + Number(limit));

    res.json({
      ok: true,
      pedidos: pagina,
      totalFiltrados,
      page: Number(page),
      totalPaginas: Math.max(Math.ceil(totalFiltrados / Number(limit)), 1)
    });
  } catch (error) {
    console.error('Error en getPedidos:', error);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el listado de pedidos.' });
  }
};

// Trae todo lo necesario para armar la factura: cliente, items y datos de la factura.
const getPedidoDetalle = async (req, res) => {
  try {
    const { id } = req.params;

    const pedidoResult = await pool.query(`
      SELECT p.id_pedido, p.fecha_pedido, p.estado, p.total, p.metodo_pago, p.motivo_rechazo,
             c.nombre, c.apellido, c.email,
             f.numero_factura, f.fecha_emision, f.subtotal, f.impuestos
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
      WHERE p.id_pedido = $1
    `, [id]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }

    const itemsResult = await pool.query(`
      SELECT pr.nombre, dp.cantidad, dp.precio_unitario, dp.subtotal
      FROM detalle_pedidos dp
      JOIN productos pr ON pr.id_producto = dp.id_producto
      WHERE dp.id_pedido = $1
      ORDER BY dp.id_detalle
    `, [id]);

    const p = pedidoResult.rows[0];

    res.json({
      ok: true,
      pedido: {
        id: p.id_pedido,
        pedido: formatearPedido(p.id_pedido),
        fecha: p.fecha_pedido,
        estado: bucketEstado(p.estado),
        metodo_pago: p.metodo_pago,
        motivo_rechazo: p.motivo_rechazo || null,
        cliente: `${p.nombre} ${p.apellido}`,
        email: p.email,
        numero_factura: p.numero_factura || formatearPedido(p.id_pedido),
        fecha_emision: p.fecha_emision || p.fecha_pedido,
        subtotal: Number(p.subtotal ?? p.total),
        impuestos: Number(p.impuestos ?? 0),
        total: Number(p.total),
        items: itemsResult.rows.map(it => ({
          nombre: it.nombre,
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
          subtotal: Number(it.subtotal),
        })),
      }
    });
  } catch (error) {
    console.error('Error en getPedidoDetalle:', error);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el detalle del pedido.' });
  }
};

const aceptarPedido = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json({ ok: false, error: 'Id de pedido inválido.' });
    }

    const actual = await pool.query(`SELECT estado FROM pedidos WHERE id_pedido = $1`, [id]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }
    if (bucketEstado(actual.rows[0].estado) !== 'Pendiente') {
      return res.status(400).json({ ok: false, error: 'Solo se pueden aceptar pedidos pendientes.' });
    }

    await pool.query(`UPDATE pedidos SET estado = 'Confirmado' WHERE id_pedido = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error en aceptarPedido:', error);
    res.status(500).json({ ok: false, error: 'No se pudo aceptar el pedido.' });
  }
};

// Rechaza el pedido, guarda el motivo (máx. 500 caracteres) y devuelve el
// stock reservado a los productos.
const cancelarPedido = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const motivo = String(req.body?.motivo || '').trim();

    if (!id || isNaN(id)) {
      client.release();
      return res.status(400).json({ ok: false, error: 'Id de pedido inválido.' });
    }
    if (motivo.length > 500) {
      client.release();
      return res.status(400).json({ ok: false, error: 'El motivo no puede tener más de 500 caracteres.' });
    }

    await client.query('BEGIN');

    const actual = await client.query(`SELECT estado FROM pedidos WHERE id_pedido = $1 FOR UPDATE`, [id]);
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }
    if (bucketEstado(actual.rows[0].estado) !== 'Pendiente') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Solo se pueden rechazar pedidos pendientes.' });
    }

    const items = await client.query(`SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1`, [id]);
    for (const item of items.rows) {
      await client.query(`UPDATE productos SET stock = stock + $1 WHERE id_producto = $2`, [item.cantidad, item.id_producto]);
    }

    await client.query(
      `UPDATE pedidos SET estado = 'Rechazado', motivo_rechazo = $1 WHERE id_pedido = $2`,
      [motivo || null, id]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en cancelarPedido (rechazo):', error);

    // Si la columna motivo_rechazo todavía no existe en la BD, avisamos claro.
    if (error.code === '42703') {
      return res.status(500).json({
        ok: false,
        error: 'Falta la columna motivo_rechazo en la tabla pedidos. Corre el ALTER TABLE que te indicaron.'
      });
    }
    res.status(500).json({ ok: false, error: 'No se pudo rechazar el pedido.' });
  } finally {
    client.release();
  }
};

export { getResumen, getPedidos, getPedidoDetalle, aceptarPedido, cancelarPedido };
