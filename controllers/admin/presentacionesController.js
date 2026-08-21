import pool from "../../config/db.js"

const listarPresentaciones = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id_presentacion, nombre, kg_equivalente, activo FROM presentaciones_catalogo ORDER BY kg_equivalente`
    )
    res.json({ ok: true, presentaciones: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const crearPresentacion = async (req, res) => {
  try {
    const { nombre, kg_equivalente } = req.body
    if (!nombre || !kg_equivalente || Number(kg_equivalente) <= 0) {
      return res.status(400).json({ ok: false, error: "Nombre y kg equivalente son obligatorios" })
    }
    const result = await pool.query(
      `INSERT INTO presentaciones_catalogo (nombre, kg_equivalente) VALUES ($1, $2) RETURNING id_presentacion`,
      [nombre.trim(), Number(kg_equivalente)]
    )
    res.json({ ok: true, id: result.rows[0].id_presentacion })
  } catch (error) {
    console.error(error)
    if (error.code === "23505") return res.status(400).json({ ok: false, error: "Ya existe una presentación con ese nombre" })
    res.status(500).json({ ok: false, error: error.message })
  }
}

const actualizarPresentacion = async (req, res) => {
  try {
    const { id } = req.params
    const { nombre, kg_equivalente, activo } = req.body
    const result = await pool.query(
      `UPDATE presentaciones_catalogo SET
         nombre = COALESCE($1, nombre),
         kg_equivalente = COALESCE($2, kg_equivalente),
         activo = COALESCE($3, activo)
       WHERE id_presentacion = $4 RETURNING id_presentacion`,
      [nombre || null, kg_equivalente !== undefined ? Number(kg_equivalente) : null, activo !== undefined ? activo : null, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Presentación no encontrada" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

export { listarPresentaciones, crearPresentacion, actualizarPresentacion }
