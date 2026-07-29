import pool from "../config/db.js";

    
export const buscarPedidoPorId = (id_pedido)=>
    pool.query(`SELECT id_pedido,total,estado
        FROM pedidos
        WHERE id_pedido = $1`,
    [id_pedido]
);
export const buscarFacturaPorPedido = (id_pedido)=>
    pool.query(`SELECT id_factura
        FROM facturas
        WHERE id_pedido = $1`,
    [id_pedido]
); 
export const contarFacturas = ()=>
    pool.query(`SELECT COUNT(*) FROM facturas `);

export const insertarFactura = (client, { id_pedido, numero_factura, subtotal, impuestos, total }) =>
    client.query(
      `INSERT INTO facturas (id_pedido,numero_factura,subtotal,impuestos,total)
        VALUES($1,$2,$3,$4,$5)
        RETURNING *`,
        [id_pedido, numero_factura, subtotal, impuestos, total]
);

export const obtenerFacturaCompleta = (id_pedido) =>
  pool.query(
    `SELECT
       f.id_factura,
       f.numero_factura,
       f.fecha_emision,
       f.subtotal,
       f.impuestos,
       f.total,
       f.estado,
       p.metodo_pago,
       p.direccion_envio,
       p.ciudad_envio,
       p.estado        AS estado_pedido,
       c.nombre        AS nombre_cliente,
       c.apellido      AS apellido_cliente,
       c.email         AS email_cliente
     FROM facturas f
     JOIN pedidos  p ON f.id_pedido  = p.id_pedido
     JOIN clientes c ON p.id_cliente = c.id_cliente
     WHERE f.id_pedido = $1`,
    [id_pedido]
  );

export const obtenerProductosDePedido = (id_pedido) =>
  pool.query(
    `SELECT
       dp.cantidad,
       dp.precio_unitario,
       dp.subtotal,
       pr.nombre       AS producto_nombre,
       pr.presentacion AS producto_presentacion
     FROM detalle_pedidos dp
     JOIN productos pr ON dp.id_producto = pr.id_producto
     WHERE dp.id_pedido = $1`,
    [id_pedido]
  );