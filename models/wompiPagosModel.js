import pool from "../config/db.js"

export const guardarTransaccionWompi = (id_pedido, id_transaccion) =>
  pool.query(
    `UPDATE pedidos
     SET payment_intent_id = $1
     WHERE id_pedido = $2`,
    [id_transaccion, id_pedido]
  )