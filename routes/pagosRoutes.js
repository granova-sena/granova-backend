import { Router } from "express"
import {
  procesarPago,
  obtenerEstadoPago,
  confirmarPagoWompi,
  webhookWompi,
} from "../controllers/pagosController.js"
import { verificarToken } from "../middleware/verificarToken.js"

const router = Router()

// Webhook de Wompi: PÚBLICO (Wompi no puede mandar nuestro JWT).
// La seguridad va por el checksum del evento, no por token.
router.post("/wompi/webhook", webhookWompi)

router.use(verificarToken)

router.get("/pedido/:id", obtenerEstadoPago)
router.post("/:referencia/procesar", procesarPago)
router.post("/wompi/confirmar", confirmarPagoWompi)

export default router