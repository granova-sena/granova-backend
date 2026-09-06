import pool from "../config/db.js"
import { esResultadoValido, modoPasarela } from "../utils/pasarela.js"
import { aplicarResultadoPago, METODOS_PASARELA } from "../services/confirmarPagoService.js"
import { calcularFirmaIntegridad } from "../services/wompiService.js"
import { WOMPI_PUBLIC_KEY, MONEDA_DEFECTO } from "../config/wompi.js"

// Referencia GRANOVA-{id}-{timestamp} que Wompi exige (única por intención de
// pago). Reutiliza la que ya quedó persistida si el pedido sigue pendiente
// (evita regenerarla en cada consulta/poll); genera una nueva en reintentos
// tras un fallo y la deja en pagos.referencia.
async function prepararReferenciaWompi(id_pedido, pago, estado_pago) {
  const previa = pago?.referencia
  if (estado_pago === "pendiente" && previa && /^GRANOVA-\d+-/.test(previa)) {
    return previa
  }
  const referencia = `GRANOVA-${id_pedido}-${Date.now()}`
  await pool.query(`UPDATE pagos SET referencia = $1 WHERE id_pedido = $2`, [referencia, id_pedido])
  return referencia
}

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
      `SELECT p.id_pedido, p.id_cliente, p.estado, p.estado_pago, p.total, p.metodo_pago,
              p.direccion_envio, p.ciudad_envio,
              c.nombre, c.apellido, c.email, c.telefono, c.departamento
       FROM pedidos p
       JOIN clientes c ON c.id_cliente = p.id_cliente
       WHERE p.id_pedido = $1`,
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
    const pago = pagoQuery.rows[0] || null

    // Config del Checkout/Widget de Wompi. Solo se genera cuando el pedido
    // está pendiente/fallido, usa un método de pasarela y el backend corre
    // con PASARELA=wompi y llave pública configurada. Si no, es null y el
    // frontend usa la pasarela simulada.
    let checkout = null
    const metodo = (pedido.metodo_pago || "").toLowerCase()
    const esMetodoPasarela = METODOS_PASARELA.includes(metodo)
    if (modoPasarela() === "wompi" && esMetodoPasarela && WOMPI_PUBLIC_KEY && ["pendiente", "fallido"].includes(pedido.estado_pago) && pedido.estado !== "cancelado") {
      const montoEnCentavos = Math.round(Number(pedido.total) * 100)
      const referencia = await prepararReferenciaWompi(id, pago, pedido.estado_pago)
      if (pago && pago.referencia !== referencia) {
        pago.referencia = referencia
      }

      if (referencia) {
        const nombreCompleto = [pedido.nombre, pedido.apellido].filter(Boolean).join(" ").trim()

        // El widget de Wompi exige llaves camelCase (fullName/phoneNumber/
        // addressLine1) y NUNCA valores undefined: solo se envían los campos
        // presentes. La firma va como { integrity }.
        const customer_data = {}
        if (pedido.email) customer_data.email = pedido.email
        if (nombreCompleto) customer_data.fullName = nombreCompleto
        if (pedido.telefono) {
          customer_data.phoneNumber = pedido.telefono
          // Wompi exige el prefijo del país junto al phoneNumber (formato "+57").
          customer_data.phoneNumberPrefix = "+57"
        }

        let shipping_address = null
        if (pedido.direccion_envio && pedido.ciudad_envio && pedido.departamento && pedido.telefono) {
          shipping_address = {
            addressLine1: pedido.direccion_envio,
            city: pedido.ciudad_envio,
            country: "CO",
            region: pedido.departamento,
            phoneNumber: pedido.telefono,
          }
        }

        checkout = {
          currency: MONEDA_DEFECTO,
          amount_in_cents: montoEnCentavos,
          reference: referencia,
          public_key: WOMPI_PUBLIC_KEY,
          signature: { integrity: calcularFirmaIntegridad({ referencia, montoEnCentavos }) },
          customer_data: Object.keys(customer_data).length > 0 ? customer_data : undefined,
          shipping_address: shipping_address || undefined,
        }
      }
    }

    return res.json({
      ok: true,
      data: {
        estado_pago: pedido.estado_pago,
        pago,
        pedido: { estado: pedido.estado, total: Number(pedido.total) },
        checkout,
      },
    })
  } catch (error) {
    console.error("Error obteniendo estado de pago:", error.message)
    return res.status(500).json({ ok: false, mensaje: "Error interno al obtener el estado de pago" })
  }
}