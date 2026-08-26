import pool from "../../config/db.js"

const listarEnvios = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id_envio, e.numero_guia, e.producto, e.peso, e.origen, e.destino,
             e.destinatario, e.fecha_estimada, e.estado, e.fecha_creacion,
             t.id_transportadora, t.nombre AS transportadora_nombre, t.placa
      FROM envios e
      LEFT JOIN transportadoras t ON t.id_transportadora = e.id_transportadora
      ORDER BY e.fecha_creacion DESC
    `)
    res.json({ ok: true, envios: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

async function siguienteGuia() {
  const result = await pool.query(`
    SELECT numero_guia FROM envios
    ORDER BY id_envio DESC LIMIT 1
  `)
  if (result.rows.length === 0) return '#ORV-0001'
  const n = parseInt(String(result.rows[0].numero_guia).replace(/\D/g, ''), 10) || 0
  return `#ORV-${String(n + 1).padStart(4, '0')}`
}

const crearEnvio = async (req, res) => {
  try {
    const { producto, peso, origen, destino, id_transportadora, destinatario, fecha_estimada, estado } = req.body
    if (!producto?.trim() || !peso || !origen?.trim() || !destino?.trim() || !destinatario?.trim() || !fecha_estimada) {
      return res.status(400).json({ ok: false, error: "Completa producto, peso, origen, destino, destinatario y fecha estimada" })
    }
    const numero_guia = await siguienteGuia()
    const result = await pool.query(
      `INSERT INTO envios (numero_guia, producto, peso, origen, destino, id_transportadora, destinatario, fecha_estimada, estado, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_envio, numero_guia`,
      [numero_guia, producto.trim(), Number(peso), origen.trim(), destino.trim(),
       id_transportadora || null, destinatario.trim(), fecha_estimada, estado || 'Preparando', req.usuario.id]
    )
    res.json({ ok: true, id: result.rows[0].id_envio, numero_guia: result.rows[0].numero_guia })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const actualizarEnvio = async (req, res) => {
  try {
    const { id } = req.params
    const { producto, peso, origen, destino, id_transportadora, destinatario, fecha_estimada, estado } = req.body
    const result = await pool.query(
      `UPDATE envios SET
         producto = COALESCE($1, producto), peso = COALESCE($2, peso),
         origen = COALESCE($3, origen), destino = COALESCE($4, destino),
         id_transportadora = $5, destinatario = COALESCE($6, destinatario),
         fecha_estimada = COALESCE($7, fecha_estimada), estado = COALESCE($8, estado)
       WHERE id_envio = $9 RETURNING id_envio`,
      [producto || null, peso ? Number(peso) : null, origen || null, destino || null,
       id_transportadora || null, destinatario || null, fecha_estimada || null, estado || null, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Envío no encontrado" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const eliminarEnvio = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(`DELETE FROM envios WHERE id_envio = $1 RETURNING id_envio`, [id])
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Envío no encontrado" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

export { listarEnvios, crearEnvio, actualizarEnvio, eliminarEnvio }
