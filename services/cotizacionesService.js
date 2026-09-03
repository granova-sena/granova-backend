import {pool} from '../config/db.js'
import {
  insertarCotizacion, listarCotizacionesPorCliente, contarCotizacionesPorCliente,
  buscarCotizacionPorId, marcarCotizacionComprada, eliminarCotizacion,
} from '../models/cotizacionesModel.js';
import { insertarProductoCotizacion, buscarProductosPorCotizacion } from '../models/cotizacionesProductosModel.js';
import { crearPedidoCompleto, calcularTotalActual} from './pedidosService.js';

class ErrorCotizacion extends Error {
    constructor(mensaje, codigo){
        super(mensaje);
        this.codigo = codigo;
    }
}

function generarNumeroCotizacion(){
    const año = new Date().getFullYear();
    const aleatorio = Math.floor(100000 + Math.random() *900000);
    return `COT-${año}-${aleatorio}`;
}

export async function crearCotizacionCompleta({id_cliente, productos, subtotal, descuento, total, descuento_pct, descuento_fuente, diasValidez = 15}) {
 
    const client = await pool.connect();

    try{
        await client.query('BEGIN');

        const fechaValidez = new Date();
        fechaValidez.setDate(fechaValidez.getDate() + diasValidez);

        const {rows} = await insertarCotizacion(client,{
            id_cliente,
            numero_cotizacion : generarNumeroCotizacion(),
            subtotal,descuento, total, descuento_pct, descuento_fuente,
            fecha_validez: fechaValidez.toISOString().slice(0,10),
        });

        const cotizacion = rows[0];

        for (const p of productos){
            await insertarProductoCotizacion(client,{
                id_cotizacion: cotizacion.id_cotizacion,
                id_producto: p.id_producto,
                id_formato: p.id_formato ?? null,
                nombre: p.nombre,
                presentacion: p.presentacion ?? null,
                etiqueta_formato: p.etiqueta_formato ?? null,
                precio_unitario : p.precio_unitario,
                cantidad: p.cantidad,
                peso_kg: p.peso_kg ?? null,
                promo_pct: p.promo_pct ?? null,
                iva_pct: p.iva_pct ?? null,

            });
        }

        await client.query('COMMIT');
        return cotizacion;

    }
    catch(error){
        await client.query('ROLLBACK')
        throw error;
    }

    finally{
        client.release();
    }
    
}

export async function obtenerCotizacionesDeCliente(id_cliente, page, limit){
    const offset = (page - 1) * limit;
    const [resultado, total] = await Promise.all([
        listarCotizacionesPorCliente(id_cliente, limit, offset),
        contarCotizacionesPorCliente(id_cliente),
    ]);

    const totalRows = Number(total.rows[0].count);
    return{
        cotizaciones: resultado.rows,
        paginacion: {page, limit, totalRows, totalPages: Math.ceil(totalRows / limit),

        },
    };
}
export async function obtenerCotizacionConProductos(id_cotizacion, id_cliente){
    const {rows} = await buscarCotizacionPorId(id_cotizacion);
    const cotizacion = rows[0];

    if(!cotizacion){
        throw new ErrorCotizacion('cotizacion no encontrada', 'NO_ENCONTRADA');
    }
    if(cotizacion.id_cliente != id_cliente){
        throw new ErrorCotizacion('No tienes permiso para ver esta cotizacion', 'NO_AUTORIZADA');

    }
    const resultado = await buscarProductosPorCotizacion(id_cotizacion);
    const productos = resultado.rows;   
     
    return{ ...cotizacion, productos};
}
export async function comprarCotizacion(id_cotizacion, id_cliente, datosCompra){
    const cotizacion = await obtenerCotizacionConProductos(id_cotizacion, id_cliente);

    if(cotizacion.estado === 'comprada'){
        throw new ErrorCotizacion('Esta cotizacion ya fue comprada', 'YA_COMPRADA');

    }
    if(cotizacion.estado === 'eliminadad'){
        throw new ErrorCotizacion('Esta cotizacion ya no esta disponible', 'NO_ENCONTRADA');
    }

    if(new Date(cotizacion.fecha_validez)< new Date() ){
        throw new ErrorCotizacion('Esta cotizacion ya expiro','EXPIRADA');
    }

    const productosParaPedido = cotizacion.productos.map((p)=>({
        id_producto: p.id_producto,
        id_formato: p.id_formato,
        cantidad: p.cantidad,
    })
    );
    const  {total: totalActual} =  await calcularTotalActual({
        id_cliente,
        productos:  productosParaPedido,
        codigo_cupon: datosCompra.codigo_cupon,
    });
    const totalCotizado = Number(cotizacion.total);
    const precioCambio = totalActual !== totalCotizado;

    if(precioCambio && !datosCompra.confirmarCambioPrecio){
        const error = new ErrorCotizacion('El precio cambió desde que se genero esta cotizacion', 'PRECIO_CAMBIO');
        error.totalCotizado = totalCotizado;
        error.totalActual = totalActual;
        throw error;
    }

    const resultadoPedido = await crearPedidoCompleto({
        id_cliente,
        metodo_pago: datosCompra.metodo_pago,
        direccion_envio: datosCompra.direccion_envio,
        ciudad_envio: datosCompra.ciudad_envio,
        productos: productosParaPedido,
        codigo_cupon: datosCompra.codigo_cupon,
    });

    const client = await pool.connect();
    try{
        await marcarCotizacionComprada(client, id_cotizacion, resultadoPedido.id_pedido);
    }
    finally{
        client.release();
    }
    return resultadoPedido;

}
export async function eliminarCotizacionDeCliente(id_cotizacion, id_cliente){
    const {rows} = await eliminarCotizacion(id_cotizacion, id_cliente);
    if(rows === undefined)
        return;
    
}