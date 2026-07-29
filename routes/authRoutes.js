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

import { limitadorLogin } from "../middleware/rateLimiter.js"

const router = express.Router();

router.post("/login", limitadorLogin, login);
router.post("/register", register);

router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

router.post("/login-admin", loginAdmin);

router.post("/recuperar-password", solicitarRecuperacion);
router.post("/reset-password", resetearContraseña);

router.post("/recuperar-password-admin", solicitarRecuperacionAdmin);
router.post("/reset-password-admin", resetearContraseñaAdmin);

router.post("/google-onetap", googleOneTap);

router.get("/verificar-email", verificarEmailDisponible);
router.get("/verificar-cuenta", verificarCuenta);

router.post("/reenviar-verificacion", reenviarVerificacion);

export default router;