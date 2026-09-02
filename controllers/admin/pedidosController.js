import pool from "../../config/db.js"
import { devolverStockPedido } from "../../utils/stockPedido.js"
import { finalizarBeneficiosLealtad } from "../../utils/finalizarLealtad.js"

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatearPedido(id) {
  return `#P-${String(id).padStart(5, '0')}`;
}

// Normaliza estados históricos: los pedidos creados desde Registro de ventas
// pueden venir como 'Pendiente' o 'Pagado'. 'Cancelado' (nombre viejo) y
// 'Rechazado' (nombre nuevo) se tratan igual, para no perder pedidos
// rechazados antes de este cambio.  insensible a mayúsculas/espacios.
//
// IMPORTANTE: la base de datos (constraint pedidos_estado_check) solo acepta
// estos valores crudos: pendiente, confirmado, en_proceso, enviado,
// entregado, cancelado. 'en_proceso' se muestra al usuario como "Empacando"
// y 'enviado' se muestra como "En camino" — son solo nombres de presentación,
// no existen como tal en la BD.
function bucketEstado(estadoCrudo) {
  const estado = normalizar(estadoCrudo);
  if (estado === 'cancelado' || estado === 'rechazado') return 'Rechazado';
  if (estado === 'pendiente') return 'Pendiente';
  if (estado === 'confirmado' || estado === 'pagado') return 'Confirmado';
  if (estado === 'en_proceso') return 'Empacando';
  if (estado === 'enviado') return 'En camino';
  if (estado === 'entregado') return 'Entregado';
  return 'Confirmado';
}

// Secuencia de estados que el EMPLEADO avanza desde el panel.
// Usa los valores crudos que sí acepta pedidos_estado_check en la BD.
const SECUENCIA_ESTADOS = ['confirmado', 'en_proceso', 'enviado', 'entregado'];

const TITULOS_NOTIFICACION = {
  en_proceso: { titulo: 'Tu pedido está siendo empacado 📦', mensaje: 'Tu café ya pasó a preparación y pronto saldrá hacia ti.' },
  enviado: { titulo: 'Tu pedido va en camino 🚚', mensaje: 'El transportador ya tiene tu pedido. ¡Prepárate para recibirlo!' },
  entregado: { titulo: '¡Tu pedido llegó! 🎉', mensaje: 'Tu café ya está en tus manos. Cuéntanos qué tal te fue dejando una reseña.' },
};

const getResumen = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT estado, estado_pago, total FROM pedidos
    `);

    // Pedidos cuya forma de pago aún no se confirma (manuales), independiente
    // del estado logístico. Se usa en la tarjeta "Pendientes de pago".
    const pendientesPago = result.rows.filter(p =>
      p.estado_pago === 'pendiente' || p.estado_pago === 'pendiente_verificacion'
    ).length;

    let pendientes = 0, confirmados = 0, rechazados = 0, totalEnPedidos = 0;
    result.rows.forEach(p => {
      const bucket = bucketEstado(p.estado);
      if (bucket === 'Pendiente') pendientes++;
      if (bucket === 'Confirmado') confirmados++;
      if (bucket === 'Rechazado') rechazados++;
      if (bucket !== 'Rechazado') totalEnPedidos += Number(p.total);
    });

    const totalMesAnterior = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total FROM pedidos
      WHERE lower(estado) NOT IN ('cancelado', 'rechazado')
        AND date_trunc('month', fecha_pedido) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
    `);
    const anterior = Number(totalMesAnterior.rows[0].total);
    let cambio;
if (anterior === 0) {
    cambio = totalEnPedidos > 0 ? 100 : 0;
} else {
    cambio = Math.round(((totalEnPedidos - anterior) / anterior) * 100);
}

    res.json({
      ok: true,
      pendientes,
      confirmados,
      rechazados,
      cancelados: rechazados, // alias por compatibilidad con el frontend viejo
      pendientesPago,
      total: result.rows.length,
      totalEnPedidos,
      cambioTotal: cambio
    });
  } catch (error) {
    console.error('Error en getResumen (pedidos):', error);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el resumen de pedidos.' });
  }
};

const getPedidos = async (req, res) => {
  try {
    const { tab = 'Todos', search = '', page = 1, limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT
        p.id_pedido, p.fecha_pedido, p.estado, p.estado_pago, p.metodo_pago, p.total,
        p.operacion, p.sector_envio,
        c.nombre, c.apellido, c.email,
        dp1.producto_nombre, dp1.finca_nombre, dp1.codigo_lote,
        dp_sum.cantidad_total
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN LATERAL (
        SELECT pr.nombre AS producto_nombre, l.finca AS finca_nombre, l.codigo_lote
        FROM detalle_pedidos dp
        JOIN productos pr ON pr.id_producto = dp.id_producto
        LEFT JOIN lotes l ON l.id_lote = pr.id_lote
        WHERE dp.id_pedido = p.id_pedido
        ORDER BY dp.id_detalle
        LIMIT 1
      ) dp1 ON true
      LEFT JOIN LATERAL (
        SELECT SUM(dp.cantidad) AS cantidad_total
        FROM detalle_pedidos dp
        WHERE dp.id_pedido = p.id_pedido
      ) dp_sum ON true
      ORDER BY p.fecha_pedido DESC
    `);

    let pedidos = result.rows.map(p => ({
      id: p.id_pedido,
      pedido: formatearPedido(p.id_pedido),
      cliente: `${p.nombre} ${p.apellido}`,
      email: p.email,
      producto: p.producto_nombre || 'Sin producto',
      finca: p.finca_nombre || null,
      lote: p.codigo_lote || null,
      cantidad: Number(p.cantidad_total) || 0,
      total: Number(p.total),
      operacion: p.operacion,
      sector_envio: p.sector_envio || null,
      metodo_pago: p.metodo_pago,
      estado_pago: p.estado_pago,
      estado: bucketEstado(p.estado),
      fecha: p.fecha_pedido,
    }));

    if (tab !== 'Todos') {
      const tabAEstado = { Pendientes: 'Pendiente', Confirmados: 'Confirmado', Rechazados: 'Rechazado' };
      pedidos = pedidos.filter(p => p.estado === tabAEstado[tab]);
    }

    if (search) {
      const q = normalizar(search);
      pedidos = pedidos.filter(p =>
        normalizar(p.cliente).includes(q) ||
        normalizar(p.producto).includes(q) ||
        normalizar(p.pedido).includes(q)
      );
    }

    const totalFiltrados = pedidos.length;
    const start = (Number(page) - 1) * Number(limit);
    const pagina = pedidos.slice(start, start + Number(limit));

    res.json({
      ok: true,
      pedidos: pagina,
      totalFiltrados,
      page: Number(page),
      totalPaginas: Math.max(Math.ceil(totalFiltrados / Number(limit)), 1)
    });
  } catch (error) {
    console.error('Error en getPedidos:', error);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el listado de pedidos.' });
  }
};

// Trae  lo necesario para armar la factura: cliente, items y datos de la factura.
const getPedidoDetalle = async (req, res) => {
  try {
    const { id } = req.params;

    const pedidoResult = await pool.query(`
      SELECT p.id_pedido, p.fecha_pedido, p.estado, p.total, p.metodo_pago, p.motivo_rechazo,
             c.nombre, c.apellido, c.email,
             f.numero_factura, f.fecha_emision, f.subtotal, f.impuestos
      FROM pedidos p
      JOIN clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN facturas f ON f.id_pedido = p.id_pedido
      WHERE p.id_pedido = $1
    `, [id]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }

    const itemsResult = await pool.query(`
      SELECT pr.nombre, dp.cantidad, dp.precio_unitario, dp.subtotal
      FROM detalle_pedidos dp
      JOIN productos pr ON pr.id_producto = dp.id_producto
      WHERE dp.id_pedido = $1
      ORDER BY dp.id_detalle
    `, [id]);

    const p = pedidoResult.rows[0];

    res.json({
      ok: true,
      pedido: {
        id: p.id_pedido,
        pedido: formatearPedido(p.id_pedido),
        fecha: p.fecha_pedido,
        estado: bucketEstado(p.estado),
        metodo_pago: p.metodo_pago,
        motivo_rechazo: p.motivo_rechazo || null,
        cliente: `${p.nombre} ${p.apellido}`,
        email: p.email,
        numero_factura: p.numero_factura || formatearPedido(p.id_pedido),
        fecha_emision: p.fecha_emision || p.fecha_pedido,
        subtotal: Number(p.subtotal ?? p.total),
        impuestos: Number(p.impuestos ?? 0),
        total: Number(p.total),
        items: itemsResult.rows.map(it => ({
          nombre: it.nombre,
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
          subtotal: Number(it.subtotal),
        })),
      }
    });
  } catch (error) {
    console.error('Error en getPedidoDetalle:', error);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el detalle del pedido.' });
  }
};

const aceptarPedido = async (req, res) => {
  try {
    const { id } = req.params;
if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: 'Id de pedido inválido.' });
    }

    const actual = await pool.query(`SELECT estado FROM pedidos WHERE id_pedido = $1`, [id]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }
    if (bucketEstado(actual.rows[0].estado) !== 'Pendiente') {
      return res.status(400).json({ ok: false, error: 'Solo se pueden aceptar pedidos pendientes.' });
    }

    await pool.query(`UPDATE pedidos SET estado = 'confirmado' WHERE id_pedido = $1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error en aceptarPedido:', error);
    res.status(500).json({ ok: false, error: 'No se pudo aceptar el pedido.' });
  }
};

// Rechaza el pedido, guarda el motivo (máx. 500 caracteres) y devuelve el
// stock reservado a los productos.
const cancelarPedido = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const motivo = String(req.body?.motivo || '').trim();

if (!id || Number.isNaN(Number(id))) {
      client.release();
      return res.status(400).json({ ok: false, error: 'Id de pedido inválido.' });
    }
    if (motivo.length > 500) {
      client.release();
      return res.status(400).json({ ok: false, error: 'El motivo no puede tener más de 500 caracteres.' });
    }

    await client.query('BEGIN');

    const actual = await client.query(`SELECT estado FROM pedidos WHERE id_pedido = $1 FOR UPDATE`, [id]);
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }
    if (bucketEstado(actual.rows[0].estado) !== 'Pendiente') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Solo se pueden rechazar pedidos pendientes.' });
    }

    await devolverStockPedido(client, id);

    await client.query(
      `UPDATE pedidos SET estado = 'cancelado', motivo_rechazo = $1 WHERE id_pedido = $2`,
      [motivo || null, id]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en cancelarPedido (rechazo):', error);

    // Si la columna motivo_rechazo todavía no existe en la BD, avisamos claro.
    if (error.code === '42703') {
      return res.status(500).json({
        ok: false,
        error: 'Falta la columna motivo_rechazo en la tabla pedidos. Corre el ALTER TABLE que te indicaron.'
      });
    }
    res.status(500).json({ ok: false, error: 'No se pudo rechazar el pedido.' });
  } finally {
    client.release();
  }
};

// PATCH /admin/pedidos/:id/estado  { estado: 'empacando' | 'en_camino' | 'entregado' }
// El EMPLEADO avanza el pedido paso a paso (secuencia estricta) y al cliente
// le llega una notificación por cada cambio.
//
// El front puede seguir mandando 'empacando' / 'en_camino' (nombres de
// presentación) — aquí se traducen a los valores reales que acepta la BD
// ('en_proceso' / 'enviado') antes de guardarlos.
const ALIAS_ESTADO_ENTRADA = {
  empacando: 'en_proceso',
  en_camino: 'enviado',
};

const cambiarEstadoPedido = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const estadoNormalizado = normalizar(estado);
  const estadoSiguiente = ALIAS_ESTADO_ENTRADA[estadoNormalizado] || estadoNormalizado;

  if (!SECUENCIA_ESTADOS.includes(estadoSiguiente) || estadoSiguiente === 'confirmado') {
    return res.status(400).json({ ok: false, error: 'Estado inválido. Usa: empacando, en_camino o entregado.' });
  }

  const client = await pool.connect();
  try {
    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: 'Id de pedido inválido.' });
    }

    await client.query('BEGIN');

    const actual = await client.query(
      `SELECT estado, id_cliente, estado_pago, operacion FROM pedidos WHERE id_pedido = $1 FOR UPDATE`,
      [id]
    );
    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }

    // Los pedidos de REPARTO no se caminan a mano por el empleado: el avance
    // lo controla el módulo de Despacho (rol logistica) y aquí solo se lee.
    if (actual.rows[0].operacion === 'reparto') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Este pedido es de reparto: su avance lo coordina el módulo de Despacho.' });
    }

    // Un pedido con pago fallido no puede avanzar en la logística
    if (actual.rows[0].estado_pago === 'fallido') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'El pago del pedido falló: no se puede avanzar sin resolver el pago.' });
    }

    const actualCrudo = normalizar(actual.rows[0].estado);
    if (actualCrudo === 'cancelado' || actualCrudo === 'rechazado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Un pedido rechazado no puede avanzar de estado.' });
    }

    const idxActual = SECUENCIA_ESTADOS.indexOf(actualCrudo);
    const idxNuevo = SECUENCIA_ESTADOS.indexOf(estadoSiguiente);
    if (idxActual === -1 || idxNuevo !== idxActual + 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: `El pedido está en "${bucketEstado(actualCrudo)}": el siguiente estado es "${bucketEstado(SECUENCIA_ESTADOS[idxActual + 1] || 'entregado')}".`
      });
    }

    await client.query(`UPDATE pedidos SET estado = $1 WHERE id_pedido = $2`, [estadoSiguiente, id]);

    // Notificar al cliente dueño del pedido (la de "entregado" es además el
    // recordatorio de reseña: persiste hasta que reseñe).
    const notif = TITULOS_NOTIFICACION[estadoSiguiente];
    if (notif) {
      const tipoNotif = estadoSiguiente === 'entregado' ? 'reseña' : 'pedido';
      await client.query(
        `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
         VALUES ($1, $2, $3, $4, $5)`,
        [actual.rows[0].id_cliente, tipoNotif, notif.titulo, notif.mensaje, id]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, estado: bucketEstado(estadoSiguiente) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en cambiarEstadoPedido:', error);
    if (error.code === '42P01') {
      return res.status(500).json({
        ok: false,
        error: 'Falta la tabla notificaciones. Corre sql/12_notificaciones.sql en Supabase.'
      });
    }
    res.status(500).json({ ok: false, error: 'No se pudo actualizar el estado del pedido.' });
  } finally {
    client.release();
  }
};

// PATCH /admin/pedidos/:id/pago  { estado_pago: 'pagado' }
// El empleado confirma el cobro MANUAL (transferencia/efectivo) o el pago
// contra-entrega al entregar. Al pagar, un pedido aún 'pendiente' se confirma
// y el cliente recibe notificación + puntos de lealtad.
// El empleado NUNCA decide si hubo pago en pasarela: eso lo confirma el
// backend (doc 01: el cobro virtual es automático).
const marcarPago = async (req, res) => {
  const { id } = req.params;
  const estadoPagoDestino = String(req.body?.estado_pago || '').trim();

  if (!id || Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, error: 'Id de pedido inválido.' });
  }
  if (estadoPagoDestino !== 'pagado') {
    return res.status(400).json({ ok: false, error: 'Solo se puede marcar el pago como "pagado".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const actual = await client.query(
      `SELECT p.id_pedido, p.estado, p.estado_pago, p.metodo_pago, p.total, p.id_cliente, c.tipo_persona
       FROM pedidos p
       JOIN clientes c ON c.id_cliente = p.id_cliente
       WHERE p.id_pedido = $1
       FOR UPDATE OF p`,
      [id]
    );

    if (actual.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado.' });
    }

    const pedido = actual.rows[0];

    if (pedido.estado_pago === 'pagado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Este pedido ya está pagado.' });
    }
    // La pasarela se procesa por el cliente en /api/pagos, no por el panel.
    if (['tarjeta', 'pse', 'nequi', 'daviplata'].includes(pedido.metodo_pago) && pedido.estado_pago === 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'Este pedido usa pasarela: el pago se confirma al cliente.' });
    }

    const nuevoEstado = pedido.estado === 'pendiente' ? 'confirmado' : pedido.estado;
    await client.query(
      `UPDATE pedidos SET estado_pago = 'pagado', estado = $1 WHERE id_pedido = $2`,
      [nuevoEstado, id]
    );

    // Trazabilidad del cobro manual
    await client.query(
      `INSERT INTO pagos (id_pedido, metodo_pago, monto, referencia, estado, fecha_pago, confirmado_por)
       VALUES ($1, $2, $3, $4, 'aprobado', NOW(), $5)`,
      [id, pedido.metodo_pago, pedido.total, `MANUAL-${Date.now().toString(36).toUpperCase()}`, req.usuario?.id || null]
    );

    await client.query(
      `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
       VALUES ($1, $2, $3, $4, $5)`,
      [pedido.id_cliente, 'pago', 'Pago aprobado ✅', `Recibimos tu pago por $${Number(pedido.total).toLocaleString("es-CO")}. Tu pedido ya está confirmado.`, id]
    );

    // Puntos de lealtad al confirmar el pago
    const esJuridica = pedido.tipo_persona === 'juridica';
    const puntos = esJuridica ? 0 : Math.floor(Number(pedido.total) / 1000);
    if (puntos > 0) {
      await client.query(`UPDATE clientes SET puntos = puntos + $1 WHERE id_cliente = $2`, [puntos, pedido.id_cliente]);
    }

    // Premio de lealtad (unidades) y consumo del cupón al cobrar.
    const beneficios = await finalizarBeneficiosLealtad(client, {
      id_pedido: id,
      id_cliente: pedido.id_cliente,
      esJuridica,
    });

    await client.query('COMMIT');
    res.json({
      ok: true,
      estado: bucketEstado(nuevoEstado),
      estado_pago: 'pagado',
      puntos_ganados: puntos,
      unidades_acumuladas: beneficios.unidades_acumuladas,
      premio_aplicado: beneficios.premio_aplicado,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en marcarPago:', error);
    res.status(500).json({ ok: false, error: 'No se pudo marcar el pago.' });
  } finally {
    client.release();
  }
};

export { getResumen, getPedidos, getPedidoDetalle, aceptarPedido, cancelarPedido, cambiarEstadoPedido, marcarPago };