import { Router } from "express"
import {
  getResumen, getPedidos, getPedidoDetalle, aceptarPedido, cancelarPedido
} from "../../controllers/admin/pedidosController.js"

const router = Router()

router.get("/resumen", getResumen)
router.get("/listado", getPedidos)
router.get("/:id", getPedidoDetalle)
router.patch("/:id/aceptar", aceptarPedido)
router.patch("/:id/rechazar", cancelarPedido)
router.patch("/:id/cancelar", cancelarPedido) // alias viejo, por compatibilidad

export default router
