import { Router } from "express"
import { enviarCotizacion } from "../controllers/correoController.js"
import { limitadorPublico } from "../middleware/rateLimiter.js"

const router = Router()

// POST /api/correo/cotizacion → envía cotización por correo
router.post("/cotizacion", limitadorPublico, enviarCotizacion)

export default router