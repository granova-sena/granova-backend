require('dotenv/config')
const { Pool } = require('pg')
;(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  try {
    const promos = await pool.query(`SELECT * FROM promociones ORDER BY id_promocion`)
    console.log('PROMOCIONES:', JSON.stringify(promos.rows, null, 1))
    const pp = await pool.query(`
      SELECT pp.id_promocion, pp.id_producto, p.nombre AS prod_nombre, p.estado AS prod_estado, p.id_lote, p.id_presentacion
      FROM promocion_productos pp LEFT JOIN productos p ON p.id_producto = pp.id_producto
      ORDER BY pp.id_promocion, pp.id_producto`)
    console.log('PROMOCION_PRODUCTOS:', JSON.stringify(pp.rows, null, 1))
    const catalogo = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name IN ('promociones','promocion_productos') ORDER BY table_name, ordinal_position`)
    console.log('COLUMNAS:', JSON.stringify(catalogo.rows.map(r => r.column_name), null, 1))
  } catch (err) { console.error('ERROR', err.message) } finally { await pool.end() }
})()