import { pool } from '../config/db.js';
export const insertarProductoCotizacion = (client, {
  id_cotizacion, id_producto, id_formato, nombre, presentacion,
  etiqueta_formato, precio_unitario, cantidad, peso_kg, promo_pct, iva_pct,
}) =>
  client.query(
    `INSERT INTO cotizaciones_productos
       (id_cotizacion, id_producto, id_formato, nombre, presentacion, etiqueta_formato, precio_unitario, cantidad, peso_kg, promo_pct, iva_pct)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id_cotizacion, id_producto, id_formato, nombre, presentacion, etiqueta_formato, precio_unitario, cantidad, peso_kg, promo_pct, iva_pct]
  );

export const buscarProductosPorCotizacion = (id_cotizacion) =>
  pool.query(
    `SELECT * FROM cotizaciones_productos WHERE id_cotizacion = $1`,
    [id_cotizacion]
  );