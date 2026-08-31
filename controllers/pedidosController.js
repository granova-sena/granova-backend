import { crearPedidoCompleto } from '../services/pedidosService.js';
import { obtenerPedidoConDetalle, obtenerPedidosDeCliente } from '../services/pedidosService.js';

export async function obtenerPedido(req, res) {
  const { id } = req.params;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: 'El id del pedido debe ser un número' });
  }

  try {
    const pedido = await obtenerPedidoConDetalle(id);

    const esAdmin = !!req.usuario?.rol;
    const esDueno = req.usuario?.id === pedido.id_cliente;
    if (!esAdmin && !esDueno) {
      return res.status(403).json({ ok: false, mensaje: 'No tienes permiso para ver este pedido' });
    }

    res.status(200).json({ ok: true, data: pedido });
  } catch (error) {
    const status = error.codigo === 'NO_ENCONTRADO' ? 404 : 500;
    console.error('Error obteniendo pedido:', error.message);
    res.status(status).json({ ok: false, mensaje: status === 404 ? error.message : 'Error interno al obtener el pedido' });
  }
}

export async function obtenerPedidosCliente(req, res) {
  const { id_cliente } = req.params;

  if (Number.isNaN(Number(id_cliente))) {
    return res.status(400).json({ ok: false, mensaje: 'El id del cliente debe ser un número' });
  }

  const esAdmin = !!req.usuario?.rol;
  const esDueno = req.usuario?.id === Number(id_cliente);
  if (!esAdmin && !esDueno) {
    return res.status(403).json({ ok: false, mensaje: 'No tienes permiso para ver estos pedidos' });
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  try {
    const { pedidos, paginacion } = await obtenerPedidosDeCliente(id_cliente, page, limit);
    res.status(200).json({ ok: true, data: pedidos, paginacion });
  } catch (error) {
    console.error('Error obteniendo pedidos del cliente:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener los pedidos' });
  }
}

const METODOS_PAGO_PERMITIDOS = ['tarjeta', 'pse', 'efectivo', 'transferencia', 'contra_entrega', 'nequi', 'daviplata'];

const STATUS_POR_CODIGO = {
  NO_ENCONTRADO: 404,
  STOCK_INSUFICIENTE: 400,
  CUPON_INVALIDO: 400,
  CUPON_NO_PERMITIDO: 400,
};

export async function crearPedido(req, res) {
  const { id_cliente, metodo_pago, direccion_envio, ciudad_envio, productos, codigo_cupon } = req.body;

  if (!id_cliente || !metodo_pago || !direccion_envio || !ciudad_envio || !productos?.length) {
    return res.status(400).json({ ok: false, mensaje: 'Faltan campos obligatorios' });
  }

  if (req.usuario?.rol || Number(req.usuario?.id) !== Number(id_cliente)) {
    return res.status(403).json({ ok: false, mensaje: 'Solo puedes crear pedidos con tu propia cuenta' });
  }

  if (!METODOS_PAGO_PERMITIDOS.includes(metodo_pago)) {
    return res.status(400).json({
      ok: false,
      mensaje: `Método de pago inválido. Opciones: ${METODOS_PAGO_PERMITIDOS.join(', ')}`,
    });
  }

  for (const p of productos) {
    if (!p.id_producto || !Number.isInteger(Number(p.cantidad)) || Number(p.cantidad) <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: `Producto con id ${p.id_producto || '?'} tiene cantidad inválida: ${p.cantidad}`,
      });
    }
  }

  try {
    const resultado = await crearPedidoCompleto({
      id_cliente, metodo_pago, direccion_envio, ciudad_envio, productos, codigo_cupon,
    });

    res.status(201).json({
      ok: true,
      data: resultado,
      mensaje:
        resultado.estado_pago === 'pendiente_verificacion'
          ? 'Pedido creado. Tu pago está pendiente de verificación por el equipo.'
          : metodo_pago === 'contra_entrega'
            ? 'Pedido creado. Pagas al recibir.'
            : 'Pedido creado. Completa tu pago para confirmarlo.',
    });
  } catch (error) {
    const status = STATUS_POR_CODIGO[error.codigo] ?? 500;
    console.error('Error creando pedido:', error.message);
    res.status(status).json({
      ok: false,
      mensaje: status === 500 ? 'Error interno al crear el pedido' : error.message,
    });
  }
}

