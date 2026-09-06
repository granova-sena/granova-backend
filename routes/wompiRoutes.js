import { Router } from "express"
import {
  consultarTransaccion,
  webhookWompi,
} from "../controllers/wompiController.js"
import { verificarToken } from "../middleware/verificarToken.js"

const router = Router()

// El webhook debe ser público: Wompi lo llama sin sesión.
router.post("/webhook", webhookWompi)

// El resto requiere sesión de cliente (token con id_cliente y email).
router.use(verificarToken)

router.get("/transaccion/:id", consultarTransaccion)

export default router