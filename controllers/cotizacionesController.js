import {
  crearCotizacionCompleta,
  obtenerCotizacionesDeCliente,
  obtenerCotizacionConProductos,
  comprarCotizacion,
  eliminarCotizacionDeCliente,
} from '../services/cotizacionesService.js';
import pool from '../config/db.js';

const STATUS_POR_CODIGO = {
  NO_ENCONTRADA: 404,
  NO_AUTORIZADA: 403,
  YA_COMPRADA: 400,
  EXPIRADA: 400,
  PRECIO_CAMBIO: 409,
};

const ESTADOS_DISPONIBLES = ["emitida", "aceptada", "vencida", "anulada", "comprada", "eliminada", "activa"];

const obtenerIdCliente = (req) => req.usuario?.id ?? req.usuario?.id_cliente;

// ─────────────────────────────────────────
// Cliente (flujo GRN-58 de Breyner)
// ─────────────────────────────────────────

// POST /api/cotizaciones → guarda una cotización con sus productos relacionales
export async function crearCotizacion(req, res){
    const {productos, subtotal, descuento, total, descuento_pct, descuento_fuente} = req.body;
    const id_cliente = obtenerIdCliente(req);

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

// GET /api/cotizaciones → "Mis cotizaciones" (paginado)
export async function listarMisCotizaciones(req, res) {
  const id_cliente = obtenerIdCliente(req);
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

// GET /api/cotizaciones/:id → detalle con productos (solo dueño)
export async function obtenerCotizacion(req,res){
  const {id} = req.params;
  const id_cliente = obtenerIdCliente(req);

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

// POST /api/cotizaciones/:id/comprar → crea el pedido (con comparación de precio)
export async function comprarCotizacionController(req, res) {
  const {id} = req.params;
  const id_cliente = obtenerIdCliente(req);
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

// DELETE /api/cotizaciones/:id → marca como eliminada (solo dueño)
export async function eliminarCotizacion(req, res) {
  const {id} = req.params;
  const id_cliente = obtenerIdCliente(req);
  
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

// ─────────────────────────────────────────
// Panel admin (contrato actual del frontend: {ok, cotizaciones} con items)
// ─────────────────────────────────────────

// GET /api/admin/cotizaciones → todas, con datos del cliente y sus productos
const listarCotizaciones = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.id_cotizacion, c.numero_cotizacion, c.subtotal, c.descuento,
              c.total, c.descuento_pct, c.descuento_fuente, c.estado,
              c.fecha_creacion AS creada_en, c.fecha_validez, c.id_pedido,
              c.id_cliente, cl.nombre, cl.apellido, cl.email, cl.razon_social,
              CASE WHEN COUNT(cp.id_cotizacion_producto) = 0 THEN '[]'::jsonb
                   ELSE jsonb_agg(jsonb_build_object(
                     'id_producto', cp.id_producto,
                     'id_formato', cp.id_formato,
                     'nombre', cp.nombre,
                     'presentacion', cp.presentacion,
                     'etiqueta_formato', cp.etiqueta_formato,
                     'precio_unitario', cp.precio_unitario,
                     'precio', cp.precio_unitario,
                     'cantidad', cp.cantidad,
                     'peso_kg', cp.peso_kg,
                     'promo_pct', cp.promo_pct,
                     'iva_pct', cp.iva_pct,
                     'subtotal', (cp.precio_unitario * cp.cantidad)
                   ) ORDER BY cp.id_cotizacion_producto)
              END AS items
       FROM cotizaciones c
       LEFT JOIN clientes cl ON cl.id_cliente = c.id_cliente
       LEFT JOIN cotizaciones_productos cp ON cp.id_cotizacion = c.id_cotizacion
       GROUP BY c.id_cotizacion, c.id_cliente, cl.nombre, cl.apellido, cl.email, cl.razon_social
       ORDER BY c.fecha_creacion DESC
       LIMIT 300`
    );
    res.json({ ok: true, cotizaciones: resultado.rows });
  } catch (error) {
    console.error("Error listando cotizaciones admin:", error);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las cotizaciones." });
  }
};

// PATCH /api/admin/cotizaciones/:id/estado → cambiar estado
const cambiarEstadoCotizacion = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!ESTADOS_DISPONIBLES.includes(String(estado || "").toLowerCase())) {
    return res
      .status(400)
      .json({ ok: false, error: `Estado inválido. Opciones: ${ESTADOS_DISPONIBLES.join(", ")}.` });
  }

  try {
    const resultado = await pool.query(
      `UPDATE cotizaciones SET estado = $1 WHERE id_cotizacion = $2
       RETURNING id_cotizacion, estado`,
      [String(estado).toLowerCase(), Number(id)]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Cotización no encontrada." });
    }
    res.json({ ok: true, cotizacion: resultado.rows[0] });
  } catch (error) {
    console.error("Error actualizando cotización:", error);
    res.status(500).json({ ok: false, error: "No se pudo actualizar la cotización." });
  }
};

export { listarCotizaciones, cambiarEstadoCotizacion };