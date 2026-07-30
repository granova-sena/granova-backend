import { Router } from "express";
import { obtenerProductos, obtenerProducto } from "../controllers/productosController.js";

const router = Router();

router.get("/",    obtenerProductos);
router.get("/:id", obtenerProducto);

export default router;