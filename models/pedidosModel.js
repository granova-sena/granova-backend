import pool from "../config/db.js"


export const buscarPedidoPorId = (id_pedido) =>
  pool.query(
    `SELECT id_pedido, total, estado, id_cliente
     FROM pedidos
     WHERE id_pedido = $1`,
    [id_pedido]
  )

export const guardarPaymentIntent = (id_pedido, payment_intent_id) =>
  pool.query(
    `UPDATE pedidos
     SET payment_intent_id = $1
     WHERE id_pedido = $2`,
    [payment_intent_id, id_pedido]
  )

export const actualizarEstadoPedido = (id_pedido, estado) =>
  pool.query(
    `UPDATE pedidos
     SET estado = $1
     WHERE id_pedido = $2`,
    [estado, id_pedido]
  )
export const obtenerPrecioProducto =(id_producto) =>
  pool.query(`SELECT precio, stock, nombre, estado
    FROM productos
    WHERE id_producto = $1`,
   [id_producto]
)
export const verificarClientePedido = (id_pedido, id_cliente) =>
  pool.query(`
    SELECT id_pedido
    FROM pedidos
    WHERE id_pedido = $1 AND id_cliente = $2`,
  [id_pedido, id_cliente]);
export const actualizarEstadoPago = (id_pedido,estado_pago) =>
  pool.query(
    `UPDATE pedidos
    SET estado_pago = $1
    Where id_pedido = $2`,
  [estado_pago, id_pedido])