import { Router } from "express"
import {
  getResumen, getVentas, getClientes, getProductosDisponibles, crearVenta
} from "../../controllers/admin/ventasController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"
import { verificarActivo } from "../../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo)

const puedeVer = verificarRol(["admin", "empleado"])
const puedeEditar = verificarRol(["empleado"])

router.get("/resumen", puedeVer, getResumen)
router.get("/listado", puedeVer, getVentas)
router.get("/clientes", puedeVer, getClientes)
router.get("/productos-disponibles", puedeVer, getProductosDisponibles)
router.post("/", puedeEditar, crearVenta)

export default router
