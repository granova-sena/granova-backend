import express from "express";
import { obtenerTrazabilidadLote, descargarCertificadoLote } from "../controllers/lotesController.js";

const router = express.Router();
router.get("/:id/trazabilidad", obtenerTrazabilidadLote);
router.get("/:id/certificado", descargarCertificadoLote);

export default router;