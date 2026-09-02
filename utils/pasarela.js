import crypto from "node:crypto"

// ─────────────────────────────────────────
// Pasarela de pagos agnóstica.
// HOY: PASARELA=simulador (demo SENA sin credenciales).
//      PASARELA=wompi: el pago real se cobra por el módulo Wompi
//      (controllers/wompiController.js); aquí se genera una referencia
//      provisional que el cobro real reemplaza con la de Wompi.
// ─────────────────────────────────────────
const MODO = String(process.env.PASARELA || 'simulador').toLowerCase()

export function crearSesionPago({ monto, metodo_pago }) {
  const referencia = `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  return { referencia, modo: MODO }
}

export function modoPasarela() {
  return MODO
}

export function esResultadoValido(resultado) {
  return resultado === 'aprobado' || resultado === 'rechazado'
}