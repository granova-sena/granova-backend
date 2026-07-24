import pool from "../config/db.js"

// GET /productos - obtener todos los productos (catálogo del cliente)
export async function listarProductos(req, res) {
    try {
        const resultado = await pool.query(
            "SELECT * FROM productos ORDER BY fecha_creacion DESC"
        )
        res.json(resultado.rows)
    } catch (error) {
        console.error("Error al obtener productos:", error.message)
        res.status(500).json({ error: "Error al obtener productos" })
    }
}

// GET /productos/:id - obtener un producto por id
export async function obtenerProducto(req, res) {
    try {
        const { id } = req.params

        // Validación: el id debe ser un número entero positivo
        if (!id || isNaN(id) || Number(id) <= 0) {
            return res.status(400).json({ error: "El id del producto no es válido" })
        }

        const resultado = await pool.query(
            "SELECT * FROM productos WHERE id_producto = $1",
            [id]
        )

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" })
        }

        res.json(resultado.rows[0])
    } catch (error) {
        console.error("Error al obtener producto:", error.message)
        res.status(500).json({ error: "Error al obtener producto" })
    }
}
