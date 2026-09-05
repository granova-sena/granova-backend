import pool from "../config/db.js";

// GET /api/promociones — campañas activas con sus productos
// Las usa la página Promociones del cliente (todo lo que se anuncia,
// de verdad está activo en la BD — cero promociones fantasma).
export const obtenerPromocionesActivas = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.id_promocion, p.nombre, p.valor_descuento AS descuento_pct, p.fecha_inicio, p.fecha_fin,
              COALESCE(array_agg(pr.nombre ORDER BY pr.nombre) FILTER (WHERE pr.id_producto IS NOT NULL), '{}') AS productos
       FROM promociones p
       LEFT JOIN promocion_productos pp ON pp.id_promocion = p.id_promocion
       LEFT JOIN productos pr ON pr.id_producto = pp.id_producto
       WHERE p.estado = 'activa' AND CURRENT_DATE BETWEEN p.fecha_inicio AND p.fecha_fin
       GROUP BY p.id_promocion
       ORDER BY p.fecha_fin ASC`
    );

    res.status(200).json({
      ok: true,
      data: resultado.rows,
    });

  } catch (error) {
    console.error("Error obteniendo promociones:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener las promociones" });
  }
};
