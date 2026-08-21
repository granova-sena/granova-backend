import { Router } from "express"
import { getResumen } from "../../controllers/admin/dashboardController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"

const router = Router()

router.get("/", verificarToken, verificarRol(["admin", "empleado"]), getResumen)

export default router
