import { Router } from "express"
import {
  pagarConNequi,
  crearPagoTarjeta,
  pagarConPSE,
  listarBancos,
  consultarTransaccion,
  webhookWompi,
} from "../controllers/wompiController.js"
import { verificarToken } from "../middleware/verificarToken.js"

const router = Router()

// El webhook debe ser público: Wompi lo llama sin sesión.
router.post("/webhook", webhookWompi)

// El resto requiere sesión de cliente (token con id_cliente y email).
router.use(verificarToken)

router.post("/nequi", pagarConNequi)
router.post("/tarjeta", crearPagoTarjeta)
router.post("/pse", pagarConPSE)
router.get("/pse/bancos", listarBancos)
router.get("/transaccion/:id", consultarTransaccion)

export default router