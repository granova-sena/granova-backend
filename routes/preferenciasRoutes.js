import express from "express";
import {
  obtenerPreferencias,
  guardarPreferencias,
  obtenerRecomendaciones
} from "../controllers/preferenciasController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = express.Router();

router.get('/:id_cliente', verificarToken, obtenerPreferencias)
router.post('/', verificarToken, guardarPreferencias)
router.get('/:id_cliente/recomendaciones', verificarToken, obtenerRecomendaciones)

export default router