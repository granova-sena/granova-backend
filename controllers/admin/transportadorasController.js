import pool from "../../config/db.js"

// Imagen de referencia según el tipo de vehículo, para que cada transportadora
// muestre "el tipo que es" y no una imagen estática.
const IMAGEN_POR_VEHICULO = {
  'Moto':       "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=60",
  'Carro':      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=400&q=60",
  'Camioneta':  "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60",
  'Camión':     "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60",
}
const IMAGEN_DEFAULT = IMAGEN_POR_VEHICULO['Camión']

function imagenPorVehiculo(vehiculo, tipo) {
  const v = String(vehiculo || '').trim()
  if (IMAGEN_POR_VEHICULO[v]) return IMAGEN_POR_VEHICULO[v]
  return tipo === 'Reparto' ? IMAGEN_POR_VEHICULO['Moto'] : IMAGEN_DEFAULT
}

const listarTransportadoras = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id_transportadora, t.tipo_persona, t.nombre, t.telefono, t.tipo,
             t.placa, t.nit, t.vehiculos, t.tipo_vehiculo, t.capacidad_kg, t.estado, t.imagen_url, t.fecha_creacion,
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
    const { tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url } = req.body
    if (!nombre?.trim() || !telefono?.trim()) {
      return res.status(400).json({ ok: false, error: "Nombre y teléfono son obligatorios" })
    }
    if (!['Acarreo', 'Reparto'].includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'El tipo debe ser "Acarreo" o "Reparto"' })
    }
    if (tipo_persona && !['persona_natural', 'persona_juridica'].includes(tipo_persona)) {
      return res.status(400).json({ ok: false, error: 'tipo_persona debe ser "persona_natural" o "persona_juridica"' })
    }
    if (capacidad_kg != null && (!Number.isFinite(Number(capacidad_kg)) || Number(capacidad_kg) <= 0)) {
      return res.status(400).json({ ok: false, error: "capacidad_kg debe ser un número mayor que 0" })
    }
    if (tipo_persona === 'persona_natural' && !placa?.trim()) {
      return res.status(400).json({ ok: false, error: "Ingresa la placa del vehículo" })
    }
    if (tipo_persona === 'persona_juridica' && !nit?.trim()) {
      return res.status(400).json({ ok: false, error: "Ingresa el NIT de la empresa" })
    }
    const imagen = String(imagen_url || '').trim() || imagenPorVehiculo(tipo_vehiculo, tipo)
    const result = await pool.query(
      `INSERT INTO transportadoras (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id_transportadora`,
      [tipo_persona, nombre.trim(), telefono.trim(), tipo, placa || null, nit || null, vehiculos || 0, tipo_vehiculo || null, capacidad_kg != null ? Number(capacidad_kg) : null, imagen, req.usuario.id]
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
    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: "El id de la transportadora debe ser un número" })
    }
    const { tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url } = req.body
    if (tipo && !['Acarreo', 'Reparto'].includes(tipo)) {
      return res.status(400).json({ ok: false, error: 'El tipo debe ser "Acarreo" o "Reparto"' })
    }
    if (tipo_persona && !['persona_natural', 'persona_juridica'].includes(tipo_persona)) {
      return res.status(400).json({ ok: false, error: 'tipo_persona debe ser "persona_natural" o "persona_juridica"' })
    }
    if (capacidad_kg != null && (!Number.isFinite(Number(capacidad_kg)) || Number(capacidad_kg) <= 0)) {
      return res.status(400).json({ ok: false, error: "capacidad_kg debe ser un número mayor que 0" })
    }
    const result = await pool.query(
      `UPDATE transportadoras SET
         tipo_persona = COALESCE($1, tipo_persona), nombre = COALESCE($2, nombre),
         telefono = COALESCE($3, telefono), tipo = COALESCE($4, tipo),
         placa = $5, nit = $6, vehiculos = COALESCE($7, vehiculos),
         tipo_vehiculo = COALESCE($8, tipo_vehiculo),
         capacidad_kg = COALESCE($9, capacidad_kg),
         imagen_url = CASE WHEN NULLIF($10, '') IS NOT NULL THEN $10 ELSE imagen_url END
       WHERE id_transportadora = $11 RETURNING id_transportadora`,
      [tipo_persona || null, nombre || null, telefono || null, tipo || null,
       placa || null, nit || null, vehiculos ?? null,
       tipo_vehiculo || null, capacidad_kg != null ? Number(capacidad_kg) : null,
       String(imagen_url || '').trim() || null, id]
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
    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: "El id de la transportadora debe ser un número" })
    }
    const enUso = await pool.query(`SELECT 1 FROM envios WHERE id_transportadora = $1 LIMIT 1`, [id])
    if (enUso.rows.length > 0) {
      return res.status(400).json({ ok: false, error: "No se puede eliminar: tiene envíos asociados." })
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
