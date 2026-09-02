import { descontarStockPedido, devolverStockPedido } from "../utils/stockPedido.js"
import { finalizarBeneficiosLealtad } from "../utils/finalizarLealtad.js"

export const METODOS_PASARELA = ["tarjeta", "pse", "nequi", "daviplata"]

// ─────────────────────────────────────────
// Aplica el desenlace de un pago ('aprobado' | 'rechazado') DENTRO de una
// transacción ya abierta (client.query("BEGIN")). Lo comparten:
//   - POST /api/pagos/:referencia/procesar  (simulador)
//   - Webhook y consulta de transacciones de Wompi (pago real)
// De esa forma los efectos laterales (puntos, premio de lealtad, consumo
// del cupón, stock, notificaciones) son idénticos en ambos caminos.
//
// Se espera `pago` con la forma:
//   { id_pago, id_pedido, metodo_pago, monto, estado,
//     id_cliente, estado_pedido, estado_pago, total }
// Idempotente: solo aplica si pagos.estado sigue en pendiente/fallido.
// ─────────────────────────────────────────
export async function aplicarResultadoPago(client, pago, resultado) {
  if (!["pendiente", "fallido"].includes(pago.estado)) {
    return null
  }

  if (resultado === "aprobado") {
    await client.query(
      `UPDATE pagos SET estado = 'aprobado', fecha_pago = NOW() WHERE id_pago = $1`,
      [pago.id_pago]
    )

    const nuevoEstadoPedido = pago.estado_pedido === "pendiente" ? "confirmado" : pago.estado_pedido
    await client.query(
      `UPDATE pedidos SET estado_pago = 'pagado', estado = $1 WHERE id_pedido = $2`,
      [nuevoEstadoPedido, pago.id_pedido]
    )

    // Si es un REINTENTO tras un fallo, el stock se había devuelto al
    // rechazar; vuelve a reservarlo para que la venta quede consistente.
    if (pago.estado === "fallido") {
      await descontarStockPedido(client, pago.id_pedido)
    }

    await client.query(
      `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
       VALUES ($1, $2, $3, $4, $5)`,
      [pago.id_cliente, "pago", "Pago aprobado ✅", `Recibimos tu pago por $${Number(pago.monto).toLocaleString("es-CO")}. Tu pedido ya está confirmado.`, pago.id_pedido]
    )

    // Puntos de lealtad recién cuando el pago se confirma.
    const cliente = await client.query(
      `SELECT tipo_persona FROM clientes WHERE id_cliente = $1`,
      [pago.id_cliente]
    )
    const esJuridica = cliente.rows[0]?.tipo_persona === "juridica"
    const puntos = esJuridica ? 0 : Math.floor(Number(pago.total) / 1000)
    if (puntos > 0) {
      await client.query(`UPDATE clientes SET puntos = puntos + $1 WHERE id_cliente = $2`, [puntos, pago.id_cliente])
    }

    // Premio de lealtad (unidades) y consumo del cupón al cobrar.
    const beneficios = await finalizarBeneficiosLealtad(client, {
      id_pedido: pago.id_pedido,
      id_cliente: pago.id_cliente,
      esJuridica,
    })

    return {
      estado_pago: "pagado",
      estado: nuevoEstadoPedido,
      puntos_ganados: puntos,
      unidades_acumuladas: beneficios.unidades_acumuladas,
      premio_aplicado: beneficios.premio_aplicado,
    }
  }

  // resultado === "rechazado"
  await client.query(`UPDATE pagos SET estado = 'fallido' WHERE id_pago = $1`, [pago.id_pago])
  await client.query(`UPDATE pedidos SET estado_pago = 'fallido' WHERE id_pedido = $1`, [pago.id_pedido])

  // Solo se devuelve el stock la PRIMERA vez que el pago falla; un
  // reintento que vuelva a fallar no debe devolver el stock dos veces.
  if (pago.estado === "pendiente") {
    await devolverStockPedido(client, pago.id_pedido)
  }

  await client.query(
    `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
     VALUES ($1, $2, $3, $4, $5)`,
    [pago.id_cliente, "pago", "Pago no procesado ⚠️", `El pago por $${Number(pago.monto).toLocaleString("es-CO")} no se procesó. Puedes intentarlo de nuevo.`, pago.id_pedido]
  )

  return { estado_pago: "fallido", estado: pago.estado_pedido }
}