import jwt from "jsonwebtoken"

export function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: "No tienes Vivre Card, no puedes pasar 🏴‍☠️" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = decodificado
    next()
  } catch (error) {
    return res.status(403).json({ error: "Vivre Card inválido o expirado 💀" })
  }
}