import { Router } from "express"
import {
  listarTransportadoras, crearTransportadora, actualizarTransportadora, eliminarTransportadora
} from "../../controllers/admin/transportadorasController.js"
import {
  listarEnvios, crearEnvio, actualizarEnvio, eliminarEnvio
} from "../../controllers/admin/enviosController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"
import { verificarActivo } from "../../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo)

const puedeVer = verificarRol(["admin", "empleado", "logistica"])
const puedeEditar = verificarRol(["empleado", "logistica"])

router.get("/transportadoras", puedeVer, listarTransportadoras)
router.post("/transportadoras", puedeEditar, crearTransportadora)
router.patch("/transportadoras/:id", puedeEditar, actualizarTransportadora)
router.delete("/transportadoras/:id", puedeEditar, eliminarTransportadora)

router.get("/envios", puedeVer, listarEnvios)
router.post("/envios", puedeEditar, crearEnvio)
router.patch("/envios/:id", puedeEditar, actualizarEnvio)
router.delete("/envios/:id", puedeEditar, eliminarEnvio)

export default router
