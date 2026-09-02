export function formatearNumeroPedido(id_pedido) {
  return `PED-${String(id_pedido).padStart(6, '0')}`
}