// Helpers de stock compartidos entre pedidos (cliente), pasarela y panel admin.

export async function descontarStockFormato(client, { id_formato, id_producto, cantidad }) {
  if (!id_formato) return
  await client.query(
    `UPDATE public.formatos_producto SET stock = stock - $1
     WHERE id_formato = $2 AND id_producto = $3`,
    [cantidad, id_formato, id_producto]
  )
}

// Vuelve a reservar el stock de un pedido (productos + formatos).
// Se usa al reintentar un pago que antes falló (el stock se había devuelto).
export async function descontarStockPedido(client, idPedido) {
  const items = await client.query(
    `SELECT id_producto, id_formato, cantidad FROM public.detalle_pedidos WHERE id_pedido = $1`,
    [idPedido]
  )

  for (const item of items.rows) {
    await client.query(
      `UPDATE public.productos SET stock = stock - $1 WHERE id_producto = $2`,
      [item.cantidad, item.id_producto]
    )
    if (item.id_formato) {
      await client.query(
        `UPDATE public.formatos_producto SET stock = stock - $1 WHERE id_formato = $2`,
        [item.cantidad, item.id_formato]
      )
    }
  }
}

// Devuelve el stock reservado de un pedido (productos + formatos).
// Se usa al rechazar, cancelar o cuando un pago falla.
export async function devolverStockPedido(client, idPedido) {
  const items = await client.query(
    `SELECT id_producto, id_formato, cantidad FROM public.detalle_pedidos WHERE id_pedido = $1`,
    [idPedido]
  )

  for (const item of items.rows) {
    await client.query(
      `UPDATE public.productos SET stock = stock + $1 WHERE id_producto = $2`,
      [item.cantidad, item.id_producto]
    )
    if (item.id_formato) {
      await client.query(
        `UPDATE public.formatos_producto SET stock = stock + $1 WHERE id_formato = $2`,
        [item.cantidad, item.id_formato]
      )
    }
  }
}