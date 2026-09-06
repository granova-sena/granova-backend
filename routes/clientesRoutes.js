import express from "express";
import { verificarToken } from "../middleware/verificarToken.js";
import { obtenerCliente, actualizarCliente, actualizarContactoCliente } from "../controllers/clientesController.js";

const router = express.Router();

router.get("/:id", verificarToken, obtenerCliente);
router.put("/:id", verificarToken, actualizarCliente);
router.patch("/:id/contacto", verificarToken, actualizarContactoCliente);

export default router;
