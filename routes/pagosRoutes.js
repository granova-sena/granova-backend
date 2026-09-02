import { Router } from "express"
import { procesarPago, obtenerEstadoPago } from "../controllers/pagosController.js"
import { verificarToken } from "../middleware/verificarToken.js"

const router = Router()

router.use(verificarToken)

router.get("/pedido/:id", obtenerEstadoPago)
router.post("/:referencia/procesar", procesarPago)

export default router