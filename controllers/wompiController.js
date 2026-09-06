import pool from "../config/db.js"
import {
  consultarTransaccionWompi,
  verificarFirmaWebhook,
} from "../services/wompiService.js"
import { aplicarResultadoPago } from "../services/confirmarPagoService.js"

// ─────────────────────────────────────────
// Wompi (pasarela REAL, modo TEST/sandbox).
// La transacción la crea el CHECKOUT/Widget de Wompi del lado del medio de
// pago; acá solo consultamos su estado y aplicamos el desenlace en nuestro
// modelo (services/confirmarPagoService.js), igual que el simulador.
// ─────────────────────────────────────────

const ESTADOS_FINALES = ["APPROVED", "DECLINED", "ERROR", "VOIDED"]

// Método que reporta Wompi → método de nuestro pedido.
const METODO_LOCAL_POR_WOMPI = {
  CARD: "tarjeta",
  NEQUI: "nequi",
  PSE: "pse",
  DAVIPLATA: "daviplata",
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
      await sincronizarEstadoPorTransaccion(transaccion)
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

async function sincronizarEstadoPorTransaccion(transaccion) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const resultado = await aplicarEstadoTransaccion(client, transaccion)
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
    const resultado = await aplicarEstadoTransaccion(client, {
      id: transaccion.id,
      reference: transaccion.reference,
      status: transaccion.status,
      payment_method_type: transaccion.payment_method_type,
    })
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

const estadoPagoFinal = (estado) => (estado === "APPROVED" ? "pagado" : "fallido")

// Aplica el estado final de Wompi a nuestro modelo, dentro de una transacción abierta.
// Idempotente: aplicarResultadoPago no repite un pago ya resuelto.
//
// El pedido se localiza por `pedidos.payment_intent_id` (flujo de la API
// actual) O por la referencia GRANOVA-... que quedó en `pagos.referencia`
// (flujo del Checkout/Widget de Wompi, que crea la transacción del lado del
// medio de pago y nunca llega a guardar el payment_intent_id).
async function aplicarEstadoTransaccion(client, transaccion) {
  const { id, reference, status, payment_method_type } = transaccion

  if (!ESTADOS_FINALES.includes(status)) {
    return { encontrado: true, aplicado: false, estado_pago: null }
  }

  const pedido = await client.query(
    `SELECT p.id_pedido
       FROM pedidos p
       LEFT JOIN pagos pg ON pg.id_pedido = p.id_pedido
      WHERE p.payment_intent_id = $1 OR pg.referencia = $2
      ORDER BY pg.id_pago DESC
      LIMIT 1`,
    [id, reference || id]
  )
  if (pedido.rows.length === 0) {
    return { encontrado: false, aplicado: false, estado_pago: null }
  }

  const id_pedido = pedido.rows[0].id_pedido

  // Deja registrado el id de la transacción para que las siguientes
  // consultas/wbhooks también la localicen por payment_intent_id.
  await client.query(
    `UPDATE pedidos SET payment_intent_id = COALESCE(payment_intent_id, $1) WHERE id_pedido = $2`,
    [id, id_pedido]
  )

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
    return { encontrado: true, aplicado: false, estado_pago: null }
  }

  // Si el cliente pagó con un medio distinto al que eligió en el pedido,
  // reflejamos el método real que reporta Wompi.
  const metodoReal = METODO_LOCAL_POR_WOMPI[payment_method_type]
  if (metodoReal && pago.rows[0].metodo_pago !== metodoReal) {
    await client.query(
      `UPDATE pagos SET metodo_pago = $1 WHERE id_pago = $2`,
      [metodoReal, pago.rows[0].id_pago]
    )
    pago.rows[0].metodo_pago = metodoReal
  }

  const resultado = await aplicarResultadoPago(client, pago.rows[0], estadoPagoParaResultado(status))
  return { encontrado: true, aplicado: !!resultado, estado_pago: resultado?.estado_pago || estadoPagoFinal(status) }
}

// ─────────────────────────────────────────
// POST /api/pagos/wompi/confirmar — lo llama la UI justo después de cerrar
// el WidgetCheckout. Verifica la transacción real contra Wompi y aplica el
// desenlace (aprobado/rechazado) de forma idempotente.
// ─────────────────────────────────────────
export const confirmarPagoWompi = async (req, res) => {
  const { transaction_id } = req.body || {}

  if (!transaction_id) {
    return res.status(400).json({ ok: false, mensaje: "El id de la transacción es obligatorio" })
  }

  const client = await pool.connect()
  try {
    const transaccion = await consultarTransaccionWompi(transaction_id)

    if (!ESTADOS_FINALES.includes(transaccion.status)) {
      return res.status(503).json({
        ok: false,
        mensaje: "El pago sigue pendiente de confirmación por el medio de pago. Se confirmará automáticamente al llegar.",
      })
    }

    await client.query("BEGIN")
    const resultado = await aplicarEstadoTransaccion(client, {
      id: transaccion.id,
      reference: transaccion.reference,
      status: transaccion.status,
      payment_method_type: transaccion.payment_method_type,
    })
    await client.query("COMMIT")

    if (!resultado.encontrado) {
      return res.status(404).json({ ok: false, mensaje: "Esta transacción no corresponde a un pedido pendiente" })
    }

    return res.json({
      ok: true,
      data: {
        id_transaccion: transaccion.id,
        metodo_pago: METODO_LOCAL_POR_WOMPI[transaccion.payment_method_type] || null,
        ...resultado,
      },
    })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Error confirmando pago Wompi:", error.message)
    return res.status(error?.status || 502).json({ ok: false, mensaje: "No se pudo confirmar el pago con Wompi" })
  } finally {
    client.release()
  }
}