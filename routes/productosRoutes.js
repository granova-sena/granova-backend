import { Router } from "express";
import { obtenerProductos, obtenerProducto, compararProductos, obtenerTopVendidos } from "../controllers/productosController.js";

const router = Router();

router.get("/comparar", compararProductos);
router.get("/top-vendidos", obtenerTopVendidos);
router.get("/",         obtenerProductos);
router.get("/:id",      obtenerProducto);

export default router;