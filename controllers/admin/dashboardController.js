import pool from "../../config/db.js"
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const calcCambio = (actual, anterior) => {
  if (anterior == 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - anterior) / anterior) * 100);
};

const getResumen = async (req, res) => {
  try {
    const ingresos = await pool.query(`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE date_trunc('month', fecha_pedido) = date_trunc('month', CURRENT_DATE)), 0) AS actual,
        COALESCE(SUM(total) FILTER (WHERE date_trunc('month', fecha_pedido) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')), 0) AS anterior
      FROM pedidos
    `);

    const ventasUnidades = await pool.query(`
      SELECT
        COALESCE(SUM(dp.cantidad) FILTER (WHERE date_trunc('month', p.fecha_pedido) = date_trunc('month', CURRENT_DATE)), 0) AS actual,
        COALESCE(SUM(dp.cantidad) FILTER (WHERE date_trunc('month', p.fecha_pedido) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')), 0) AS anterior
      FROM detalle_pedidos dp
      JOIN pedidos p ON p.id_pedido = dp.id_pedido
    `);

    const clientesActivos = await pool.query(`
      SELECT COUNT(*) AS total FROM clientes WHERE estado = 'activo'
    `);

    const clientesNuevos = await pool.query(`
      SELECT COUNT(*) AS total FROM clientes
      WHERE date_trunc('month', fecha_registro) = date_trunc('month', CURRENT_DATE)
    `);

    const facturas = await pool.query(`
      SELECT COUNT(*) AS total FROM facturas
      WHERE date_trunc('month', fecha_emision) = date_trunc('month', CURRENT_DATE)
    `);

    const grafica = await pool.query(`
      SELECT EXTRACT(MONTH FROM fecha_pedido) AS mes_num, SUM(total) AS total
      FROM pedidos
      WHERE fecha_pedido >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY mes_num ORDER BY mes_num
    `);

    const productos = await pool.query(`
      SELECT pr.nombre, pr.imagen_url, l.finca, l.variedad,
        SUM(dp.cantidad) AS vendidos, SUM(dp.subtotal) AS total
      FROM detalle_pedidos dp
      JOIN pedidos p ON p.id_pedido = dp.id_pedido
      JOIN productos pr ON pr.id_producto = dp.id_producto
      LEFT JOIN lotes l ON l.id_lote = pr.id_lote
      WHERE date_trunc('month', p.fecha_pedido) = date_trunc('month', CURRENT_DATE)
      GROUP BY pr.id_producto, l.finca, l.variedad
      ORDER BY total DESC
      LIMIT 3
    `);

    const recientes = await pool.query(`
      SELECT c.nombre, c.apellido, c.email, p.total, p.estado, dp1.producto_nombre
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
      ORDER BY p.fecha_pedido DESC
      LIMIT 5
    `);

    res.json({
      ok: true,
      stats: {
        ingresosTotales: Number(ingresos.rows[0].actual),
        cambioIngresos: calcCambio(ingresos.rows[0].actual, ingresos.rows[0].anterior),
        ventasUnidades: Number(ventasUnidades.rows[0].actual),
        cambioVentasUnidades: calcCambio(ventasUnidades.rows[0].actual, ventasUnidades.rows[0].anterior),
        clientesActivos: Number(clientesActivos.rows[0].total),
        clientesNuevos: Number(clientesNuevos.rows[0].total),
        facturasEmitidas: Number(facturas.rows[0].total)
      },
      ventasMensuales: grafica.rows.map(r => ({
        mes: MESES[r.mes_num - 1],
        total: Number(r.total)
      })),
      productosMasVendidos: productos.rows.map(r => ({
        nombre: r.nombre,
        detalle: [r.finca, r.variedad].filter(Boolean).join(' · '),
        imagen: r.imagen_url,
        vendidos: Number(r.vendidos),
        total: Number(r.total)
      })),
      clientesRecientes: recientes.rows.map(r => ({
        nombre: `${r.nombre} ${r.apellido}`,
        email: r.email,
        producto: r.producto_nombre,
        total: Number(r.total),
        estado: r.estado
      }))
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

export { getResumen };