import express from 'express'
import { obtenerReportesVentas, obtenerAnalisisClientes, obtenerVentasPorRegion } from '../../controllers/reportesController.js'

const router = express.Router()

router.get('/ventas', obtenerReportesVentas)
router.get('/clientes', obtenerAnalisisClientes)
router.get('/ventas-por-region', obtenerVentasPorRegion)

export default router