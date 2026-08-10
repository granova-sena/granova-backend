export function verificarAdmin(req, res, next) {
    if (req.usuario?.rol !== "admin") {
        return res.status(403).json({ error: "No tienes permisos de administrador" })
    }
    next()
}