import { Router } from "express";
import {
  guardarCotizacion,
  listarMisCotizaciones,
} from "../controllers/cotizacionesController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();
router.post("/", verificarToken, guardarCotizacion);
router.get("/", verificarToken, listarMisCotizaciones);

export default router;