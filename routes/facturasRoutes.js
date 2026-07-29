import { Router } from "express";
import { crearFactura, obtenerFactura } from "../controllers/facturasController.js";

const router = Router();

router.post("/", crearFactura);
router.get("/:id_pedido",     obtenerFactura);
export default router;