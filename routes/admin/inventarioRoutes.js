import { Router } from "express"
import {
  getResumen, getProductos, getProductoPorId, getLotes, getCategorias, getMarcas, getSugerencias,
  crearProducto, actualizarProducto, importarProductos, restablecerProducto
} from "../../controllers/admin/inventarioController.js"

const router = Router()

router.get("/resumen", getResumen)
router.get("/productos", getProductos)
router.get("/productos/:id", getProductoPorId)
router.get("/lotes", getLotes)
router.get("/categorias", getCategorias)
router.get("/marcas", getMarcas)
router.get("/sugerencias-precio", getSugerencias)
router.post("/productos", crearProducto)
router.patch("/productos/:id", actualizarProducto)
router.put("/productos/:id", actualizarProducto)
router.post("/productos/importar", importarProductos)
router.patch("/productos/:id/restablecer", restablecerProducto)

export default router
