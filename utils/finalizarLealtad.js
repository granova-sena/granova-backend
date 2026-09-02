// ─────────────────────────────────────────────────────────
// Beneficios de lealtad que se liquidan SOLO cuando el pago
// se confirma (pasarela aprobada o marca manual del panel):
//   1. Acumular unidades para el premio del 10% (cada 5).
//   2. Consumir el cupón guardado al crear el pedido.
// Llamar dentro de una transacción ya abierta (client.query("BEGIN")).
// ─────────────────────────────────────────────────────────
export async function finalizarBeneficiosLealtad(client, { id_pedido, id_cliente, esJuridica }) {
  const acumulado = await client.query(
    `SELECT unidades_acumuladas FROM clientes WHERE id_cliente = $1 FOR UPDATE`,
    [id_cliente]
  );
  const previo = Number(acumulado.rows[0]?.unidades_acumuladas) || 0;

  const detalle = await client.query(
    `SELECT COALESCE(SUM(cantidad), 0) AS total FROM detalle_pedidos WHERE id_pedido = $1`,
    [id_pedido]
  );
  const unidadesPedido = Number(detalle.rows[0]?.total) || 0;

  // Premio activo: el cliente acumuló 5+ unidades (no es persona jurídica).
  const premioAplicado = !esJuridica && previo >= 5;
  // Si consumió su premio, reinicia la acumulación desde cero; si no, suma.
  const unidadesAcumuladas = premioAplicado ? unidadesPedido : previo + unidadesPedido;

  await client.query(
    `UPDATE clientes SET unidades_acumuladas = $1 WHERE id_cliente = $2`,
    [unidadesAcumuladas, id_cliente]
  );

  // Consumir el cupón al cobrar (evita quemarlo si el pago falla).
  let cuponConsumido = false;
  const pedidoCupon = await client.query(
    `SELECT codigo_cupon FROM pedidos WHERE id_pedido = $1`,
    [id_pedido]
  );
  const codigo = pedidoCupon.rows[0]?.codigo_cupon;
  if (codigo) {
    const consumo = await client.query(
      `UPDATE cupones SET usado = true
       WHERE UPPER(codigo) = UPPER($1) AND id_cliente = $2 AND usado = false
       RETURNING id_cupon`,
      [codigo, id_cliente]
    );
    cuponConsumido = consumo.rows.length > 0;
  }

  return {
    unidades_acumuladas: unidadesAcumuladas,
    unidades_pedido: unidadesPedido,
    premio_aplicado: premioAplicado,
    cupon_consumido: cuponConsumido,
  };
}