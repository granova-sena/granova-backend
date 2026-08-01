import pool from "../config/db.js";

// ─────────────────────────────────────────
// GET /api/reportes/ventas
// ─────────────────────────────────────────
export const obtenerReportesVentas = async (req, res) => {
  try {
    // Total ventas del mes actual
    const totalVentas = await pool.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM pedidos
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'      AND estado != 'cancelado'
    `)

    // Productos vendidos en kg del mes
    const productosVendidos = await pool.query(`
      SELECT COALESCE(SUM(dp.cantidad), 0) as total_kg
      FROM detalle_pedidos dp
      JOIN pedidos p ON dp.id_pedido = p.id_pedido
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
      AND p.estado != 'cancelado'
    `)

    // Clientes únicos del mes
    const clientesUnicos = await pool.query(`
      SELECT COUNT(DISTINCT id_cliente) as total
      FROM pedidos
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
      AND estado != 'cancelado'
    `)

    // Ticket promedio
    const ticketPromedio = await pool.query(`
      SELECT COALESCE(AVG(total), 0) as promedio
      FROM pedidos
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
      AND estado != 'cancelado'
    `)

    // Tendencia por semana del mes actual
    const tendencia = await pool.query(`
      SELECT 
        CEIL(EXTRACT(DAY FROM fecha_pedido) / 7.0) as semana,
        COALESCE(SUM(total), 0) as ventas
      FROM pedidos
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
      AND estado != 'cancelado'
      GROUP BY semana
      ORDER BY semana
    `)

    // Top productos del mes
    const topProductos = await pool.query(`
      SELECT 
        pr.nombre,
        pr.tipo_cafe as categoria,
        SUM(dp.cantidad) as kg_vendidos,
        SUM(dp.subtotal) as total_ventas
      FROM detalle_pedidos dp
      JOIN productos pr ON dp.id_producto = pr.id_producto
      JOIN pedidos p ON dp.id_pedido = p.id_pedido
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
      AND p.estado != 'cancelado'
      GROUP BY pr.id_producto, pr.nombre, pr.tipo_cafe
      ORDER BY kg_vendidos DESC
      LIMIT 5
    `)

    res.status(200).json({
      ok: true,
      data: {
        resumen: {
          total_ventas: Number(totalVentas.rows[0].total),
          productos_vendidos: Number(productosVendidos.rows[0].total_kg),
          clientes_unicos: Number(clientesUnicos.rows[0].total),
          ticket_promedio: Number(ticketPromedio.rows[0].promedio),
        },
        tendencia: tendencia.rows.map(r => ({
          semana: `Sem ${r.semana}`,
          ventas: Number(r.ventas)
        })),
        top_productos: topProductos.rows
      }
    })

  } catch (error) {
    console.error("Error obteniendo reportes:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al obtener reportes" })
  }
}

// ─────────────────────────────────────────
// GET /api/reportes/clientes
// ─────────────────────────────────────────
export const obtenerAnalisisClientes = async (req, res) => {
  try {
    // Total clientes activos
    const clientesActivos = await pool.query(`
      SELECT COUNT(DISTINCT id_cliente) as total
      FROM pedidos
      WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
      AND estado != 'cancelado'
    `)

    // Clientes nuevos este mes
    const clientesNuevos = await pool.query(`
      SELECT COUNT(*) as total
      FROM clientes
      WHERE fecha_registro >= NOW() - INTERVAL '30 days'
    `)

    // Frecuencia promedio de compra
    const frecuencia = await pool.query(`
      SELECT ROUND(AVG(total_pedidos), 1) as frecuencia
      FROM (
        SELECT id_cliente, COUNT(*) as total_pedidos
        FROM pedidos
        WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
        AND estado != 'cancelado'
        GROUP BY id_cliente
      ) sub
    `)

    // Top clientes
    const topClientes = await pool.query(`
      SELECT 
        c.id_cliente,
        c.nombre,
        c.apellido,
        c.email,
        COUNT(p.id_pedido) as total_compras,
        COALESCE(SUM(p.total), 0) as total_gastado
      FROM clientes c
      LEFT JOIN pedidos p ON c.id_cliente = p.id_cliente
      AND p.estado != 'cancelado'
      GROUP BY c.id_cliente, c.nombre, c.apellido, c.email
      ORDER BY total_gastado DESC
      LIMIT 5
    `)

    res.status(200).json({
      ok: true,
      data: {
        stats: {
          clientes_activos: Number(clientesActivos.rows[0].total),
          clientes_nuevos: Number(clientesNuevos.rows[0].total),
          frecuencia_promedio: Number(frecuencia.rows[0].frecuencia) || 0,
        },
        top_clientes: topClientes.rows
      }
    })

  } catch (error) {
    console.error("Error obteniendo análisis de clientes:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al obtener análisis de clientes" })
  }
}