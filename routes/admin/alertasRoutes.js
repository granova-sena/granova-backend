import { Router } from "express"
import { getResumen, getAlertas } from "../../controllers/admin/alertasController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"

const router = Router()

router.use(verificarToken, verificarRol(["admin", "empleado"]))

router.get("/resumen", getResumen)
router.get("/listado", getAlertas)

export default router
