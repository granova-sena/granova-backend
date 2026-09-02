import pool from "../config/db.js"
import { esResultadoValido } from "../utils/pasarela.js"
import { aplicarResultadoPago, METODOS_PASARELA } from "../services/confirmarPagoService.js"

// ─────────────────────────────────────────
// POST /api/pagos/:referencia/procesar { resultado: 'aprobado' | 'rechazado' }
// Simula el retorno de la pasarela. Solo el dueño del pedido (o admin/empleado).
// Los efectos laterales del resultado se comparten con Wompi
// (services/confirmarPagoService.js).
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

    const pagoQuery = await client.query(
      `SELECT pg.id_pago, pg.id_pedido, pg.metodo_pago, pg.monto, pg.estado,
              p.id_cliente, p.estado AS estado_pedido, p.estado_pago, p.total
       FROM pagos pg
       JOIN pedidos p ON p.id_pedido = pg.id_pedido
       WHERE pg.referencia = $1
       FOR UPDATE OF pg`,
      [referencia]
    )

    if (pagoQuery.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, mensaje: "Referencia de pago no encontrada" })
    }

    const pago = pagoQuery.rows[0]

    const esAdmin = !!req.usuario?.rol
    const esDueno = Number(req.usuario?.id) === Number(pago.id_cliente)
    if (!esAdmin && !esDueno) {
      await client.query("ROLLBACK")
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para procesar este pago" })
    }

    if (!["pendiente", "fallido"].includes(pago.estado)) {
      await client.query("ROLLBACK")
      return res.status(400).json({ ok: false, mensaje: `Este pago ya fue procesado (${pago.estado})` })
    }
    if (!METODOS_PASARELA.includes(pago.metodo_pago)) {
      await client.query("ROLLBACK")
      return res.status(400).json({ ok: false, mensaje: "Este pedido no usa pasarela" })
    }

    if (resultado === 'aprobado') {
      const data = await aplicarResultadoPago(client, pago, 'aprobado')
      await client.query("COMMIT")
      return res.json({ ok: true, data })
    }

    // resultado === 'rechazado'
    const data = await aplicarResultadoPago(client, pago, 'rechazado')
    await client.query("COMMIT")
    return res.json({ ok: true, data })
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Error procesando pago:", error.message)
    return res.status(500).json({ ok: false, mensaje: "Error interno al procesar el pago" })
  } finally {
    client.release()
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

    const esAdmin = !!req.usuario?.rol
    const esDueno = Number(req.usuario?.id) === Number(pedido.id_cliente)
    if (!esAdmin && !esDueno) {
      return res.status(403).json({ ok: false, mensaje: "No tienes permiso para ver este pedido" })
    }

    const pagoQuery = await pool.query(
      `SELECT id_pago, metodo_pago, monto, referencia, estado, fecha_creacion, fecha_pago
       FROM pagos WHERE id_pedido = $1 ORDER BY id_pago DESC LIMIT 1`,
      [id]
    )

    return res.json({
      ok: true,
      data: {
        estado_pago: pedido.estado_pago,
        pago: pagoQuery.rows[0] || null,
        pedido: { estado: pedido.estado, total: Number(pedido.total) },
      },
    })
  } catch (error) {
    console.error("Error obteniendo estado de pago:", error.message)
    return res.status(500).json({ ok: false, mensaje: "Error interno al obtener el estado de pago" })
  }
}