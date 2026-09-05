export const buscarClienteParaPedido = (client, id_cliente) =>
  client.query(
    `SELECT id_cliente, tipo_cliente, tipo_persona FROM clientes WHERE id_cliente = $1`,
    [id_cliente]
  );