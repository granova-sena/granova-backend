import { Router } from "express"
import {
  getUsuarios, cambiarEstado, eliminarUsuario, crearUsuario
} from "../../controllers/admin/usuariosController.js"

const router = Router()

router.get("/", getUsuarios)
router.post("/", crearUsuario)
router.patch("/:id/estado", cambiarEstado)
router.delete("/:id", eliminarUsuario)

export default router
