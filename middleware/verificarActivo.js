import pool from "../config/db.js"

// El JWT dura 2 horas y no sabe si al empleado/logistica lo bloquearon a mitad
// de turno. Este middleware sí vuelve a preguntarle a la base de datos.
export async function verificarActivo(req, res, next) {
  if (!["empleado", "logistica"].includes(req.usuario?.rol)) return next()
  try {
    const result = await pool.query(`SELECT estado FROM usuarios WHERE id_usuario = $1`, [req.usuario.id])
    if (result.rows.length === 0 || result.rows[0].estado === "bloqueado" || result.rows[0].estado === "eliminado") {
      return res.status(403).json({ error: "Tu cuenta fue bloqueada o eliminada, contacta al administrador" })
    }
    next()
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: "Error verificando el estado de la cuenta" })
  }
}
