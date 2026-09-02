import { Router } from "express";
import { crearFactura, obtenerFactura } from "../controllers/facturasController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();

// Emitir factura: el dueño del pedido desde "Mis compras" o admin/empleado
// desde el panel (la propiedad se valida en el controller).
router.post("/", verificarToken, crearFactura);
// Ver factura: el dueño del pedido o admin/empleado (validado en el controller)
router.get("/:id_pedido", verificarToken, obtenerFactura);

export default router;