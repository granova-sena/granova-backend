import { Router } from "express"
import {
  listarEmpleados, obtenerEmpleado, crearEmpleado,
  actualizarEmpleado, resetearPasswordEmpleado, eliminarEmpleado,
  crearReporte, eliminarReporte, eliminarTodosLosReportes,
  bloquearEmpleado, desbloquearEmpleado, alertasEmpleados, misReportes
} from "../../controllers/admin/empleadosController.js"
import { verificarToken } from "../../middleware/verificarToken.js"
import { verificarRol } from "../../middleware/verificarRol.js"

const router = Router()

// El propio empleado ve sus reportes (antes de la barrera de "solo admin")
router.get("/mis-reportes", verificarToken, verificarRol(["empleado"]), misReportes)

router.use(verificarToken, verificarRol(["admin"]))

router.get("/", listarEmpleados)
router.get("/alertas", alertasEmpleados)
router.get("/:id", obtenerEmpleado)
router.post("/", crearEmpleado)
router.patch("/:id", actualizarEmpleado)
router.patch("/:id/reset-password", resetearPasswordEmpleado)
router.delete("/:id", eliminarEmpleado)

router.post("/:id/reportes", crearReporte)
router.delete("/:id/reportes", eliminarTodosLosReportes)
router.delete("/:id/reportes/:idReporte", eliminarReporte)
router.patch("/:id/bloquear", bloquearEmpleado)
router.patch("/:id/desbloquear", desbloquearEmpleado)

export default router
