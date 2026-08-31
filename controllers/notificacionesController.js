import pool from "../config/db.js"

// GET /api/notificaciones — últimas notificaciones del cliente (30 máx)
export const obtenerNotificaciones = async (req, res) => {
  const id_cliente = req.usuario?.id;
  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión" });
  }

  try {
    const resultado = await pool.query(
      `SELECT id_notificacion, tipo, titulo, mensaje, id_pedido, leida, fecha
       FROM notificaciones
       WHERE id_cliente = $1
       ORDER BY fecha DESC
       LIMIT 30`,
      [id_cliente]
    );

    const noLeidas = await pool.query(
      `SELECT COUNT(*)::int AS total FROM notificaciones WHERE id_cliente = $1 AND leida = false`,
      [id_cliente]
    );

    res.status(200).json({
      ok: true,
      data: resultado.rows,
      no_leidas: Number(noLeidas.rows[0].total),
    });
  } catch (error) {
    console.error("Error obteniendo notificaciones:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener las notificaciones" });
  }
};

// PATCH /api/notificaciones/:id/leida — marca una notificación como leída
export const marcarLeida = async (req, res) => {
  const id_cliente = req.usuario?.id;
  const { id } = req.params;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión" });
  }
  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "Id de notificación inválido" });
  }

  try {
    const resultado = await pool.query(
      `UPDATE notificaciones SET leida = true WHERE id_notificacion = $1 AND id_cliente = $2 RETURNING id_notificacion`,
      [id, id_cliente]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Notificación no encontrada" });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error marcando notificación:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
};

// PATCH /api/notificaciones/leer-todas — marca todas como leídas
export const marcarTodasLeidas = async (req, res) => {
  const id_cliente = req.usuario?.id;
  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión" });
  }

  try {
    await pool.query(
      `UPDATE notificaciones SET leida = true WHERE id_cliente = $1 AND leida = false`,
      [id_cliente]
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error marcando notificaciones:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno" });
  }
};
