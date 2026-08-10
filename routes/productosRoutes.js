import { Router } from "express";
import { obtenerProductos, obtenerProducto, compararProductos } from "../controllers/productosController.js";

const router = Router();

router.get("/comparar", compararProductos);
router.get("/",         obtenerProductos);
router.get("/:id",      obtenerProducto);

export default router;