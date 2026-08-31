import pool from "../config/db.js"
import {
  esResultadoValido,
  wompiCheckout,
  wompiConfigurado,
  validarChecksumEvento,
  obtenerTransaccionWompi,
} from "../utils/pasarela.js"
import { devolverStockPedido } from "../utils/stockPedido.js"

const METODOS_PASARELA = ["tarjeta", "pse", "nequi", "daviplata"]
const ESTADOS_FINALES_FALLIDOS = ['DECLINED', 'VOIDED', 'ERROR', 'EXPIRED']

// ─────────────────────────────────────────
// Helpers compartidos entre la pasarela simulada y Wompi.
// ─────────────────────────────────────────

// Busca el pago + pedido por referencia y bloquea la fila para procesarlo.
async function obtenerPagoPorReferencia(client, referencia) {
  const pagoQuery = await client.query(
    `SELECT pg.id_pago, pg.id_pedido, pg.metodo_pago, pg.monto, pg.estado,
            p.id_cliente, p.estado AS estado_pedido, p.estado_pago, p.total
     FROM pagos pg
     JOIN pedidos p ON p.id_pedido = pg.id_pedido
     WHERE pg.referencia = $1
     FOR UPDATE OF pg`,
    [referencia]
  )
  return pagoQuery.rows[0] || null
}

function formatoMoneda(valor) {
  return Number(valor).toLocaleString("es-CO")
}

// Actualiza la BD cuando el pago fue aprobado (Wompi confirmó la transacción).
async function aprobarPagoEnBD(client, pago, confirmadoPor = null) {
  await client.query(
    `UPDATE pagos SET estado = 'aprobado', fecha_pago = NOW(), confirmado_por = $2 WHERE id_pago = $1`,
    [pago.id_pago, confirmadoPor]
  )

  const nuevoEstadoPedido = pago.estado_pedido === 'pendiente' ? 'confirmado' : pago.estado_pedido
  await client.query(
    `UPDATE pedidos SET estado_pago = 'pagado', estado = $1 WHERE id_pedido = $2`,
    [nuevoEstadoPedido, pago.id_pedido]
  )

  await client.query(
    `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
     VALUES ($1, $2, $3, $4, $5)`,
    [pago.id_cliente, 'pago', 'Pago aprobado ✅', `Recibimos tu pago por $${formatoMoneda(pago.monto)}. Tu pedido será enviado en menos de 2 días.`, pago.id_pedido]
  )

  // Puntos de lealtad recién cuando el pago se confirma (antes se otorgaban
  // al crear el pedido, regalando puntos a pedidos que luego fallaban).
  const cliente = await client.query(
    `SELECT tipo_persona FROM clientes WHERE id_cliente = $1`,
    [pago.id_cliente]
  )
  const esJuridica = cliente.rows[0]?.tipo_persona === 'juridica'
  const puntos = esJuridica ? 0 : Math.floor(Number(pago.total) / 1000)
  if (puntos > 0) {
    await client.query(`UPDATE clientes SET puntos = puntos + $1 WHERE id_cliente = $2`, [puntos, pago.id_cliente])
  }

  return { nuevoEstadoPedido, puntos }
}

// Actualiza la BD cuando el pago no fue aprobado (rechazo/declinado/fallo).
// La venta se RECHAZA: si no se puede confirmar que llegó la plata, el pedido
// se cancela (estado 'cancelado'), se devuelve el stock y el cliente lo ve como
// "pago no procesado". No deja pedidos colgados en pendiente.
async function fallarPagoEnBD(client, pago) {
  await client.query(`UPDATE pagos SET estado = 'fallido' WHERE id_pago = $1`, [pago.id_pago])
  await client.query(
    `UPDATE pedidos SET estado_pago = 'fallido', estado = 'cancelado', motivo_rechazo = 'Pago no confirmado' WHERE id_pedido = $1`,
    [pago.id_pedido]
  )

  await devolverStockPedido(client, pago.id_pedido)

  await client.query(
    `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
     VALUES ($1, $2, $3, $4, $5)`,
    [pago.id_cliente, 'pago', 'Pago no procesado ⚠️', `El pago por $${formatoMoneda(pago.monto)} no se procesó. Puedes intentarlo de nuevo.`, pago.id_pedido]
  )
}

// Solo el dueño del pedido o admin/empleado puede procesar un cobro.
function esAutorizado(req, idCliente) {
  const esAdmin = !!req.usuario?.rol
  const esDueno = Number(req.usuario?.id) === Number(idCliente)
  return esAdmin || esDueno
}

// ─────────────────────────────────────────
// POST /api/pagos/:referencia/procesar { resultado: 'aprobado' | 'rechazado' }
// Simula el retorno de la pasarela. Solo se usa con PASARELA=simulador.
// ─────────────────────────────────────────
export const procesarPago = async (req, res) => {
  const { referencia } = req.params
  const { resultado } = req.body

  if (!referencia) {
    return res.status(400).json({ ok: false, mensaje: "La referencia es obligatoria" })
  }
  if (!esResultadoValido(resultado)) {
    return res.status(400).json({ ok: false, mensaje: "Resultado inválido. Usa 'aprobado' o 'rechazado'" })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const pago = await obtenerPagoPorReferencia(client, referencia)

    if (!pago) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, mensaje: "Referencia de pago no encontrada" })
    }

    if (!esAutorizado(req, pago.id_cliente)) {
      await client.query("ROLLBACK")
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para procesar este pago" })
    }

    if (pago.estado !== 'pendiente') {
      await client.query("ROLLBACK")
      return res.status(400).json({ ok: false, mensaje: `Este pago ya fue procesado (${pago.estado})` })
    }
    if (!METODOS_PASARELA.includes(pago.metodo_pago)) {
      await client.query("ROLLBACK")
      return res.status(400).json({ ok: false, mensaje: "Este pedido no usa pasarela" })
    }

    if (resultado === 'aprobado') {
      const datos = await aprobarPagoEnBD(client, pago)
      await client.query("COMMIT")
      return res.json({ ok: true, data: { estado_pago: 'pagado', estado: datos.nuevoEstadoPedido, puntos_ganados: datos.puntos } })
    }

    await fallarPagoEnBD(client, pago)
    await client.query("COMMIT")
    return res.json({ ok: true, data: { estado_pago: 'fallido', estado: pago.estado_pedido } })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Error procesando pago:", error.message)
    return res.status(500).json({ ok: false, mensaje: "Error interno al procesar el pago" })
  } finally {
    client.release()
  }
}

// ─────────────────────────────────────────
// POST /api/pagos/wompi/confirmar { referencia, transaction_id }
// El frontend llama aquí cuando el widget devuelve la transacción.
// Verificamos contra Wompi con la llave privada (nadie puede "auto-aprobar").
// ─────────────────────────────────────────
export const confirmarPagoWompi = async (req, res) => {
  const { referencia, transaction_id } = req.body

  if (!referencia || !transaction_id) {
    return res.status(400).json({ ok: false, mensaje: "referencia y transaction_id son obligatorios" })
  }
  if (!wompiConfigurado()) {
    return res.status(503).json({ ok: false, mensaje: "Wompi no está configurado en el servidor" })
  }

  // 1) Consultar la transacción real en Wompi.
  const consulta = await obtenerTransaccionWompi(transaction_id)
  if (!consulta.ok) {
    console.error("Wompi no pudo verificar la transacción:", consulta.error)
    return res.status(502).json({ ok: false, mensaje: "No se pudo verificar la transacción con Wompi" })
  }
  const tx = consulta.transaccion

  // 2) La transacción debe pertenecer a esta referencia.
  if (tx.reference !== referencia) {
    return res.status(400).json({ ok: false, mensaje: "La transacción no pertenece a este pedido" })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const pago = await obtenerPagoPorReferencia(client, referencia)

    if (!pago) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, mensaje: "Referencia de pago no encontrada" })
    }
    if (!esAutorizado(req, pago.id_cliente)) {
      await client.query("ROLLBACK")
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para procesar este pago" })
    }

    // Idempotente: si un webhook ya lo confirmó, solo devolvemos el estado actual.
    if (pago.estado !== 'pendiente') {
      await client.query("COMMIT")
      return res.json({
        ok: true,
        data: { estado_pago: pago.estado === 'aprobado' ? 'pagado' : 'fallido', estado: pago.estado_pedido },
      })
    }

    // 3) Validar montos (evita pagos por montos alterados en el cliente).
    const montoEsperado = Math.round(Number(pago.monto) * 100)
    if (Number(tx.amount_in_cents) !== montoEsperado) {
      await client.query("ROLLBACK")
      return res.status(400).json({ ok: false, mensaje: `El monto de la transacción no coincide (se esperaban ${montoEsperado} centavos)` })
    }

    if (tx.status === 'APPROVED') {
      const datos = await aprobarPagoEnBD(client, pago, req.usuario.id)
      await client.query("COMMIT")
      return res.json({ ok: true, data: { estado_pago: 'pagado', estado: datos.nuevoEstadoPedido, puntos_ganados: datos.puntos } })
    }

    if (ESTADOS_FINALES_FALLIDOS.includes(tx.status)) {
      await fallarPagoEnBD(client, pago)
      await client.query("COMMIT")
      return res.json({ ok: true, data: { estado_pago: 'fallido', estado: pago.estado_pedido, status_wompi: tx.status } })
    }

    // PENDING (PSE/Nequi/Daviplata en curso): no tocamos nada, seguimos esperando.
    await client.query("COMMIT")
    return res.json({ ok: true, data: { estado_pago: 'pendiente', estado: pago.estado_pedido, status_wompi: tx.status } })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Error confirmando pago Wompi:", error.message)
    return res.status(500).json({ ok: false, mensaje: "Error interno al confirmar el pago" })
  } finally {
    client.release()
  }
}

// ─────────────────────────────────────────
// POST /api/pagos/wompi/webhook
// Wompi notifica aquí los cambios de estado (transaction.updated).
// Ruta pública: se valida con el checksum del evento, no con JWT.
// ─────────────────────────────────────────
export const webhookWompi = async (req, res) => {
  try {
    const evento = req.body
    if (!evento || typeof evento !== 'object') return res.json({ ok: true })

    // Seguridad: ignorar eventos firmados con eventos_secret incorrecto.
    if (!validarChecksumEvento(evento)) {
      console.warn("Webhook Wompi con firma inválida ignorado:", evento.event)
      return res.status(401).json({ ok: false, mensaje: "Firma inválida" })
    }

    if (evento.event !== 'transaction.updated' || !evento.data?.transaction) {
      return res.json({ ok: true })
    }

    const tx = evento.data.transaction

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const pago = await obtenerPagoPorReferencia(client, tx.reference)

      if (!pago || pago.estado !== 'pendiente') {
        // Sin pago local pendiente para esta referencia: nada que hacer.
        await client.query("ROLLBACK")
        return res.json({ ok: true })
      }

      if (tx.status === 'APPROVED') {
        await aprobarPagoEnBD(client, pago)
      } else if (ESTADOS_FINALES_FALLIDOS.includes(tx.status)) {
        await fallarPagoEnBD(client, pago)
      }
      // PENDING = sigue en curso; esperamos el evento final.

      await client.query("COMMIT")
      return res.json({ ok: true })
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      console.error("Error procesando webhook Wompi:", error.message)
      return res.json({ ok: true })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error en webhook Wompi:", error.message)
    // Siempre responder 200 para que Wompi no reintente el mismo evento.
    return res.json({ ok: true })
  }
}

// ─────────────────────────────────────────
// GET /api/pagos/pedido/:id — estado de pago del pedido (dueño/admin/empleado).
// ─────────────────────────────────────────
export const obtenerEstadoPago = async (req, res) => {
  const { id } = req.params

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "El id del pedido debe ser un número" })
  }

  try {
    const pedidoQuery = await pool.query(
      `SELECT id_pedido, id_cliente, estado, estado_pago, total
       FROM pedidos WHERE id_pedido = $1`,
      [id]
    )

    if (pedidoQuery.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Pedido no encontrado" })
    }

    const pedido = pedidoQuery.rows[0]

    if (!esAutorizado(req, pedido.id_cliente)) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para ver este pedido" })
    }

    const pagoQuery = await pool.query(
      `SELECT id_pago, metodo_pago, monto, referencia, estado, fecha_creacion, fecha_pago
       FROM pagos WHERE id_pedido = $1 ORDER BY id_pago DESC LIMIT 1`,
      [id]
    )

    const pago = pagoQuery.rows[0] || null

    // Si el pedido sigue pendiente de pasarela, entregamos la config del botón
    // de Wompi (null cuando Wompi no está configurado → el front sigue en simulador).
    let checkout = null
    if (pago && pago.estado === 'pendiente' && METODOS_PASARELA.includes(pago.metodo_pago) && wompiConfigurado()) {
      checkout = wompiCheckout({ referencia: pago.referencia, monto: pago.monto })
    }

    return res.json({
      ok: true,
      data: {
        estado_pago: pedido.estado_pago,
        pago,
        checkout,
        pedido: { estado: pedido.estado, total: Number(pedido.total) },
      },
    })
  } catch (error) {
    console.error("Error obteniendo estado de pago:", error.message)
    return res.status(500).json({ ok: false, mensaje: "Error interno al obtener el estado de pago" })
  }
}