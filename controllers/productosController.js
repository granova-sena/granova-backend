import pool from "../config/db.js"

// GET /productos y /api/productos — catálogo del cliente
export const obtenerProductos = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT 
        id_producto,
        nombre,
        descripcion,
        tipo_cafe,
        presentacion,
        precio,
        stock,
        imagen_url,
        estado,
        fecha_creacion
      FROM productos
      WHERE estado = 'activo'
      ORDER BY nombre ASC
    `)

    res.status(200).json({
      ok:   true,
      data: resultado.rows
    })

  } catch (error) {
    console.error("Error obteniendo productos:", error.message)
    res.status(500).json({
      ok:      false,
      mensaje: "Error al obtener los productos"
    })
  }
}

// GET /productos/:id — obtener un producto por id
export const obtenerProducto = async (req, res) => {
  try {
    const { id } = req.params

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