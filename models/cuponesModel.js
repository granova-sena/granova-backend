export const buscarCuponValido = (client, codigo, id_cliente) =>
  client.query(
    `SELECT id_cupon, codigo, descuento_pct FROM cupones
     WHERE UPPER(codigo) = UPPER($1) AND id_cliente = $2 AND usado = false
       AND fecha_vencimiento > CURRENT_DATE
     FOR UPDATE`,
    [codigo, id_cliente]
  );

export const marcarCuponUsado = (client, id_cupon) =>
  client.query(`UPDATE cupones SET usado = true WHERE id_cupon = $1`, [id_cupon]);