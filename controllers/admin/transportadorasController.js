import pool from "../../config/db.js"

const listarTransportadoras = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id_transportadora, t.tipo_persona, t.nombre, t.telefono, t.tipo,
             t.placa, t.nit, t.vehiculos, t.estado, t.fecha_creacion,
             COUNT(e.id_envio)::int AS envios
      FROM transportadoras t
      LEFT JOIN envios e ON e.id_transportadora = t.id_transportadora
      GROUP BY t.id_transportadora
      ORDER BY t.fecha_creacion DESC
    `)
    res.json({ ok: true, transportadoras: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const crearTransportadora = async (req, res) => {
  try {
    const { tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos } = req.body
    if (!nombre?.trim() || !telefono?.trim()) {
      return res.status(400).json({ ok: false, error: "Nombre y teléfono son obligatorios" })
    }
    if (tipo_persona === 'persona_natural' && !placa?.trim()) {
      return res.status(400).json({ ok: false, error: "Ingresa la placa del vehículo" })
    }
    if (tipo_persona === 'persona_juridica' && !nit?.trim()) {
      return res.status(400).json({ ok: false, error: "Ingresa el NIT de la empresa" })
    }
    const result = await pool.query(
      `INSERT INTO transportadoras (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_transportadora`,
      [tipo_persona, nombre.trim(), telefono.trim(), tipo, placa || null, nit || null, vehiculos || 0, req.usuario.id]
    )
    res.json({ ok: true, id: result.rows[0].id_transportadora })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const actualizarTransportadora = async (req, res) => {
  try {
    const { id } = req.params
    const { tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, estado } = req.body
    const result = await pool.query(
      `UPDATE transportadoras SET
         tipo_persona = COALESCE($1, tipo_persona), nombre = COALESCE($2, nombre),
         telefono = COALESCE($3, telefono), tipo = COALESCE($4, tipo),
         placa = $5, nit = $6, vehiculos = COALESCE($7, vehiculos), estado = COALESCE($8, estado)
       WHERE id_transportadora = $9 RETURNING id_transportadora`,
      [tipo_persona || null, nombre || null, telefono || null, tipo || null,
       placa || null, nit || null, vehiculos ?? null, estado || null, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Transportadora no encontrada" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const eliminarTransportadora = async (req, res) => {
  try {
    const { id } = req.params
    const enUso = await pool.query(`SELECT 1 FROM envios WHERE id_transportadora = $1 LIMIT 1`, [id])
    if (enUso.rows.length > 0) {
      return res.status(400).json({ ok: false, error: "No se puede eliminar: tiene envíos asociados. Márcala como Inactiva en su lugar." })
    }
    const result = await pool.query(`DELETE FROM transportadoras WHERE id_transportadora = $1 RETURNING id_transportadora`, [id])
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Transportadora no encontrada" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

export { listarTransportadoras, crearTransportadora, actualizarTransportadora, eliminarTransportadora }
