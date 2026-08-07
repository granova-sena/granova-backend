import express from 'express'
import { obtenerReportesVentas, obtenerAnalisisClientes } from '../../controllers/reportesController.js'

const router = express.Router()

router.get('/ventas', obtenerReportesVentas)
router.get('/clientes', obtenerAnalisisClientes)

export default router