import express from "express";
import { obtenerPromocionesActivas } from "../controllers/promocionesController.js";

const router = express.Router();

router.get("/", obtenerPromocionesActivas);

export default router;
