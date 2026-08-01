import express from 'express'
import { obtenerReportesVentas } from '../../controllers/reportesController.js'

const router = express.Router()

router.get('/ventas', obtenerReportesVentas)

export default router