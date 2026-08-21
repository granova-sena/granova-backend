import express from "express";
import { verificarToken } from "../middleware/verificarToken.js";
import { obtenerCliente, actualizarCliente } from "../controllers/clientesController.js";

const router = express.Router();

router.get("/:id", verificarToken, obtenerCliente);
router.put("/:id", verificarToken, actualizarCliente);

export default router;
