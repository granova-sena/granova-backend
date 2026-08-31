import { Router } from "express"
import { listarPromociones, crearPromocion, actualizarPromocion } from "../../controllers/admin/promocionesController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"
import { verificarActivo } from "../../middleware/verificarActivo.js"

const router = Router()

router.use(verificarToken, verificarActivo, verificarRol(["admin"]))

router.get("/", listarPromociones)
router.post("/", crearPromocion)
router.patch("/:id", actualizarPromocion)

export default router
