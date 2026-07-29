import pool from "../config/db.js"

// GET /fincas - obtener todas las fincas (para el mapa del cliente)
export async function listarFincas(req, res) {
    try {
        const resultado = await pool.query(
            "SELECT id, nombre, lat, lng, altitud, region FROM fincas ORDER BY nombre ASC"
        )
        res.json(resultado.rows)
    } catch (error) {
       console.error("Error al obtener fincas:", error.message)
        res.status(500).json({ error: "Error al obtener fincas" })
    }
}
