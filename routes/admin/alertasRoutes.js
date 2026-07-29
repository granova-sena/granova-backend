import { Router } from "express"
import { getResumen, getAlertas } from "../../controllers/admin/alertasController.js"

const router = Router()

router.get("/resumen", getResumen)
router.get("/listado", getAlertas)

export default router
