import { Router } from "express"
import {
  getUsuarios, cambiarEstado, eliminarUsuario, crearUsuario
} from "../../controllers/admin/usuariosController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"

const router = Router()

router.use(verificarToken, verificarRol(["admin"]))

router.get("/", getUsuarios)
router.post("/", crearUsuario)
router.patch("/:id/estado", cambiarEstado)
router.delete("/:id", eliminarUsuario)

export default router
