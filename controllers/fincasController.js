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
        const nombreFinca = nombre.trim()

        const existente = await pool.query(
            "SELECT id FROM fincas WHERE LOWER(nombre) = LOWER($1) LIMIT 1",
            [nombreFinca]
        )
        if (existente.rows.length > 0) {
            return res.status(400).json({ ok: false, error: "Ya existe una finca con ese nombre" })
        }

        const result = await pool.query(
            `INSERT INTO fincas (nombre, region, altitud, lat, lng, estado)
             VALUES ($1, $2, $3, $4, $5, 'activa') RETURNING id`,
            [nombreFinca, region || null, altitud || null, lat || null, lng || null]
        )
        res.json({ ok: true, id: result.rows[0].id })
    } catch (error) {
        console.error(error)
        if (error.code === "23505") {
            return res.status(400).json({ ok: false, error: "Ya existe una finca con ese nombre" })
        }
        res.status(500).json({ ok: false, error: error.message })
    }
}

// PATCH /inventario/fincas/:id - editar finca (empleado)
export async function actualizarFinca(req, res) {
    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        const { id } = req.params
        const { nombre, region, altitud, lat, lng } = req.body
        const nombreNuevo = nombre && nombre.trim() ? nombre.trim() : null

        const fila = await client.query("SELECT nombre FROM fincas WHERE id = $1 FOR UPDATE", [id])
        if (fila.rows.length === 0) {
            await client.query("ROLLBACK")
            return res.status(404).json({ ok: false, error: "Finca no encontrada" })
        }
        const nombreAnterior = fila.rows[0].nombre

        if (nombreNuevo && nombreNuevo !== nombreAnterior) {
            const duplicado = await client.query(
                "SELECT id FROM fincas WHERE LOWER(nombre) = LOWER($1) AND id <> $2 LIMIT 1",
                [nombreNuevo, id]
            )
            if (duplicado.rows.length > 0) {
                await client.query("ROLLBACK")
                return res.status(400).json({ ok: false, error: "Ya existe una finca con ese nombre" })
            }
        }

        await client.query(
            `UPDATE fincas SET nombre = COALESCE($1, nombre), region = COALESCE($2, region),
             altitud = COALESCE($3, altitud), lat = COALESCE($4, lat), lng = COALESCE($5, lng)
             WHERE id = $6`,
            [nombreNuevo, region || null, altitud || null, lat || null, lng || null, id]
        )

        if (nombreNuevo && nombreNuevo !== nombreAnterior) {
            await client.query(`UPDATE lotes SET finca = $1 WHERE finca = $2`, [nombreNuevo, nombreAnterior])
        }

        await client.query("COMMIT")
        res.json({ ok: true })
    } catch (error) {
        await client.query("ROLLBACK")
        console.error(error)
        res.status(500).json({ ok: false, error: error.message })
    } finally {
        client.release()
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
