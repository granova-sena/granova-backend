import { Router } from "express"
import {
  getResumen, getPedidos, getPedidoDetalle, aceptarPedido, cancelarPedido, cambiarEstadoPedido, marcarPago
} from "../../controllers/admin/pedidosController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"
import { verificarActivo } from "../../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo)

const puedeVer = verificarRol(["admin", "empleado"])
const puedeEditar = verificarRol(["empleado"])

router.get("/resumen", puedeVer, getResumen)
router.get("/listado", puedeVer, getPedidos)
router.get("/:id", puedeVer, getPedidoDetalle)
router.patch("/:id/aceptar", puedeEditar, aceptarPedido)
router.patch("/:id/rechazar", puedeEditar, cancelarPedido)
router.patch("/:id/estado", puedeEditar, cambiarEstadoPedido)
router.patch("/:id/pago", puedeEditar, marcarPago)

export default router
