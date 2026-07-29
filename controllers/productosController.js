import pool from "../config/db.js";

// GET /api/productos
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
    `);

    res.status(200).json({
      ok: true,
      data: resultado.rows
    });

  } catch (error) {
    console.error("Error obteniendo productos:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los productos"
    });
  }
};