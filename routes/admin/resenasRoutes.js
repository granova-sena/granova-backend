import { Router } from "express"
import { listarResenas, moderarResena } from "../../controllers/admin/resenasController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"
import { verificarActivo } from "../../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo, verificarRol(["admin"]))

router.get("/", listarResenas)
router.patch("/:id/visibilidad", moderarResena)

export default router
