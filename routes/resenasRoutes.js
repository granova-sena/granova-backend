import { Router } from "express";
import { crearResena, obtenerResenasProducto, obtenerForos } from "../controllers/resenasController.js";
import { verificarToken } from "../middleware/verificarToken.js";

const router = Router();
router.post("/", verificarToken, crearResena);
router.get("/foros", verificarToken, obtenerForos);
router.get("/producto/:id_producto", obtenerResenasProducto);

export default router;