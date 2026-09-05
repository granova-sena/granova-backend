import pool from "../config/db.js"

export const buscarPedidoConCliente = (id_pedido) =>
  pool.query(
    `SELECT p.*, c.nombre, c.apellido, c.email
     FROM pedidos p
     JOIN clientes c ON p.id_cliente = c.id_cliente
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

// Alineado al esquema de feature/jhon: incluye operacion y sector_envio
// (igual que controllers/pedidosController.js) para que el pedido creado
// desde una cotización nazca idéntico a los pedidos normales.
export const insertarPedido = (client, { id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago, operacion = 'domicilio', sector_envio }) =>
  client.query(
    `INSERT INTO pedidos (id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago, operacion, sector_envio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id_pedido`,
    [id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon, estado, estado_pago, operacion, sector_envio]
  );