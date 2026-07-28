import { Router } from "express"
import { getResumen } from "../../controllers/admin/dashboardController.js"

const router = Router()

router.get("/", getResumen)

export default router
