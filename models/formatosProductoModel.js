export const buscarFormatoActivo = (client, id_formato, id_producto) =>
  client.query(
    `SELECT id_formato, precio, stock FROM formatos_producto
     WHERE id_formato = $1 AND id_producto = $2 AND activo = true`,
    [id_formato, id_producto]
  );

export const descontarStockFormato = (client, id_formato, cantidad) =>
  client.query(
    `UPDATE formatos_producto SET stock = stock - $1 WHERE id_formato = $2`,
    [cantidad, id_formato]
  );