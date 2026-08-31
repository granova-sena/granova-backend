import { Router } from "express";
import { obtenerNotificaciones, marcarLeida, marcarTodasLeidas } from "../controllers/notificacionesController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();

router.get("/", verificarToken, obtenerNotificaciones);
router.patch("/leer-todas", verificarToken, marcarTodasLeidas);
router.patch("/:id/leida", verificarToken, marcarLeida);

export default router;
