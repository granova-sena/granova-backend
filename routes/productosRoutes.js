import express from "express"
import { listarProductos, obtenerProducto } from "../controllers/productosController.js"

const router = express.Router()

router.get("/", listarProductos)
router.get("/:id", obtenerProducto)

export default router
