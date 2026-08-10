import jwt from "jsonwebtoken"

export function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({ error: "Error en la autenticación" })
  }

  const token = authHeader.split(" ")[1]

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = decodificado
    next()
  } catch (error) {
    console.error("Error en verificarToken:", error)
    return res.status(403).json({ error: "Error en la autenticación" })
  }
}