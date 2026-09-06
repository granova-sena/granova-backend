import pool from '../config/db.js'; 
import { buscarClienteParaPedido } from '../models/clientesModel.js';
import { buscarProductoActivo, descontarStockProducto } from '../models/productosModel.js';
import { buscarFormatoActivo, descontarStockFormato } from '../models/formatosProductoModel.js';
import { buscarPromocionVigente } from '../models/promocionesModel.js';
import { buscarCuponValido, marcarCuponUsado } from '../models/cuponesModel.js';
import { insertarPedido } from '../models/pedidosModel.js';
import { insertarDetallePedido } from '../models/detallePedidosModel.js';
import { crearSesionPago } from '../utils/pasarela.js';
import { formatearNumeroPedido } from '../utils/formatearNumeroPedido.js';

const UNIDADES_MINIMAS_DESCUENTO_MINORISTA = 5;
const DESCUENTO_MAYORISTA = 12;
const DESCUENTO_MINORISTA = 6;
const DESCUENTO_JURIDICA = 10;

const UMBRAL_UNIDADES_REPARTO = 20;
const UMBRAL_TOTAL_REPARTO = 500000;

const ES_PASARELA = ['tarjeta', 'pse', 'nequi', 'daviplata'];

class ErrorPedido extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

function calcularPrecioProducto({ precioBase, promoPct, pctVolumen, esJuridica }) {
  const pctGanador = Math.max(promoPct || 0, pctVolumen, esJuridica ? DESCUENTO_JURIDICA : 0);
  return pctGanador > 0 ? Math.round(precioBase * (1 - pctGanador / 100)) : precioBase;
}

async function procesarProductosDelPedido(client, productos, { esMayorista, esJuridica }) {
  const productosConPrecio = [];

  for (const p of productos) {
    const { rows: filasProducto } = await buscarProductoActivo(client, p.id_producto);
    if (filasProducto.length === 0) {
      throw new ErrorPedido(`Producto con id ${p.id_producto} no encontrado o inactivo`, 'NO_ENCONTRADO');
    }
    const { stock, nombre, precio, precio_mayorista } = filasProducto[0];
    const cantidad = Math.floor(Number(p.cantidad));

    let id_formato = p.id_formato || null;
    let formatoStock = null;
    let precioFormato = null;

    if (id_formato) {
      const { rows: filasFormato } = await buscarFormatoActivo(client, id_formato, p.id_producto);
      if (filasFormato.length === 0) {
        throw new ErrorPedido(`El formato ${id_formato} no pertenece al producto "${nombre}" o está inactivo`, 'NO_ENCONTRADO');
      }
      formatoStock = Number(filasFormato[0].stock);
      precioFormato = Number(filasFormato[0].precio);
      id_formato = Number(id_formato);
    }

    const stockDisponible = formatoStock != null ? formatoStock : Number(stock);
    if (stockDisponible < cantidad) {
      throw new ErrorPedido(
        `Stock insuficiente${formatoStock != null ? " de este formato" : ""} para "${nombre}". Disponible: ${stockDisponible}`,
        'STOCK_INSUFICIENTE'
      );
    }

    const precioBase = precioFormato != null
      ? precioFormato
      : esMayorista && precio_mayorista != null ? Number(precio_mayorista) : Number(precio);

    const { rows: filasPromo } = await buscarPromocionVigente(client, p.id_producto);
    const promoPct = filasPromo.length > 0 ? Number(filasPromo[0].valor_descuento) : 0;

    productosConPrecio.push({ ...p, id_formato, precio_base: precioBase, promo_pct: promoPct, cantidad });
  }

  const totalUnidades = productosConPrecio.reduce((acc, p) => acc + p.cantidad, 0);
  const pctVolumen = esMayorista
    ? DESCUENTO_MAYORISTA
    : (totalUnidades >= UNIDADES_MINIMAS_DESCUENTO_MINORISTA ? DESCUENTO_MINORISTA : 0);

  for (const p of productosConPrecio) {
    p.precio_unitario = calcularPrecioProducto({
      precioBase: p.precio_base,
      promoPct: p.promo_pct,
      pctVolumen,
      esJuridica,
    });
  }

  return productosConPrecio;
}

async function aplicarCupon(client, codigo_cupon, id_cliente, esJuridica) {
  if (!codigo_cupon || !String(codigo_cupon).trim()) return null;

  if (esJuridica) {
    throw new ErrorPedido('Los cupones de lealtad no aplican para cuentas empresariales', 'CUPON_NO_PERMITIDO');
  }

  const { rows } = await buscarCuponValido(client, String(codigo_cupon).trim(), id_cliente);
  if (rows.length === 0) {
    throw new ErrorPedido('Cupón inválido, vencido o ya utilizado', 'CUPON_INVALIDO');
  }
  return rows[0];
}

export async function crearPedidoCompleto({ id_cliente, metodo_pago, direccion_envio, ciudad_envio, productos, codigo_cupon, sector_envio }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: filasCliente } = await buscarClienteParaPedido(client, id_cliente);
    if (filasCliente.length === 0) {
      throw new ErrorPedido('Cliente no encontrado', 'NO_ENCONTRADO');
    }
    const esMayorista = filasCliente[0].tipo_cliente === 'mayorista';
    const esJuridica = filasCliente[0].tipo_persona === 'juridica';

    const productosConPrecio = await procesarProductosDelPedido(client, productos, { esMayorista, esJuridica });
    const cupon = await aplicarCupon(client, codigo_cupon, id_cliente, esJuridica);

    const subtotalSinCupon = productosConPrecio.reduce((acc, p) => acc + p.precio_unitario * p.cantidad, 0);
    const descuentoCuponMonto = cupon ? Math.round(subtotalSinCupon * Number(cupon.descuento_pct) / 100) : 0;
    const total = subtotalSinCupon - descuentoCuponMonto;

    // Mismas reglas de operación y estados que controllers/pedidosController.js:
    // el pedido nace 'confirmado' y la pasarela modifica estado_pago al aprobar.
    const esPasarela = ES_PASARELA.includes(metodo_pago);
    const estadoInicial = 'confirmado';
    const estadoPagoInicial = metodo_pago === 'contra_entrega'
      ? 'pendiente'
      : esPasarela ? 'pendiente' : 'pendiente_verificacion';

    const totalUnidades = productosConPrecio.reduce((acc, p) => acc + p.cantidad, 0);
    const esReparto =
      esMayorista || esJuridica ||
      totalUnidades >= UMBRAL_UNIDADES_REPARTO ||
      total >= UMBRAL_TOTAL_REPARTO;
    const operacion = esReparto ? 'reparto' : 'domicilio';
    const sector = String(sector_envio || '').trim() || null;

    const { rows: filasPedido } = await insertarPedido(client, {
      id_cliente, metodo_pago, direccion_envio, ciudad_envio,
      total, descuento: descuentoCuponMonto,
      codigo_cupon: cupon ? cupon.codigo : null,
      estado: estadoInicial, estado_pago: estadoPagoInicial,
      operacion, sector_envio: sector,
    });
    const id_pedido = filasPedido[0].id_pedido;

    // Sesión de pago de pasarela (igual que pedidosController): crea la fila
    // en `pagos` para que el pedido salga pagable con el flujo /api/pagos.
    let referenciaPago = null;
    if (esPasarela) {
      const sesion = crearSesionPago({ monto: total, metodo_pago });
      referenciaPago = sesion.referencia;
      await client.query(
        `INSERT INTO pagos (id_pedido, metodo_pago, monto, referencia, estado)
         VALUES ($1, $2, $3, $4, 'pendiente')`,
        [id_pedido, metodo_pago, total, referenciaPago]
      );
    }

    for (const p of productosConPrecio) {
      const subtotal = p.precio_unitario * p.cantidad;
      await insertarDetallePedido(client, {
        id_pedido, id_producto: p.id_producto, id_formato: p.id_formato,
        cantidad: p.cantidad, precio_unitario: p.precio_unitario, subtotal,
      });
      await descontarStockProducto(client, p.id_producto, p.cantidad);
      if (p.id_formato) {
        await descontarStockFormato(client, p.id_formato, p.cantidad);
      }
    }

    if (cupon) {
      await marcarCuponUsado(client, cupon.id_cupon);
    }

    await client.query('COMMIT');

    return {
      id_pedido,
      numero_pedido: formatearNumeroPedido(id_pedido),
      estado: estadoInicial,
      estado_pago: estadoPagoInicial,
      operacion,
      sector_envio: sector,
      total,
      pago: referenciaPago ? { referencia: referenciaPago, metodo_pago } : null,
      puntos_pendientes: esJuridica ? 0 : Math.floor(total / 1000),
      descuento_productos: productosConPrecio.reduce((acc, p) => acc + (p.precio_base - p.precio_unitario) * p.cantidad, 0),
      ...(cupon && { descuento_aplicado: descuentoCuponMonto, descuento_fuente: 'cupon', codigo_cupon: cupon.codigo }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error; 
  } finally {
    client.release();
  }
}
export async function calcularTotalActual({ id_cliente, productos, codigo_cupon }) {
  const client = await pool.connect();
  try {
    const { rows: filasCliente } = await buscarClienteParaPedido(client, id_cliente);
    if (filasCliente.length === 0) {
      throw new ErrorPedido('Cliente no encontrado', 'NO_ENCONTRADO');
    }
    const esMayorista = filasCliente[0].tipo_cliente === 'mayorista';
    const esJuridica = filasCliente[0].tipo_persona === 'juridica';

    const productosConPrecio = await procesarProductosDelPedido(client, productos, { esMayorista, esJuridica });
    const cupon = await aplicarCupon(client, codigo_cupon, id_cliente, esJuridica);

    const subtotalSinCupon = productosConPrecio.reduce((acc, p) => acc + p.precio_unitario * p.cantidad, 0);
    const descuentoCuponMonto = cupon ? Math.round(subtotalSinCupon * Number(cupon.descuento_pct) / 100) : 0;

    return { total: subtotalSinCupon - descuentoCuponMonto, subtotal: subtotalSinCupon };
  } finally {
    client.release();
  }
}