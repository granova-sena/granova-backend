import { Router } from "express";
import { crearPedido, obtenerPedido, obtenerPedidosCliente, cancelarPedido } from "../controllers/pedidosController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();
router.post("/", verificarToken, crearPedido);
router.get("/cliente/:id_cliente", verificarToken, obtenerPedidosCliente);
router.post("/:id/cancelar", verificarToken, cancelarPedido);
router.get("/:id", verificarToken, obtenerPedido);

export default router;