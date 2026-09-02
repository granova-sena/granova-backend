import { Router } from "express";
import { listarParametrosPublicos } from "../controllers/admin/parametrosController.js";
import { modoPasarela } from "../utils/pasarela.js";

const router = Router();

// Parámetros de negocio accesibles SIN sesión (solo claves seguras,
// p.ej. descuento_empresa_pct). Los clientes los usan en el catálogo,
// carrito, simulador y la página de empresas.
router.get("/", listarParametrosPublicos);

// Modo de pasarela configurado en el backend (simulador | wompi, env PASARELA).
// El frontend lo usa para elegir entre los botones de simulación y los
// formularios reales de pago.
router.get("/pasarela", (_req, res) => {
  res.json({ ok: true, data: { modo: modoPasarela() } });
});

export default router;