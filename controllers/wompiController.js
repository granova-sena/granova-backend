import pool from "../config/db.js"
import {
  obtenerAcceptanceToken,
  calcularFirmaIntegridad,
  verificarFirmaWebhook,
  crearTransaccionWompi,
  consultarTransaccionWompi,
  listarBancosPSE,
} from "../services/wompiService.js"
import { aplicarResultadoPago } from "../services/confirmarPagoService.js"
import { MONEDA_DEFECTO } from "../config/wompi.js"

// ─────────────────────────────────────────
// Wompi (pasarela REAL, modo TEST/sandbox).
// Los efectos del resultado (puntos, premio, cupón, stock, notificaciones)
// los resuelve services/confirmarPagoService.js, igual que el simulador.
// ─────────────────────────────────────────

const ESTADOS_FINALES = ["APPROVED", "DECLINED", "ERROR", "VOIDED"]

function referenciaParaPedido(id_pedido) {
  return `GRANOVA-${id_pedido}-${Date.now()}`
}

async function verificarPedidoDelCliente(id_pedido, id_cliente) {
  const resultado = await pool.query(
    `SELECT p.id_pedido, p.id_cliente, p.total, p.estado_pago, p.estado, p.metodo_pago,
            c.tipo_persona, c.tipo_documento, c.numero_documento
     FROM pedidos p
     JOIN clientes c ON c.id_cliente = p.id_cliente
     WHERE p.id_pedido = $1 AND p.id_cliente = $2`,
    [id_pedido, id_cliente]
  )
  return resultado.rows[0]
}

function guardarPaymentIntent(id_pedido, idTransaccion) {
  return pool.query(
    `UPDATE pedidos SET payment_intent_id = $1 WHERE id_pedido = $2`,
    [idTransaccion, id_pedido]
  )
}

function actualizarReferenciaDelPago(id_pedido, referencia) {
  return pool.query(
    `UPDATE pagos SET referencia = $1 WHERE id_pedido = $2`,
    [referencia, id_pedido]
  )
}

// Crea la transacción en Wompi y guarda la trazabilidad local.
async function iniciarPagoWompi(req, res, construirMetodoPago) {
  const { id_pedido } = req.body

  if (!id_pedido) {
    return res.status(400).json({ ok: false, mensaje: "El id del pedido es obligatorio" })
  }

  try {
    const pedido = await verificarPedidoDelCliente(id_pedido, req.usuario.id)
    if (!pedido) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permisos para pagar este pedido" })
    }
    if (!["pendiente", "fallido"].includes(pedido.estado_pago)) {
      return res.status(400).json({ ok: false, mensaje: "Este pedido ya fue procesado o no requiere pago" })
    }

    const montoEnCentavos = Math.round(Number(pedido.total) * 100)
    if (!Number.isFinite(montoEnCentavos) || montoEnCentavos <= 0) {
      return res.status(400).json({ ok: false, mensaje: "El pedido no tiene un monto válido" })
    }

    const referencia = referenciaParaPedido(id_pedido)
    const acceptanceToken = await obtenerAcceptanceToken()
    const firmaIntegridad = calcularFirmaIntegridad({ referencia, montoEnCentavos })

    const metodoPago = await construirMetodoPago(req, res, pedido)
    const transaccion = await crearTransaccionWompi({
      montoEnCentavos,
      moneda: MONEDA_DEFECTO,
      emailCliente: req.usuario.email,
      referencia,
      acceptanceToken,
      firmaIntegridad,
      metodoPago,
    })

    // La referencia local del pago pasa a ser la de Wompi, para que la
    // consulta/actualización posterior encuentre este intento.
    await actualizarReferenciaDelPago(id_pedido, referencia)
    await guardarPaymentIntent(id_pedido, transaccion.id)

    return res.status(201).json({
      ok: true,
      id_transaccion: transaccion.id,
      estado: transaccion.status,
    })
  } catch (error) {
    console.error("Error creando pago Wompi:", error.message)
    return res.status(error?.status || 502).json({
      ok: false,
      mensaje: error?.message || "No se pudo procesar el pago con Wompi",
    })
  }
}

// ── NEQUI: requiere el celular del cliente (10 dígitos, empieza por 3) ──
export const pagarConNequi = async (req, res) => {
  const { numero_celular } = req.body
  if (!numero_celular || !/^3\d{9}$/.test(numero_celular)) {
    return res.status(400).json({
      ok: false,
      mensaje: "El número de celular debe tener 10 dígitos y empezar por 3",
    })
  }
  return iniciarPagoWompi(req, res, () => ({
    type: "NEQUI",
    phone_number: numero_celular,
  }))
}

// ── TARJETA: llega TOKENIZADA (se tokeniza en el frontend con la llave pública) ──
export const crearPagoTarjeta = async (req, res) => {
  const { token_tarjeta, cuotas } = req.body
  if (!token_tarjeta) {
    return res.status(400).json({ ok: false, mensaje: "Falta el token de la tarjeta" })
  }
  return iniciarPagoWompi(req, res, () => ({
    type: "CARD",
    installments: Number(cuotas) || 1,
    token: token_tarjeta,
  }))
}

// ── PSE: requiere banco y documento del cliente ──
export const pagarConPSE = async (req, res) => {
  const { financial_institution_code, tipo_documento, numero_documento } = req.body
  if (!financial_institution_code) {
    return res.status(400).json({ ok: false, mensaje: "Selecciona el banco para continuar" })
  }
  return iniciarPagoWompi(req, res, (_r, _s, pedido) => {
    const docTipo = tipo_documento || pedido.tipo_documento
    const docNumero = numero_documento || pedido.numero_documento
    if (!docTipo || !docNumero) {
      const error = new Error("Necesitamos tu tipo y número de documento para procesar el pago")
      error.status = 400
      throw error
    }
    return {
      type: "PSE",
      user_type: pedido.tipo_persona === "juridica" ? 1 : 0,
      user_legal_id_type: docTipo,
      user_legal_id: docNumero,
      financial_institution_code,
      payment_description: `Pago Granova pedido #${pedido.id_pedido}`,
    }
  })
}

export const listarBancos = async (_req, res) => {
  try {
    const bancos = await listarBancosPSE()
    res.status(200).json({ ok: true, data: bancos })
  } catch (error) {
    console.error("Error listando bancos PSE:", error.message)
    res.status(502).json({ ok: false, mensaje: "No se pudieron obtener los bancos" })
  }
}

// Red de seguridad para el polling del frontend: si Wompi ya resolvió el
// estado final pero el webhook tardó, sincronizamos aquí mismo.
export const consultarTransaccion = async (req, res) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ ok: false, mensaje: "El id de la transacción es obligatorio" })
  }

  try {
    const transaccion = await consultarTransaccionWompi(id)

    if (ESTADOS_FINALES.includes(transaccion.status)) {
      await sincronizarEstadoPorTransaccion(transaccion.id, transaccion.status)
    }

    return res.status(200).json({
      ok: true,
      data: {
        id: transaccion.id,
        estado: transaccion.status,
        mensaje: transaccion.status_message,
        referencia: transaccion.reference,
        metodoPago: transaccion.payment_method_type,
        urlBanco: transaccion.payment_method?.extra?.async_payment_url ?? null,
      },
    })
  } catch (error) {
    console.error("Error consultando transacción:", error.message)
    return res.status(error?.status || 502).json({ ok: false, mensaje: "No se pudo consultar la transacción" })
  }
}

async function sincronizarEstadoPorTransaccion(idTransaccion, estadoWompi) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const resultado = await aplicarEstadoTransaccion(client, idTransaccion, estadoWompi)
    await client.query("COMMIT")
    return resultado
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export const webhookWompi = async (req, res) => {
  const client = await pool.connect()
  try {
    const { event, data, timestamp, signature } = req.body || {}

    const firmaValida = verificarFirmaWebhook({
      propiedades: signature?.properties,
      dataEvento: data,
      timestamp,
      checksumRecibido: signature?.checksum,
    })

    if (!firmaValida) {
      console.error("Firma de webhook Wompi inválida")
      return res.status(401).json({ mensaje: "Firma inválida" })
    }

    if (event !== "transaction.updated") {
      return res.status(200).json({ recibido: true })
    }

    const transaccion = data?.transaction
    if (!transaccion) {
      return res.status(200).json({ recibido: true })
    }

    await client.query("BEGIN")
    const resultado = await aplicarEstadoTransaccion(client, transaccion.id, transaccion.status)
    await client.query("COMMIT")

    if (!resultado.encontrado) {
      console.warn(`Webhook para transacción desconocida: ${transaccion.id}`)
    }

    return res.status(200).json({ recibido: true })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Error procesando webhook Wompi:", error.message)
    return res.status(500).json({ mensaje: "Error procesando el evento" })
  } finally {
    client.release()
  }
}

const estadoPagoParaResultado = (estado) => (estado === "APPROVED" ? "aprobado" : "rechazado")

// Aplica el estado final de Wompi a nuestro modelo, dentro de una transacción abierta.
// Idempotente: aplicarResultadoPago no repite un pago ya resuelto.
async function aplicarEstadoTransaccion(client, idTransaccion, estadoWompi) {
  if (!ESTADOS_FINALES.includes(estadoWompi)) {
    return { encontrado: true, aplicado: false }
  }

  const pedido = await client.query(
    `SELECT id_pedido FROM pedidos WHERE payment_intent_id = $1`,
    [idTransaccion]
  )
  if (pedido.rows.length === 0) {
    return { encontrado: false, aplicado: false }
  }

  const id_pedido = pedido.rows[0].id_pedido

  const pago = await client.query(
    `SELECT pg.id_pago, pg.id_pedido, pg.metodo_pago, pg.monto, pg.estado,
            p.id_cliente, p.estado AS estado_pedido, p.estado_pago, p.total
     FROM pagos pg
     JOIN pedidos p ON p.id_pedido = pg.id_pedido
     WHERE pg.id_pedido = $1
     ORDER BY pg.id_pago DESC
     LIMIT 1
     FOR UPDATE OF pg`,
    [id_pedido]
  )
  if (pago.rows.length === 0) {
    return { encontrado: true, aplicado: false }
  }

  const resultado = await aplicarResultadoPago(client, pago.rows[0], estadoPagoParaResultado(estadoWompi))
  return { encontrado: true, aplicado: !!resultado }
}