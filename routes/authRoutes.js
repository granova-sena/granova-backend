import express from "express";
import {
    register,
    login,
    googleAuth,
    googleCallback,
    loginAdmin,
    solicitarRecuperacion,
    resetearContraseña,
    googleOneTap,
    solicitarRecuperacionAdmin,
    resetearContraseñaAdmin,
    verificarEmailDisponible,
    verificarCuenta,
    reenviarVerificacion
} from "../controllers/authController.js"

import { limitadorLogin, limitadorPublico } from "../middleware/rateLimiter.js"

const router = express.Router();

router.post("/login", limitadorLogin, login);
router.post("/register", limitadorPublico, register);

router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

router.post("/login-admin", limitadorPublico, loginAdmin);

router.post("/recuperar-password", limitadorPublico, solicitarRecuperacion);
router.post("/reset-password", limitadorPublico, resetearContraseña);

router.post("/recuperar-password-admin", limitadorPublico, solicitarRecuperacionAdmin);
router.post("/reset-password-admin", limitadorPublico, resetearContraseñaAdmin);

router.post("/google-onetap", limitadorPublico, googleOneTap);

router.get("/verificar-email", verificarEmailDisponible);
router.get("/verificar-cuenta", verificarCuenta);

router.post("/reenviar-verificacion", reenviarVerificacion);

export default router;