import express from 'express'
import { obtenerReportesVentas, obtenerAnalisisClientes, obtenerReportesEmpleados } from '../../controllers/reportesController.js'
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"

const router = express.Router()

router.use(verificarToken, verificarRol(["admin"]))

router.get('/ventas', obtenerReportesVentas)
router.get('/clientes', obtenerAnalisisClientes)
router.get('/empleados', obtenerReportesEmpleados)

export default router