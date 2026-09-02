import { Router } from "express"
import {
  listarDespachos, obtenerDespacho, crearDespacho,
  modificarPedidosDespacho, cambiarEstadoDespacho,
  pedidosDisponibles, reclasificarPedido, listarSectores,
} from "../controllers/despachoController.js"
import { verificarToken } from "../middleware/verificarToken.js"
import { verificarRol } from "../middleware/verificarRol.js"
import { verificarActivo } from "../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo)

const puedeVer = verificarRol(["admin", "empleado", "logistica"])
const puedeEditar = verificarRol(["logistica"])

// Sectores: también lo consulta el cliente desde el checkout (token sin rol),
// por eso aquí no se exige rol.
router.get("/sectores", listarSectores)
router.get("/pedidos-disponibles", puedeVer, pedidosDisponibles)

router.get("/", puedeVer, listarDespachos)
router.post("/", puedeEditar, crearDespacho)
router.get("/:id", puedeVer, obtenerDespacho)
router.patch("/:id/pedidos", puedeEditar, modificarPedidosDespacho)
router.patch("/:id/estado", puedeEditar, cambiarEstadoDespacho)
router.patch("/pedidos/:id/operacion", puedeEditar, reclasificarPedido)

export default router