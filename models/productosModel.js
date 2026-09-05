export const buscarProductoActivo = (client, id_producto) =>
client.query(
`SELECT id_producto, stock, nombre, precio, precio_mayorista 
    FROM productos WHERE id_producto = $1 AND estado = 'activo'`,
[id_producto]
);  

export const descontarStockProducto = (client, id_producto, cantidad) =>
  client.query(
    `UPDATE productos SET stock = stock - $1 WHERE id_producto = $2`,
    [cantidad, id_producto]
  );