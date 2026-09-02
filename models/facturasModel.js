import pool from "../config/db.js";

    
export const buscarPedidoPorId = (id_pedido)=>
    pool.query(`SELECT id_pedido,total,estado,estado_pago
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

export const insertarFactura = (client, { id_pedido, numero_factura, subtotal, impuestos, total, tipo_persona_cliente, numero_documento_cliente, razon_social_cliente, email_cliente }) =>
    client.query(
      `INSERT INTO facturas (id_pedido,numero_factura,subtotal,impuestos,total,prefijo,tipo_persona_cliente,numero_documento_cliente,razon_social_cliente,email_cliente)
        VALUES($1,$2,$3,$4,$5,'FE',$6,$7,$8,$9)
        RETURNING *`,
        [id_pedido, numero_factura, subtotal, impuestos, total, tipo_persona_cliente, numero_documento_cliente, razon_social_cliente, email_cliente]
);

export const obtenerItemsConIva = (id_pedido) =>
  pool.query(
    `SELECT dp.cantidad, dp.precio_unitario, pr.iva_pct
     FROM detalle_pedidos dp
     JOIN productos pr ON pr.id_producto = dp.id_producto
     WHERE dp.id_pedido = $1`,
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
       f.tipo_persona_cliente,
       f.numero_documento_cliente,
       f.razon_social_cliente,
       f.email_cliente,
       p.id_cliente,
       p.metodo_pago,
       p.direccion_envio,
       p.ciudad_envio,
       p.descuento     AS descuento_pedido,
       0               AS costo_envio,
       p.estado        AS estado_pedido,
       p.estado_pago,
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
       pr.presentacion AS producto_presentacion,
       pr.precio       AS precio_original
     FROM detalle_pedidos dp
     JOIN productos pr ON dp.id_producto = pr.id_producto
     WHERE dp.id_pedido = $1`,
    [id_pedido]
  );