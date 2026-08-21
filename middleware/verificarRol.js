// Middleware genérico: recibe los roles permitidos para la ruta y valida
// contra req.usuario.rol (ya decodificado por verificarToken).
export function verificarRol(rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: "No tienes permisos para esta acción" })
    }
    next()
  }
}
