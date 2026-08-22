import pool from "../config/db.js"

// GET /productos y /api/productos — catálogo del cliente
export const obtenerProductos = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT 
        p.id_producto,
        p.nombre,
        p.descripcion,
        p.tipo_cafe,
        p.presentacion,
        p.precio,
        p.precio_mayorista,
        p.stock,
        p.imagen_url,
        p.estado,
        p.fecha_creacion,
        p.categoria_producto,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id_formato', f.id_formato,
            'etiqueta',   f.etiqueta,
            'peso_kg',    f.peso_kg,
            'precio',     f.precio,
            'imagen_url', f.imagen_url
          ) ORDER BY f.peso_kg)
          FROM formatos_producto f
          WHERE f.id_producto = p.id_producto AND f.activo = true),
          '[]'
        ) AS formatos,
        CASE WHEN pr.id_promocion IS NOT NULL THEN json_build_object(
          'id_promocion', pr.id_promocion,
          'nombre',       pr.nombre,
          'descuento_pct', pr.valor_descuento,
          'fecha_fin',    pr.fecha_fin
        ) ELSE NULL END AS promo
      FROM productos p
      LEFT JOIN promocion_productos pp ON pp.id_producto = p.id_producto
      LEFT JOIN promociones pr ON pr.id_promocion = pp.id_promocion
        AND pr.estado = 'activa'
        AND (pr.fecha_fin IS NULL OR pr.fecha_fin >= CURRENT_DATE)
      WHERE p.estado = 'activo'
      ORDER BY p.nombre ASC
    `)

    const descuentos = await pool.query(
      'SELECT kg_min, kg_max, descuento_pct FROM descuentos_volumen WHERE activo = true ORDER BY kg_min'
    )

    res.status(200).json({
      ok:               true,
      data:             resultado.rows,
      descuentosVolumen: descuentos.rows
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

    if (!id || Number.isNaN(Number(id)) || Number(id) <= 0) {
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

  const idsArray = ids.split(',').map(Number).filter(n => !Number.isNaN(n));

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