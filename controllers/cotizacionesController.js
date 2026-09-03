import {
  crearCotizacionCompleta,
  obtenerCotizacionesDeCliente,
  obtenerCotizacionConProductos,
  comprarCotizacion,
  eliminarCotizacionDeCliente,
} from '../services/cotizacionesService.js';

const STATUS_POR_CODIGO = {
  NO_ENCONTRADA: 404,
  NO_AUTORIZADA: 403,
  YA_COMPRADA: 400,
  EXPIRADA: 400,
  PRECIO_CAMBIO: 409,
};

export async function crearCotizacion(req, res){
    const {productos, subtotal, descuento, total, descuento_pct, descuento_fuente} = req.body;
    const id_cliente = req.usuario.id;

    if(!productos?.length || total == null){
        return res.status(400).json({
            ok: false,
            mensaje: 'Faltan datos de la cotizacion'
        });
    }
    for (const p of productos){
        if(!p.id_producto || !p.nombre || p.precio_unitario == null || !Number.isInteger(p.cantidad)){
          return res.status(400).json({
            ok: false,
            mensaje: 'uno de los productos de la cotizacion tiene datos invalidos'
          })
        }
    }

    try{
      const cotizacion = await crearCotizacionCompleta({
        id_cliente, productos, subtotal, descuento, total, descuento_pct, descuento_fuente,
      });
      res.status(201).json({
        ok: true,
        data: cotizacion,
        mensaje:  'cotizacion guardada'
      })
    }
    catch(error){
      console.error('Error creando cotizacion:', error.stack);
      res.status(500).json({
        ok: false,
        mensaje:'Error interno al guardar la cotizacion'
      })
    }
}
export async function listarCotizaciones(req, res) {
  const id_cliente = req.usuario.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  try{
    const {cotizaciones, paginacion} = await obtenerCotizacionesDeCliente(id_cliente,page,limit);
    res.status(200).json({
      ok: true,
      data: cotizaciones, paginacion
    });
  }
  catch(error){
    console.error('Error listando cotizaciones', error.message);
    res.status(500).json({
      ok: false,
      mensaje: 'Error al obtner cotizaciones'
    });

  }
}

export async function obtenerCotizacion(req,res){
  const {id} = req.params;
  const id_cliente = req.usuario.id;

  try{
    const cotizacion = await obtenerCotizacionConProductos(Number(id), id_cliente);
    res.status(200).json({
      ok: true,
      data: cotizacion
    });
  }
  catch(error){
    const status = STATUS_POR_CODIGO[error.codigo] ?? 500;
    console.error('Error obteniendo cotizacion', error.message);
    res.status(status).json({
      ok:false,
      mensaje: status == 500 ? 'Error interno' : error.message
    })
  }

}

export async function comprarCotizacionController(req, res) {
  const {id} = req.params;
  const id_cliente = req.usuario.id;
  const {metodo_pago, direccion_envio, ciudad_envio, codigo_cupon, confirmarCambioPrecio} = req.body;
  if(!metodo_pago || !direccion_envio || !ciudad_envio){
    return res.status(400).json({
      ok:false,
      mensaje: 'Faltan datos de envio o metodo de pago'
    });
  }

  try{
    const resultado = await comprarCotizacion(Number(id), id_cliente, {
      metodo_pago, direccion_envio, ciudad_envio, codigo_cupon, confirmarCambioPrecio,
    });
    res.status(201).json({
      ok: true,
      data: resultado,
      mensaje: 'pedido creado a partir de la cotizacion'
    });

  }
  catch(error){
    const status = STATUS_POR_CODIGO[error.codigo] ?? 500;
    const respuesta = {ok: false, mensaje: status === 500? 'Error interno al comprar la cotizacion': error.message};

    if(error.codigo === 'PRECIO_CAMBIO'){
      respuesta.totalCotizado = error.totalCotizado;
      respuesta.totalActual = error.totalActual;
    }
    
    console.error('Error comprando cotizacion', error.message);
    res.status(status).json(respuesta)

  }
}

export async function eliminarCotizacion(req, res) {
  const {id} = req.params;
  const id_cliente = req.usuario.id;
  
  try{
    await eliminarCotizacionDeCliente(Number(id), id_cliente);
    res.status(200).json({
      ok: true,
      mensaje: 'cotizacion eliminada'
    });
  }
  catch(error){
    console.error('error eliminando cotizacion', error.message)
    res.status(500).json({
      ok:false,
      mensaje: 'no se pudo eliminar la cotizacion'
    });
  }
  
}