// ─────────────────────────────────────────
// Configuración de Wompi (pasarela de pagos).
// Modo TEST = sandbox (por defecto). En producción se cambia
// WOMPI_BASE_URL a https://production.wompi.co/v1.
//
// Las llaves NO se versionan: van en .env.
//   WOMPI_PUBLIC_KEY     -> llave pública (tokenización en el frontend)
//   WOMPI_PRIVATE_KEY    -> llave privada (crear/consultar transacciones)
//   WOMPI_INTEGRITY_SECRET -> firma de integridad de montos
//   WOMPI_EVENTS_SECRET  -> firma de los webhooks
//   WOMPI_BASE_URL       -> base de la API (default sandbox)
// ─────────────────────────────────────────
export const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL || "https://sandbox.wompi.co/v1"
export const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || ""
export const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || ""
export const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || ""
export const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || ""
export const MONEDA_DEFECTO = "COP"