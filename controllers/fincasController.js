import pool from "../config/db.js"

// GET /fincas - obtener todas las fincas (para el mapa del cliente)
export async function listarFincas(req, res) {
    try {
        const resultado = await pool.query(
            "SELECT id, nombre, lat, lng, altitud, region, estado FROM fincas WHERE estado = 'activa' ORDER BY nombre ASC"
        )
        res.json(resultado.rows)
    } catch (error) {
       console.error("Error al obtener fincas:", error.message)
        res.status(500).json({ error: "Error al obtener fincas" })
    }
}

// POST /inventario/fincas - crear finca (empleado)
export async function crearFinca(req, res) {
    try {
        const { nombre, region, altitud, lat, lng } = req.body
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ ok: false, error: "El nombre es obligatorio" })
        }
        const result = await pool.query(
            `INSERT INTO fincas (nombre, region, altitud, lat, lng, estado)
             VALUES ($1, $2, $3, $4, $5, 'activa') RETURNING id`,
            [nombre.trim(), region || null, altitud || null, lat || null, lng || null]
        )
        res.json({ ok: true, id: result.rows[0].id })
    } catch (error) {
        console.error(error)
        res.status(500).json({ ok: false, error: error.message })
    }
}

// PATCH /inventario/fincas/:id - editar finca (empleado)
export async function actualizarFinca(req, res) {
    try {
        const { id } = req.params
        const { nombre, region, altitud, lat, lng } = req.body
        const result = await pool.query(
            `UPDATE fincas SET nombre = COALESCE($1, nombre), region = COALESCE($2, region),
             altitud = COALESCE($3, altitud), lat = COALESCE($4, lat), lng = COALESCE($5, lng)
             WHERE id = $6 RETURNING id`,
            [nombre || null, region || null, altitud || null, lat || null, lng || null, id]
        )
        if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Finca no encontrada" })
        res.json({ ok: true })
    } catch (error) {
        console.error(error)
        res.status(500).json({ ok: false, error: error.message })
    }
}

// PATCH /inventario/fincas/:id/estado - activar/desactivar finca (empleado)
export async function cambiarEstadoFinca(req, res) {
    try {
        const { id } = req.params
        const { estado } = req.body
        if (!["activa", "inactiva"].includes(estado)) {
            return res.status(400).json({ ok: false, error: "Estado inválido" })
        }
        const result = await pool.query(
            `UPDATE fincas SET estado = $1 WHERE id = $2 RETURNING id`,
            [estado, id]
        )
        if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Finca no encontrada" })
        res.json({ ok: true })
    } catch (error) {
        console.error(error)
        res.status(500).json({ ok: false, error: error.message })
    }
}
