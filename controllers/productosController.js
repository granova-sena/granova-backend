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

// ─────────────────────────────────────────
// GET /productos/comparar?ids=5,9,14
// ─────────────────────────────────────────
export const compararProductos = async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    return res.status(400).json({ ok: false, mensaje: "Debes enviar al menos 2 ids para comparar" });
  }

  const idsArray = ids.split(',').map(Number).filter(n => !isNaN(n));

  if (idsArray.length < 2 || idsArray.length > 3) {
    return res.status(400).json({ ok: false, mensaje: "Puedes comparar entre 2 y 3 productos" });
  }

  try {
    const resultado = await pool.query(
      `SELECT
         p.id_producto, p.nombre, p.tipo_cafe, p.presentacion, p.precio, p.imagen_url,
         COALESCE(r.promedio, 0) AS promedio,
         COALESCE(r.total_resenas, 0) AS total_resenas
       FROM productos p
       LEFT JOIN (
         SELECT dp.id_producto, AVG(re.calificacion) AS promedio, COUNT(*) AS total_resenas
         FROM resenas re
         JOIN detalle_pedidos dp ON dp.id_detalle = re.id_detalle_pedido
         WHERE re.visible = TRUE
         GROUP BY dp.id_producto
       ) r ON r.id_producto = p.id_producto
       WHERE p.id_producto = ANY($1)`,
      [idsArray]
    );

    res.status(200).json({ ok: true, data: resultado.rows });

  } catch (error) {
    console.error("Error comparando productos:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al comparar productos" });
  }
};