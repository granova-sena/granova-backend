import { Router } from "express"
import { enviarCotizacion } from "../controllers/correoController.js"

const router = Router()

// POST /api/correo/cotizacion → envía cotización por correo
router.post("/cotizacion", enviarCotizacion)

export default router