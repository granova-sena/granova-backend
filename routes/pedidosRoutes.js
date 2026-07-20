import { Router } from "express";
import { crearPedido, obtenerPedido, obtenerPedidosCliente} from "../controllers/pedidosController.js";

const router = Router();
router.post("/", crearPedido);
router.get("/cliente/:id_cliente", obtenerPedidosCliente);
router.get("/:id", obtenerPedido);

export default router;