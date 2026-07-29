import express from "express";
import { register, login, googleAuth, googleCallback, loginAdmin, solicitarRecuperacion, resetearContraseña, googleOneTap, solicitarRecuperacionAdmin, resetearContraseñaAdmin, verificarEmailDisponible, verificarCuenta, reenviarVerificacion } from "../controllers/authController.js"
import { limitadorLogin } from "../middleware/rateLimiter.js"

const router = express.Router();


router.post("/login", limitadorLogin, login);
router.post("/register", register);
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);
router.post("/login-admin", loginAdmin);
router.post("/recuperar-password", solicitarRecuperacion)
router.post("/reset-password", resetearContraseña)
router.post("/recuperar-password-admin", solicitarRecuperacionAdmin)
router.post("/reset-password-admin", resetearContraseñaAdmin)
router.post("/google-onetap", googleOneTap)

// Rutas que faltaban registrar (estaban importadas pero nunca montadas):
// el frontend les pega directamente y sin ellas Express devuelve un 404 HTML,
// lo que hace que respuesta.json() falle en el frontend y se muestre
// "No se pudo conectar con el servidor" aunque el backend sí esté arriba.
router.get("/verificar-email", verificarEmailDisponible)
router.get("/verificar-cuenta", verificarCuenta)
router.post("/reenviar-verificacion", reenviarVerificacion)

export default router;