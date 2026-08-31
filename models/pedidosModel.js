import pool from "../config/db.js"

export const buscarPedidoConCliente = (id_pedido) =>
  pool.query(
    `SELECT p.*, c.nombre, c.apellido, c.email
     FROM pedidos p
     JOIN clientes c ON p.id_cliente = c.id_cliente
     WHERE p.id_pedido = $1`,
    [id_pedido]
  );
export const obtenerClienteDelPedido = (id_pedido) =>
  pool.query(
    `SELECT c.tipo_persona, c.tipo_documento, c.numero_documento, c.razon_social, c.nombre, c.apellido, c.email
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      WHERE p.id_pedido = $1`,
    [id_pedido]
  );

export const listarPedidosPorCliente = (id_cliente, limit, offset) =>
  pool.query(
    `SELECT id_pedido, fecha_pedido, estado, estado_pago, metodo_pago, direccion_envio, ciudad_envio, total
     FROM pedidos
     WHERE id_cliente = $1
     ORDER BY fecha_pedido DESC
     LIMIT $2 OFFSET $3`,
    [id_cliente, limit, offset]
  );

export const contarPedidosPorCliente = (id_cliente) =>
  pool.query(`SELECT COUNT(*) FROM pedidos WHERE id_cliente = $1`, [id_cliente]);



export const buscarPedidoPorId = (id_pedido)=>
    pool.query(`SELECT id_pedido,total,id_cliente,estado,estado_pago
        FROM pedidos
        WHERE id_pedido = $1`,
    [id_pedido]
);
export const insertarPedido = (client, { id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago }) =>
  client.query(
    `INSERT INTO pedidos (id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id_pedido`,
    [id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago]
  );

export const guardarPaymentIntent = (
  id_pedido,
  wompiTransaccionId,
  estado,
  metodoPago
) =>
  pool.query(
    `UPDATE pedidos
     SET 
       payment_intent_id = $1,
       estado_pago = $2,
       metodo_pago = $3
     WHERE id_pedido = $4`,
    [wompiTransaccionId, estado, metodoPago, id_pedido]
  );

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
    SELECT 
      id_pedido,
      total
    FROM pedidos
    WHERE id_pedido = $1
      AND id_cliente = $2
  `, [id_pedido, id_cliente]);
export const actualizarEstadoPago = (id_pedido,estado_pago) =>
  pool.query(
    `UPDATE pedidos
    SET estado_pago = $1
    Where id_pedido = $2`,
  [estado_pago, id_pedido])

export const buscarPedidoPorTransaccionWompi = (wompiTransaccionId) =>
  pool.query(`
    SELECT id_pedido
    FROM pedidos
    WHERE payment_intent_id = $1`,
    [wompiTransaccionId]
  );
export const verificarClientePedidoConDocumento = (id_pedido, id_cliente) =>
  pool.query(`
    SELECT 
      p.id_pedido,
      p.total,
      c.tipo_persona,
      c.tipo_documento,
      c.numero_documento
    FROM pedidos p
    JOIN clientes c ON c.id_cliente = p.id_cliente
    WHERE p.id_pedido = $1
      AND p.id_cliente = $2
  `, [id_pedido, id_cliente]);