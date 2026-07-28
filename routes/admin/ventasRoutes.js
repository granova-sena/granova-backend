import { Router } from "express"
import {
  getResumen, getVentas, getClientes, getProductosDisponibles, crearVenta
} from "../../controllers/admin/ventasController.js"

const router = Router()

router.get("/resumen", getResumen)
router.get("/listado", getVentas)
router.get("/clientes", getClientes)
router.get("/productos-disponibles", getProductosDisponibles)
router.post("/", crearVenta)

export default router
