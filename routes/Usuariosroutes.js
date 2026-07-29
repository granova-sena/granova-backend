import express from "express"
import { listarUsuarios, obtenerMetricas, cambiarEstadoUsuario, cambiarRolUsuario, crearUsuario, eliminarUsuario, importarUsuarios } from "../controllers/usuariosController.js"
import { verificarToken } from "../middleware/verificarToken.js"
import { verificarAdmin } from "../middleware/verificarAdmin.js"
import { uploadExcel } from "../middleware/uploadExcel.js"

const router = express.Router()

router.use(verificarToken, verificarAdmin)

// OJO: /metricas va antes que cualquier ruta tipo "/:id" que agreguemos después,
// si no, Express interpretaría "metricas" como si fuera un id.
router.get("/metricas", obtenerMetricas)
router.get("/", listarUsuarios)
router.post("/", crearUsuario)
router.post("/importar", uploadExcel.single("archivo"), importarUsuarios)
router.patch("/:id/estado", cambiarEstadoUsuario)
router.patch("/:id/rol", cambiarRolUsuario)
router.delete("/:id", eliminarUsuario)

export default router