import { Router } from "express";
import { crearFactura, obtenerFactura } from "../controllers/facturasController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();

router.post("/", verificarToken,  crearFactura);
router.get("/:id_pedido", verificarToken, obtenerFactura);

export default router;