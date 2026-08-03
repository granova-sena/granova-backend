import express from 'express'
import { 
  obtenerPreferencias, 
  guardarPreferencias, 
  obtenerRecomendaciones 
} from '../controllers/preferenciasController.js'

const router = express.Router()

router.get('/:id_cliente', obtenerPreferencias)
router.post('/', guardarPreferencias)
router.get('/:id_cliente/recomendaciones', obtenerRecomendaciones)

export default router