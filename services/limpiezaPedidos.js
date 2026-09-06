import pool from "../config/db.js"
import { devolverStockPedido } from "../utils/stockPedido.js"

// Pedidos creados por pasarela online (su pago se confirma con Wompi).
const METODOS_PASARELA = ["tarjeta", "pse", "nequi", "daviplata"]

// ─────────────────────────────────────────
// Cancela pedidos de pasarela cuyo pago lleva más de `horas` pendiente.
// Se corre periódicamente desde server.js. Devuelve el stock reservado
// (productos + formatos) y deja el pedido en estado 'cancelado' con el
// motivo del rechazo. Idempotente y segura: solo toca pedidos que siguen
// en estado 'confirmado' con pago 'pendiente'.
// ─────────────────────────────────────────
export async function cancelarPendientesVencidos({ horas = 3 } = {}) {
  const client = await pool.connect()
  const cancelados = []

  try {
    await client.query("BEGIN")

    const vencidos = await client.query(
      `SELECT p.id_pedido
         FROM pedidos p
        WHERE p.estado_pago = 'pendiente'
          AND p.estado = 'confirmado'
          AND lower(p.metodo_pago) = ANY($1)
          AND p.fecha_pedido <= NOW() - ($2::text || ' hours')::interval
        ORDER BY p.fecha_pedido
        LIMIT 200
        FOR UPDATE SKIP LOCKED`,
      [METODOS_PASARELA, String(horas)]
    )

    for (const fila of vencidos.rows) {
      await devolverStockPedido(client, fila.id_pedido)
      await client.query(
        `UPDATE pedidos SET estado = 'cancelado', motivo_rechazo = $1 WHERE id_pedido = $2`,
        ["Cancelado automáticamente: el pago pendiente venció", fila.id_pedido]
      )
      cancelados.push(Number(fila.id_pedido))
    }

    if (cancelados.length > 0) {
      await client.query(
        `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
         SELECT p.id_cliente, 'pedido', 'Pedido cancelado ⏳', 'Tu pedido venció sin completar el pago y fue cancelado. Vuelve a pedir cuando quieras.', p.id_pedido
           FROM pedidos p WHERE p.id_pedido = ANY($1)`,
        [cancelados]
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("Error en limpieza de pedidos pendientes:", error.message)
  } finally {
    client.release()
  }

  return cancelados
}