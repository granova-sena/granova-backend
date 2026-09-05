import pool from "../config/db.js";
export const insertarDetallePedido = (client, { id_pedido, id_producto, id_formato, cantidad, precio_unitario, subtotal }) =>
  client.query(
    `INSERT INTO detalle_pedidos (id_pedido, id_producto, id_formato, cantidad, precio_unitario, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id_pedido, id_producto, id_formato, cantidad, precio_unitario, subtotal]
  );
export const buscarDetallePorPedido = (id_pedido) =>
  pool.query(
    `SELECT dp.*, pr.nombre AS producto_nombre, pr.presentacion, pr.id_lote
     FROM detalle_pedidos dp
     JOIN productos pr ON dp.id_producto = pr.id_producto
     WHERE dp.id_pedido = $1`,
    [id_pedido]
  );