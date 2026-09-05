export const buscarPromocionVigente = (client, id_producto) =>
  client.query(
    `SELECT pr.valor_descuento
     FROM promocion_productos pp
     JOIN promociones pr ON pr.id_promocion = pp.id_promocion
     WHERE pp.id_producto = $1 AND pr.estado = 'activa'
       AND (pr.fecha_fin IS NULL OR pr.fecha_fin >= CURRENT_DATE)`,
    [id_producto]
  );