import { Router } from "express";
import { obtenerProductos } from "../controllers/productosController.js";

const router = Router();

router.get("/", obtenerProductos);

export default router;