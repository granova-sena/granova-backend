import { Router } from "express";
import { pagarConNequi,consultarTransaccion, webhookWompi,crearPagoTarjeta,pagarConPSE, listarBancos} from "../controllers/wompiController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router()

router.post("/nequi", verificarToken,pagarConNequi)
router.get("/transaccion/:id", verificarToken, consultarTransaccion)
router.post("/webhook", webhookWompi)
router.post('/tarjeta', verificarToken, crearPagoTarjeta);
router.get("/pse/bancos",verificarToken,listarBancos);
router.post("/pse",verificarToken,pagarConPSE)
export default router