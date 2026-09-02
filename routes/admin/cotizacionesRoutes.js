import { Router } from "express";
import {
  listarCotizaciones,
  cambiarEstadoCotizacion,
} from "../../controllers/cotizacionesController.js";
import { verificarToken } from "../../middleware/verificarToken.js";
import { verificarRol } from "../../middleware/verificarRol.js";

const router = Router();
router.use(verificarToken, verificarRol(["admin", "empleado"]));

router.get("/", listarCotizaciones);
router.patch("/:id/estado", cambiarEstadoCotizacion);

export default router;