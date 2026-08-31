import pool from "../../config/db.js"

// ─────────────────────────────────────────
// Conexión reparto del empleado → stock del catálogo:
// cada presentación distribuida se refleja como stock (unidades/bolsas)
// en el formato del producto que ve el cliente. Si el producto todavía
// no tiene formato para esa presentación, se crea automáticamente.
// ─────────────────────────────────────────
export async function sumarStockFormato(client, { idProducto, presentacion, cantidad, precioPublico }) {
  const existente = await client.query(
    `SELECT id_formato FROM formatos_producto
     WHERE id_producto = $1 AND id_presentacion = $2
     LIMIT 1`,
    [idProducto, presentacion.id_presentacion]
  );

  if (existente.rows.length > 0) {
    await client.query(
      `UPDATE formatos_producto SET stock = stock + $1 WHERE id_formato = $2`,
      [cantidad, existente.rows[0].id_formato]
    );
    return existente.rows[0].id_formato;
  }

  // No existe formato para esta presentación: se crea solo (mismo criterio
  // que el producto: el catálogo queda listo sin intervención manual).
  const creado = await client.query(
    `INSERT INTO formatos_producto (id_producto, etiqueta, peso_kg, precio, activo, stock, id_presentacion)
     VALUES ($1, $2, $3, $4, true, $5, $6)
     RETURNING id_formato`,
    [
      idProducto,
      presentacion.nombre,
      Number(presentacion.kg_equivalente),
      Math.round(precioPublico),
      cantidad,
      presentacion.id_presentacion,
    ]
  );
  return creado.rows[0].id_formato;
}

// Helper simple para otros usos (por si se necesita consultar fuera de transacción)
export async function consultarStockFormato(idProducto, idPresentacion) {
  const r = await pool.query(
    `SELECT stock FROM formatos_producto WHERE id_producto = $1 AND id_presentacion = $2 LIMIT 1`,
    [idProducto, idPresentacion]
  );
  return r.rows.length > 0 ? Number(r.rows[0].stock) : null;
}
