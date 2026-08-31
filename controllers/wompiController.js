import {
  obtenerAcceptanceToken,
  calcularFirmaIntegridad,
  verificarFirmaWebhook,
  crearTransaccion,
  consultarTransaccion as consultarTransaccionWompi,
  listarBancosPSE,
} from "../services/wompiService.js";
import {
  buscarPedidoPorId,
  verificarClientePedido,
  guardarPaymentIntent,
  actualizarEstadoPedido,
  actualizarEstadoPago,
  buscarPedidoPorTransaccionWompi,
  verificarClientePedidoConDocumento
} from "../models/pedidosModel.js";
import { MONEDA_DEFECTO } from "../config/wompi.js";
import { generarReferenciasPago } from "../utils/generarReferencia.js";
import { mapearEstadoWompi } from "../utils/mapearEstadosWompi.js";

export const pagarConNequi = async (req, res) => {
  const { id_pedido, numero_celular } = req.body;

  if (!id_pedido || !numero_celular) {
    return res.status(400).json({
      ok: false,
      mensaje: "El id del pedido y el celular son obligatorios",
    });
  }
  if (!/^3\d{9}$/.test(numero_celular)) {
    return res.status(400).json({
      ok: false,
      mensaje: "El número de celular debe tener 10 dígitos y empezar por 3",
    });
  }

  try {
    const resultado = await verificarClientePedido(id_pedido, req.usuario.id);
    const pedido = resultado.rows[0];

    if (!pedido) {
      return res.status(403).json({ 
        ok: false,
        mensaje: "No tienes permisos para pagar este pedido" });
    }

    const montoEnCentavos = Math.round(Number(pedido.total) * 100);
    if (!Number.isFinite(montoEnCentavos) || montoEnCentavos <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "el pedido no tiene un monto válido"
      });
}
    const referencia = generarReferenciasPago(id_pedido);
    
    const acceptanceToken = await obtenerAcceptanceToken();
    const firmaIntegridad = calcularFirmaIntegridad({
      referencia,
      montoEnCentavos,
      moneda: MONEDA_DEFECTO,
    });

    const transaccion = await crearTransaccion({
      montoEnCentavos,
      moneda: MONEDA_DEFECTO,
      emailCliente: req.usuario.email,
      referencia,
      acceptanceToken,
      firmaIntegridad,
      metodoPago: { type: "NEQUI", phone_number: numero_celular },
    });

    
    await guardarPaymentIntent(id_pedido, transaccion.id,mapearEstadoWompi(transaccion.status), 'nequi');

    return res.status(200).json({
      ok: true,
      id_transaccion: transaccion.id,
      estado: transaccion.status,
      mensaje: "Notificación enviada a NEQUI. Aprueba el pago en tu app.",
    });
  } catch (error) {
    console.error("Error pagando con Nequi:", error.message);
    const mensajeWompi = error?.response?.data?.error?.messages?.join(", ");
    return res.status(error?.response?.status || 500).json({
      ok: false,
      mensaje: mensajeWompi || "Error al crear el pago",
    });
  }
};


const ESTADOS_FINALES = ['APPROVED', 'DECLINED', 'ERROR', 'VOIDED'];

export const consultarTransaccion = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ ok: false, mensaje: 'El id de la transacción es obligatorio' });
  }

  try {
    const transaccion = await consultarTransaccionWompi(id);

    // Red de seguridad: si el webhook aún no actualizó la BD pero Wompi
    // ya tiene un estado final, lo sincronizamos aquí mismo.
    if (ESTADOS_FINALES.includes(transaccion.status)) {
      const resultado = await buscarPedidoPorTransaccionWompi(id);
      const pedidoEncontrado = resultado.rows[0];
      if (pedidoEncontrado) {
        await guardarPaymentIntent(
          pedidoEncontrado.id_pedido,
          id,
          mapearEstadoWompi(transaccion.status),
          transaccion.payment_method_type?.toLowerCase()
        );
      }
    }

    return res.status(200).json({
      ok: true,
      data: {
        id: transaccion.id,
        estado: transaccion.status,
        mensaje: transaccion.status_message,
        referencia: transaccion.reference,
        metodoPago: transaccion.payment_method_type,
        urlBanco: transaccion.payment_method?.extra?.async_payment_url ?? null,
      },
    });
  } catch (error) {
    console.error('Error consultando transacción:', error.message);
    return res.status(error?.response?.status || 500).json({ ok: false, mensaje: 'No se pudo consultar la transacción' });
  }
};

export const webhookWompi = async (req, res) => {
  try {
    const { event, data, timestamp, signature } = req.body; 

    const firmaValida = verificarFirmaWebhook({
      propiedades: signature?.properties,
      dataEvento: data,
      timestamp,
      checksumRecibido: signature?.checksum,
    });

    if (!firmaValida) {
      console.error("Firma de webhook Wompi inválida");
      return res.status(401).json({ mensaje: "Firma inválida" });
    }

    // Solo procesamos cambios de estado de transacciones
    if (event !== "transaction.updated") {
      return res.status(200).json({ recibido: true });
    }

    const transaccion = data?.transaction;
    if (!transaccion) {
      return res.status(200).json({ recibido: true });
    }

    const resultado = await buscarPedidoPorTransaccionWompi(transaccion.id);
    const pedidoEncontrado = resultado.rows[0];

    if(!pedidoEncontrado){
      console.warn(`webhook recibido para transaccion desconocida: ${transaccion.id}`);
      return res.status(200).json({
        ok:   true
      })
    }

    const id_pedido = pedidoEncontrado.id_pedido;

    if (transaccion.status === "APPROVED") {
      await actualizarEstadoPedido(id_pedido, "confirmado");
      await actualizarEstadoPago(id_pedido, mapearEstadoWompi(transaccion.status)); 

    } else if (transaccion.status === "DECLINED" || transaccion.status === "ERROR") {
      await actualizarEstadoPedido(id_pedido, "cancelado");
      await actualizarEstadoPago(id_pedido, mapearEstadoWompi(transaccion.status)); 
    }

    return res.status(200).json({ recibido: true });
  } catch (error) {
    console.error("Error procesando webhook Wompi:", error.message);
    return res.status(500).json({ mensaje: "Error procesando el evento" });
  }
};


export async function crearPagoTarjeta(req,res){
  const {id_pedido,token_tarjeta, cuotas} = req.body;
  const id_usuario = req.usuario.id;
  const emailCliente = req.usuario.email;

  try{
    const resultado = await verificarClientePedido(id_pedido,id_usuario);
    const pedido = resultado.rows[0];

    if(!pedido){
      return res.status(403).json({
        ok:   false,
        mensaje:  "el pedido no pertenece al usuario o no existe"
      });
    }

    if(!token_tarjeta){
      return res.status(400).json({
        ok:   false,
        mensaje: "falta el token de la tarjeta"
      });
    }
    const montoEnCentavos = Math.round(Number(pedido.total) * 100);
    if (!Number.isFinite(montoEnCentavos) || montoEnCentavos <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "el pedido no tiene un monto válido"
      });
}
    const acceptanceToken = await obtenerAcceptanceToken();
    const referencia = generarReferenciasPago(id_pedido)
    const firmaIntegridad = calcularFirmaIntegridad({
      referencia,
      montoEnCentavos,
      moneda: MONEDA_DEFECTO,  
    });
    const metodoPago ={
      type: 'CARD',
      installments: cuotas || 1,
      token: token_tarjeta,
    };

    const transaccion = await crearTransaccion({
      montoEnCentavos,
      moneda: MONEDA_DEFECTO,
      referencia,
      emailCliente,
      acceptanceToken,
      firmaIntegridad,
      metodoPago,
    });
    await guardarPaymentIntent(
      id_pedido,
      transaccion.id,
      mapearEstadoWompi(transaccion.status),
      'tarjeta'
    );

    res.status(201).json({
      ok: true,
      data: { id_transaccion: transaccion.id, estado: transaccion.status }
    });

  }
  catch(error){

    console.error('Error creando pago con tarjeta:', error.response?.data || error.message);
      res.status(502).json({ 
        ok:  false,
        mensaje: 'No se pudo procesar el pago con Wompi' });
  }
}

const USER_TYPE_POR_PERSONA = { natural: 0, juridica: 1 };

export const listarBancos = async(req,res)=>{
  try{
    const bancos = await listarBancosPSE();
    res.status(200).json({
      ok: true,
      data: bancos
    });
  }
  catch(error){
    console.error('Error listando bancos PSE:', error.response?.data || error.message);
    res.status(502).json({
      ok:   false,
      mensaje: 'No se pudo obtener los bancos'
    });
  }
};

export const pagarConPSE = async(req,res)=>{
  const {id_pedido, financial_institution_code,tipo_documento, numero_documento} = req.body;

  if (!id_pedido || !financial_institution_code){
    return res.status(400).json({
      ok: false,
      mensaje: 'el id pedido o la institucion no estan',
    })
  }
  try{
    const resultado = await verificarClientePedidoConDocumento(id_pedido,req.usuario.id)
    const pedido = resultado.rows[0];
    if(!pedido){
      return res.status(403).json({
        ok: false,
        mensaje:  'No tienes permisos para pagar este pedido',
      });
    }
    const documentoTipo = pedido.tipo_documento || tipo_documento;
    const documentoNumero = pedido.numero_documento || numero_documento;

    if(!documentoTipo || !documentoNumero){
      return res.status(400).json({
        ok:   false,
        mensaje:  'necesitamos tu tipo y numero de documento para procesar el pago',
      });
    }
    const montoEnCentavos = Math.round(Number(pedido.total) * 100);
    if (!Number.isFinite(montoEnCentavos) || montoEnCentavos <= 0) {
      return res.status(400).json({ ok: false, mensaje: 'El pedido no tiene un monto válido' });
    }

    const referencia = generarReferenciasPago(id_pedido);
    const acceptanceToken = await obtenerAcceptanceToken();
    const firmaIntegridad = calcularFirmaIntegridad({ referencia, montoEnCentavos, moneda: MONEDA_DEFECTO });

    const metodoPago = {
      type: 'PSE',
      user_type: USER_TYPE_POR_PERSONA[pedido.tipo_persona] ?? 0,
      user_legal_id_type: documentoTipo,
      user_legal_id: documentoNumero,
      financial_institution_code,
      payment_description: `Pago Granova pedido #${id_pedido}`,
    };

    const transaccion = await crearTransaccion({
      montoEnCentavos,
      moneda: MONEDA_DEFECTO,
      emailCliente: req.usuario.email,
      referencia,
      acceptanceToken,
      firmaIntegridad,
      metodoPago,
    });
    await guardarPaymentIntent(id_pedido, transaccion.id, mapearEstadoWompi(transaccion.status), 'pse');
    return res.status(200).json({
      ok: true,
      id_transaccion: transaccion.id,
      estado: transaccion.status,
    });

  }
  catch(error){
    console.error('Error pagando con PSE:', error.response?.data || error.message);
    const mensajeWompi = error?.response?.data?.error?.messages
      ? Object.values(error.response.data.error.messages).flat().join(', ')
      : null;
    return res.status(error?.response?.status || 502).json({
      ok: false,
      mensaje: mensajeWompi || 'No se pudo procesar el pago por PSE',
    });

  }
}