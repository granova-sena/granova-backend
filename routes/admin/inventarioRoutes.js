import { Router } from "express"
import {
  getResumen, getProductos, getProductoPorId, getLotes, getInventarioPorFinca, getCategorias, getMarcas, getSugerencias,
  crearProducto, actualizarProducto, importarProductos, restablecerProducto, eliminarProducto
} from "../../controllers/admin/inventarioController.js"
import { crearFinca, actualizarFinca, cambiarEstadoFinca } from "../../controllers/fincasController.js"
import { crearLote, actualizarLote } from "../../controllers/lotesController.js"
import { crearEntrega, listarEntregas, marcarPagado, anularEntrega } from "../../controllers/admin/entregasFincaController.js"
import { listarParametros, actualizarParametro } from "../../controllers/admin/parametrosController.js"
import { listarPresentaciones, crearPresentacion, actualizarPresentacion } from "../../controllers/admin/presentacionesController.js"
import { getDisponibleLote, actualizarPerdidaProceso, liberarProceso, procesarLote } from "../../controllers/admin/procesamientoLoteController.js"
import { crearCosecha, listarCosechas, cancelarCosecha, confirmarCosecha } from "../../controllers/admin/cosechasController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"
import { verificarActivo } from "../../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo)

// Consulta: admin y empleado
const puedeVer = verificarRol(["admin", "empleado"])
router.get("/resumen", puedeVer, getResumen)
router.get("/productos", puedeVer, getProductos)
router.get("/productos/:id", puedeVer, getProductoPorId)
router.get("/lotes", puedeVer, getLotes)
router.get("/por-finca", puedeVer, getInventarioPorFinca)
router.get("/categorias", puedeVer, getCategorias)
router.get("/marcas", puedeVer, getMarcas)
router.get("/sugerencias-precio", puedeVer, getSugerencias)
router.get("/entregas", puedeVer, listarEntregas)
router.get("/parametros", puedeVer, listarParametros)
router.get("/presentaciones", puedeVer, listarPresentaciones)
router.get("/lotes/:id/disponible", puedeVer, getDisponibleLote)
router.get("/cosechas", puedeVer, listarCosechas)

// Escritura: solo empleado (admin es de solo lectura, ver doc 02)
const puedeEditar = verificarRol(["empleado"])
router.post("/productos", puedeEditar, crearProducto)
router.patch("/productos/:id", puedeEditar, actualizarProducto)
router.put("/productos/:id", puedeEditar, actualizarProducto)
router.post("/productos/importar", puedeEditar, importarProductos)
router.patch("/productos/:id/restablecer", puedeEditar, restablecerProducto)
router.patch("/productos/:id/eliminar", puedeEditar, eliminarProducto)

router.post("/fincas", puedeEditar, crearFinca)
router.patch("/fincas/:id", puedeEditar, actualizarFinca)
router.patch("/fincas/:id/estado", puedeEditar, cambiarEstadoFinca)

router.post("/lotes", puedeEditar, crearLote)
router.patch("/lotes/:id", puedeEditar, actualizarLote)
router.patch("/lotes/:id/perdida-proceso", puedeEditar, actualizarPerdidaProceso)
router.patch("/lotes/:id/liberar-proceso", puedeEditar, liberarProceso)
router.post("/lotes/:id/procesar", puedeEditar, procesarLote)

router.post("/entregas", puedeEditar, crearEntrega)
router.patch("/entregas/:id/pagar", puedeEditar, marcarPagado)
router.patch("/entregas/:id/anular", puedeEditar, anularEntrega)

router.post("/cosechas", puedeEditar, crearCosecha)
router.patch("/cosechas/:id/cancelar", puedeEditar, cancelarCosecha)
router.patch("/cosechas/:id/confirmar", puedeEditar, confirmarCosecha)

router.patch("/parametros/:clave", puedeEditar, actualizarParametro)
router.post("/presentaciones", puedeEditar, crearPresentacion)
router.patch("/presentaciones/:id", puedeEditar, actualizarPresentacion)

export default router
