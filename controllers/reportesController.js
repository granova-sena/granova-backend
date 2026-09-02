import pool from "../config/db.js";

// Traduce el período elegido en el frontend a un rango de fechas real.
// 'mes' = este mes calendario, '3meses' = últimos 3 meses, 'anio' = este año.
function rangoPorPeriodo(periodo) {
  switch (periodo) {
    case '3meses':
      return { desde: "CURRENT_DATE - INTERVAL '3 months'", agrupar: 'mes' };
    case 'anio':
      return { desde: "date_trunc('year', CURRENT_DATE)", agrupar: 'mes' };
    case 'mes':
    default:
      return { desde: "date_trunc('month', CURRENT_DATE)", agrupar: 'semana' };
  }
}

// ─────────────────────────────────────────
// GET /api/reportes/ventas?periodo=mes|3meses|anio
// ─────────────────────────────────────────
export const obtenerReportesVentas = async (req, res) => {
  try {
    const { periodo = 'mes' } = req.query
    const { desde, agrupar } = rangoPorPeriodo(periodo)

    // Total ventas del período
    const totalVentas = await pool.query(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM pedidos
      WHERE fecha_pedido >= ${desde} AND lower(estado) != 'cancelado'
    `)

    // Productos vendidos en kg del período
    const productosVendidos = await pool.query(`
      SELECT COALESCE(SUM(dp.cantidad), 0) as total_kg
      FROM detalle_pedidos dp
      JOIN pedidos p ON dp.id_pedido = p.id_pedido
      WHERE fecha_pedido >= ${desde}
      AND lower(p.estado) != 'cancelado'
    `)

    // Clientes únicos del período
    const clientesUnicos = await pool.query(`
      SELECT COUNT(DISTINCT id_cliente) as total
      FROM pedidos
      WHERE fecha_pedido >= ${desde}
      AND lower(estado) != 'cancelado'
    `)

    // Ticket promedio
    const ticketPromedio = await pool.query(`
      SELECT COALESCE(AVG(total), 0) as promedio
      FROM pedidos
      WHERE fecha_pedido >= ${desde}
      AND lower(estado) != 'cancelado'
    `)

    // Tendencia: por semana si el período es "este mes", por mes si es más largo
    const tendencia = agrupar === 'semana'
      ? await pool.query(`
          SELECT
            CEIL(EXTRACT(DAY FROM fecha_pedido) / 7.0) as etiqueta,
            COALESCE(SUM(total), 0) as ventas
          FROM pedidos
          WHERE fecha_pedido >= ${desde}
          AND lower(estado) != 'cancelado'
          GROUP BY etiqueta
          ORDER BY etiqueta
        `)
      : await pool.query(`
          SELECT
            to_char(date_trunc('month', fecha_pedido), 'Mon') as etiqueta,
            date_trunc('month', fecha_pedido) as orden,
            COALESCE(SUM(total), 0) as ventas
          FROM pedidos
          WHERE fecha_pedido >= ${desde}
          AND lower(estado) != 'cancelado'
          GROUP BY etiqueta, orden
          ORDER BY orden
        `)

    // Top productos del período
    const topProductos = await pool.query(`
      SELECT 
        pr.nombre,
        pr.tipo_cafe as categoria,
        SUM(dp.cantidad) as kg_vendidos,
        SUM(dp.subtotal) as total_ventas
      FROM detalle_pedidos dp
      JOIN productos pr ON dp.id_producto = pr.id_producto
      JOIN pedidos p ON dp.id_pedido = p.id_pedido
      WHERE fecha_pedido >= ${desde}
      AND lower(p.estado) != 'cancelado'
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
          semana: agrupar === 'semana' ? `Sem ${r.etiqueta}` : r.etiqueta,
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
      AND lower(estado) != 'cancelado'
    `)

    // Clientes nuevos este mes
    const clientesNuevos = await pool.query(`
      SELECT COUNT(*) as total
      FROM clientes
      WHERE COALESCE(fecha_registro, fecha_creacion) >= NOW() - INTERVAL '30 days'
    `)

    // Frecuencia promedio de compra
    const frecuencia = await pool.query(`
      SELECT ROUND(AVG(total_pedidos), 1) as frecuencia
      FROM (
        SELECT id_cliente, COUNT(*) as total_pedidos
        FROM pedidos
        WHERE fecha_pedido >= NOW() - INTERVAL '30 days'
        AND lower(estado) != 'cancelado'
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
      AND lower(p.estado) != 'cancelado'
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

// ─────────────────────────────────────────
// GET /api/reportes/empleados?page=1&limit=5
// Reportes que el admin ha creado para los empleados (reportes_empleado).
// ─────────────────────────────────────────
export const obtenerReportesEmpleados = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 100)
    const offset = (page - 1) * limit

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reportes_empleado`
    )

    const reportes = await pool.query(
      `SELECT r.id_reporte, r.motivo, r.fecha,
              u1.nombre AS empleado_nombre, u1.apellido AS empleado_apellido,
              u2.nombre AS creado_por_nombre
       FROM reportes_empleado r
       JOIN usuarios u1 ON u1.id_usuario = r.id_empleado
       LEFT JOIN usuarios u2 ON u2.id_usuario = r.creado_por
       ORDER BY r.fecha DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    res.status(200).json({
      ok: true,
      reportes: reportes.rows,
      paginacion: {
        page,
        limit,
        total: total.rows[0].total,
        totalPages: Math.max(Math.ceil(total.rows[0].total / limit), 1),
      },
    })
  } catch (error) {
    console.error("Error obteniendo reportes a empleados:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al obtener reportes a empleados" })
  }
}