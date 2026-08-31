import crypto from "node:crypto"

// ─────────────────────────────────────────
// Pasarela de pagos agnóstica.
// PASARELA=simulador (default): demo SENA sin credenciales.
// PASARELA=wompi: cobros reales contra Wompi (credenciales en .env).
// ─────────────────────────────────────────
const MODO = String(process.env.PASARELA || 'simulador').toLowerCase()

const CURRENCY = 'COP'
const SANDBOX = String(process.env.WOMPI_SANDBOX === 'false' ? 'false' : 'true') === 'true'
const WOMPI_BASE = SANDBOX ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1'

export const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || ''
export const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || ''
export const WOMPI_INTEGRITY_KEY = process.env.WOMPI_INTEGRITY_KEY || ''
export const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || ''

export const esModoWompi = () => MODO === 'wompi'

// Wompi solo genera checkout real si PASARELA=wompi y están las llaves.
export const wompiConfigurado = () =>
  esModoWompi() && Boolean(WOMPI_PUBLIC_KEY && WOMPI_PRIVATE_KEY && WOMPI_INTEGRITY_KEY)

// Firma de integridad del widget.
// SHA256( referencia + montoEnCentavos + moneda + [fechaExpiración] + llaveIntegridad )
export function firmaIntegridad({ referencia, montoCentavos, expiracion }) {
  const base = `${referencia}${montoCentavos}${CURRENCY}${expiracion || ''}${WOMPI_INTEGRITY_KEY}`
  return crypto.createHash('sha256').update(base).digest('hex')
}

// Datos que necesita el botón de pago (widget) de Wompi.
// Se construyen EN EL SERVIDOR para no exponer la llave de integridad.
// Devuelve null si Wompi no está configurado (el frontend sigue en simulador).
export function wompiCheckout({ referencia, monto, email, nombre, telefono, direction }) {
  if (!wompiConfigurado()) return null

  const amountInCents = Math.round(Number(monto) * 100)
  const checkout = {
    modo: 'wompi',
    sandbox: SANDBOX,
    public_key: WOMPI_PUBLIC_KEY,
    currency: CURRENCY,
    amount_in_cents: amountInCents,
    reference: referencia,
    signature: { integrity: firmaIntegridad({ referencia, montoCentavos: amountInCents }) },
    expiration_time: null,
    default_language: 'es_CO',
  }

  if (email) {
    checkout.customer_data = { email }
    if (nombre) checkout.customer_data.full_name = nombre
    const tel = String(telefono || '').replace(/\D/g, '')
    if (tel) {
      checkout.customer_data.phone_number = tel.slice(-10)
      checkout.customer_data.phone_number_prefix = '+57'
    }
  }

  if (direction) {
    checkout.shipping_address = {
      address_line_1: direction,
      country: 'CO',
      city: direction,
      region: direction,
      phone_number: String(telefono || '').replace(/\D/g, '').slice(-10),
    }
  }

  return checkout
}

// Validación de checksum de eventos (webhooks).
// SHA256( concatenación de los valores de signature.properties + timestamp + events_secret )
export function validarChecksumEvento(evento) {
  try {
    const props = evento?.signature?.properties
    const timestamp = String(evento?.timestamp ?? '')
    const checksum = String(evento?.signature?.checksum ?? '').toLowerCase()
    if (!WOMPI_EVENTS_SECRET || !Array.isArray(props) || !checksum) return false

    const valores = props.map((ruta) => {
      let valor = evento.data
      for (const parte of String(ruta).split('.')) valor = valor?.[parte]
      return String(valor ?? '')
    })
    const cadena = valores.join('') + timestamp + WOMPI_EVENTS_SECRET
    const hash = crypto.createHash('sha256').update(cadena).digest('hex')
    return hash.toLowerCase() === checksum
  } catch {
    return false
  }
}

// Consulta una transacción en Wompi usando la llave privada (autoridad real).
export async function obtenerTransaccionWompi(transactionId) {
  try {
    const res = await fetch(`${WOMPI_BASE}/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`, Accept: 'application/json' },
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.data) {
      return { ok: false, status: res.status, error: json?.error?.type || 'No se pudo consultar la transacción' }
    }
    return { ok: true, transaccion: json.data }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

export function crearSesionPago({ monto, metodo_pago }) {
  if (esModoWompi()) {
    // Referencia única que se guarda en pagos.referencia y se firma en el widget.
    const referencia = `WOMPI-${crypto.randomBytes(12).toString('hex').toUpperCase()}`
    return { referencia, modo: 'wompi' }
  }
  const referencia = `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
  return { referencia, modo: 'simulador' }
}

export function esResultadoValido(resultado) {
  return resultado === 'aprobado' || resultado === 'rechazado'
}