import { Router } from "express";
import {
  crearCotizacion,
  listarMisCotizaciones,
  obtenerCotizacion,
  comprarCotizacionController,
  eliminarCotizacion,
} from "../controllers/cotizacionesController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();

router.post("/", verificarToken, crearCotizacion);
router.get("/", verificarToken, listarMisCotizaciones);
router.get("/:id", verificarToken, obtenerCotizacion);
router.post("/:id/comprar", verificarToken, comprarCotizacionController);
router.delete("/:id", verificarToken, eliminarCotizacion);

export default router;