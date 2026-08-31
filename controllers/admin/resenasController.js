import pool from "../../config/db.js"

// ─────────────────────────────────────────
// Frente ADMIN: moderación de reseñas (listar todas + ocultar)
// Solo accesible con rol admin.
// ─────────────────────────────────────────

// GET /api/admin/resenas — todas las reseñas (visibles y ocultas) con cliente y producto
export const listarResenas = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT r.id_resena, r.calificacion, r.comentario, r.fecha_resena, r.visible,
              c.nombre AS cliente_nombre, c.email AS cliente_email,
              pr.id_producto, pr.nombre AS producto_nombre
       FROM resenas r
       JOIN detalle_pedidos dp ON dp.id_detalle = r.id_detalle_pedido
       JOIN pedidos p ON p.id_pedido = dp.id_pedido
       JOIN clientes c ON c.id_cliente = p.id_cliente
       JOIN productos pr ON pr.id_producto = dp.id_producto
       ORDER BY r.fecha_resena DESC`
    );
    res.status(200).json({ ok: true, data: resultado.rows });
  } catch (error) {
    console.error("Error listando reseñas:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al listar reseñas" });
  }
};

// PATCH /api/admin/resenas/:id/visibilidad  { visible: false }
export const moderarResena = async (req, res) => {
  const { id } = req.params;
  const { visible } = req.body;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "Id de reseña inválido" });
  }
  if (typeof visible !== "boolean") {
    return res.status(400).json({ ok: false, mensaje: "Envia visible: true | false" });
  }

  try {
    const resultado = await pool.query(
      `UPDATE resenas SET visible = $1 WHERE id_resena = $2 RETURNING id_resena`,
      [visible, id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Reseña no encontrada" });
    }
    res.json({ ok: true, visible });
  } catch (error) {
    console.error("Error moderando reseña:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al moderar la reseña" });
  }
};
