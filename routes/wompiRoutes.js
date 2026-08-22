import { Router } from "express";
import { pagarConNequi,consultarTransaccion, webhookWompi } from "../controllers/wompiController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router()

router.post("/nequi", verificarToken,pagarConNequi)
router.get("/transaccion/:id", verificarToken, consultarTransaccion)
router.post("/webhook", webhookWompi)
export default router