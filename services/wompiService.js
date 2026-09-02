import crypto from "node:crypto"
import {
  WOMPI_BASE_URL,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_INTEGRITY_SECRET,
  WOMPI_EVENTS_SECRET,
  MONEDA_DEFECTO,
} from "../config/wompi.js"

// Cliente ligero de la API de Wompi usando fetch (igual que el correo Brevo).
// No se añade axios: Node >= 18 trae fetch nativo.

async function peticionWompi(ruta, { metodo = "GET", body, publico = false, headers = {} } = {}) {
  const token = publico ? WOMPI_PUBLIC_KEY : WOMPI_PRIVATE_KEY

  const respuesta = await fetch(`${WOMPI_BASE_URL}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const datos = await respuesta.json().catch(() => ({}))

  if (!respuesta.ok) {
    const mensajes = datos?.error?.messages
    let detalle = ""
    if (typeof mensajes === "string") {
      detalle = mensajes
    } else if (mensajes) {
      detalle = Object.values(mensajes).flat().join(", ")
    }
    const error = new Error(detalle || `Wompi respondió ${respuesta.status}`)
    error.status = respuesta.status
    error.datos = datos
    throw error
  }

  return datos
}

export async function obtenerAcceptanceToken() {
  const datos = await peticionWompi(`/merchants/${WOMPI_PUBLIC_KEY}`, { publico: true })
  return datos?.data?.presigned_acceptance?.acceptance_token || null
}

export function calcularFirmaIntegridad({ referencia, montoEnCentavos, moneda = MONEDA_DEFECTO }) {
  const cadena = `${referencia}${montoEnCentavos}${moneda}${WOMPI_INTEGRITY_SECRET}`
  return crypto.createHash("sha256").update(cadena).digest("hex")
}

export function verificarFirmaWebhook({ propiedades = [], dataEvento, timestamp, checksumRecibido }) {
  if (!Array.isArray(propiedades) || !dataEvento || !timestamp || !checksumRecibido) return false

  const valoresConcatenados = propiedades
    .map((ruta) => ruta.split(".").reduce((obj, clave) => obj?.[clave], dataEvento))
    .join("")

  const cadena = `${valoresConcatenados}${timestamp}${WOMPI_EVENTS_SECRET}`
  const checksumCalculado = crypto.createHash("sha256").update(cadena).digest("hex")

  return checksumCalculado.toUpperCase() === String(checksumRecibido).toUpperCase()
}

// GET /pse/financial_institutions — usa la llave pública según docs de Wompi.
export async function listarBancosPSE() {
  const datos = await peticionWompi(`/pse/financial_institutions`, { publico: true })
  return datos?.data ?? []
}

export async function crearTransaccionWompi({
  montoEnCentavos,
  moneda = MONEDA_DEFECTO,
  referencia,
  emailCliente,
  acceptanceToken,
  firmaIntegridad,
  metodoPago,
}) {
  const datos = await peticionWompi("/transactions", {
    metodo: "POST",
    body: {
      amount_in_cents: montoEnCentavos,
      currency: moneda,
      customer_email: emailCliente,
      reference: referencia,
      acceptance_token: acceptanceToken,
      signature: firmaIntegridad,
      payment_method: metodoPago,
    },
  })
  return datos?.data
}

export async function consultarTransaccionWompi(idTransaccion) {
  const datos = await peticionWompi(`/transactions/${idTransaccion}`)
  return datos?.data
}