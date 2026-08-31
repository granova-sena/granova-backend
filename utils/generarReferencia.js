export function generarReferenciasPago(id_pedido){
  return `GRANOVA-${id_pedido}-${Date.now()}`;
}