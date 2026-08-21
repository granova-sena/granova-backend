import express from "express";
import { verificarToken } from "../middleware/verificarToken.js";
import { canjearCupon, validarCupon, obtenerCupones } from "../controllers/cuponesController.js";

const router = express.Router();

router.post("/canjear",  verificarToken, canjearCupon);
router.post("/validar",  verificarToken, validarCupon);
router.get("/",          verificarToken, obtenerCupones);

export default router;
