import pool from "../config/db.js"

// ─────────────────────────────────────────────────────────────
// Módulo de Despacho (rol logistica): agrupa pedidos de REPARTO
// en "salidas" con un vehículo (transportadora) por sector.
// Estados del despacho: Preparando → En ruta → Entregado, con
// la incidencia "Novedad" como estado paralelo.
// ─────────────────────────────────────────────────────────────

// Sectores de entrega que se ofrecen al cliente en el checkout.
// Cambiá esta lista si los sectores varían (por ahora es fija).
const SECTORES = ["Norte", "Sur", "Oriente", "Occidente", "Centro"];

const ESTADOS_VALIDOS = ["Preparando", "En ruta", "Entregado", "Novedad"];
const SIGUIENTE_ESTADO = {
  Preparando: ["En ruta", "Novedad"],
  "En ruta": ["Entregado", "Novedad"],
  Novedad: ["En ruta", "Entregado"],
  Entregado: [],
};

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatearPedido(id) {
  return `#P-${String(id).padStart(5, "0")}`;
}

function bucketEstado(estadoCrudo) {
  const estado = normalizar(estadoCrudo);
  if (estado === "cancelado" || estado === "rechazado") return "Rechazado";
  if (estado === "confirmado" || estado === "pagado") return "Confirmado";
  if (estado === "en_proceso") return "Empacando";
  if (estado === "enviado") return "En camino";
  if (estado === "entregado") return "Entregado";
  return "Confirmado";
}

const TITULOS_NOTIFICACION = {
  en_proceso: { titulo: "Tu pedido está siendo empacado 📦", mensaje: "Ya empezamos a preparar tu pedido. ¡Estará listo muy pronto!" },
  enviado: { titulo: "Tu pedido va en camino 🚚", mensaje: "El transportador ya tiene tu pedido. ¡Prepárate para recibirlo!" },
  entregado: { titulo: "¡Tu pedido llegó! 🎉", mensaje: "Tu café ya está en tus manos. Cuéntanos qué tal te fue dejando una reseña." },
};

// Al asignar un pedido a una salida (Preparando), pasa a "Empacando" (en_proceso)
// y se le notifica al cliente. Es idempotente: no pisa cancelado/rechazado ni un
// en_proceso ya existente.
async function asignarPedidoASalida(client, idPedido) {
  const pedido = await client.query(
    `SELECT id_cliente, estado FROM pedidos WHERE id_pedido = $1`,
    [idPedido]
  );
  if (pedido.rows.length === 0) return;
  const estadoCrudo = normalizar(pedido.rows[0].estado);
  if (["cancelado", "rechazado", "en_proceso"].includes(estadoCrudo)) return;
  await client.query(`UPDATE pedidos SET estado = 'en_proceso' WHERE id_pedido = $1`, [idPedido]);
  const notif = TITULOS_NOTIFICACION.en_proceso;
  await client.query(
    `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
     VALUES ($1, 'pedido', $2, $3, $4)`,
    [pedido.rows[0].id_cliente, notif.titulo, notif.mensaje, idPedido]
  );
}

// Al quitar un pedido de una salida en Preparando, vuelve a "Confirmado".
async function devolverPedidoASinSalida(client, idPedido) {
  const pedido = await client.query(
    `SELECT estado FROM pedidos WHERE id_pedido = $1`,
    [idPedido]
  );
  if (pedido.rows.length === 0) return;
  if (normalizar(pedido.rows[0].estado) !== "en_proceso") return;
  await client.query(`UPDATE pedidos SET estado = 'confirmado' WHERE id_pedido = $1`, [idPedido]);
}

const consultaDespachoBase = `
  SELECT
    d.id_despacho, d.numero_guia, d.id_transportadora, d.sector_destino,
    d.fecha_programada, d.estado, d.total_unidades,
    d.fecha_creacion, d.fecha_salida, d.fecha_entrega,
    t.nombre AS transportadora, t.tipo_vehiculo, t.imagen_url,
    u1.nombre AS creado_nombre, u1.apellido AS creado_apellido,
    u2.nombre AS confirmado_nombre, u2.apellido AS confirmado_apellido,
    COUNT(dp.id_pedido)::int AS num_pedidos
  FROM despachos d
  LEFT JOIN transportadoras t ON t.id_transportadora = d.id_transportadora
  LEFT JOIN despacho_pedidos dp ON dp.id_despacho = d.id_despacho
  LEFT JOIN usuarios u1 ON u1.id_usuario = d.creado_por
  LEFT JOIN usuarios u2 ON u2.id_usuario = d.confirmado_por
`;

function mapearDespacho(row) {
  return {
    id: row.id_despacho,
    guia: row.numero_guia,
    id_transportadora: row.id_transportadora,
    transportadora: row.transportadora || null,
    tipo_vehiculo: row.tipo_vehiculo || null,
    imagen_url: row.imagen_url || null,
    sector_destino: row.sector_destino || null,
    fecha_programada: row.fecha_programada,
    estado: row.estado,
    total_unidades: Number(row.total_unidades) || 0,
    num_pedidos: Number(row.num_pedidos) || 0,
    creado_por_nombre: row.creado_nombre ? `${row.creado_nombre} ${row.creado_apellido || ""}`.trim() : null,
    confirmado_por_nombre: row.confirmado_nombre ? `${row.confirmado_nombre} ${row.confirmado_apellido || ""}`.trim() : null,
    fecha_creacion: row.fecha_creacion,
    fecha_salida: row.fecha_salida,
    fecha_entrega: row.fecha_entrega,
  };
}

async function siguienteGuia(client) {
  const r = await client.query("SELECT COALESCE(MAX(id_despacho), 0) AS max_id FROM despachos");
  return `ORV-${String(Number(r.rows[0].max_id) + 1).padStart(4, "0")}`;
}

// Devuelve el detalle completo (despacho + pedidos) YA COMMITEADO, para
// responder de forma consistente tras cada operación.
async function obtenerDespachoDetalle(id) {
  const despachoQ = await pool.query(`${consultaDespachoBase}
    WHERE d.id_despacho = $1
    GROUP BY d.id_despacho, t.nombre, t.tipo_vehiculo, t.imagen_url, u1.nombre, u1.apellido, u2.nombre, u2.apellido`,
    [id]
  );
  if (despachoQ.rows.length === 0) return null;

  const d = mapearDespacho(despachoQ.rows[0]);

  const pedidosQ = await pool.query(
    `SELECT
       p.id_pedido, p.estado, p.estado_pago, p.metodo_pago, p.total, p.sector_envio, p.fecha_pedido,
       c.nombre, c.apellido, c.email,
       dp1.producto_nombre, dp_sum.cantidad_total
     FROM despacho_pedidos ddp
     JOIN pedidos p ON p.id_pedido = ddp.id_pedido
     JOIN clientes c ON c.id_cliente = p.id_cliente
     LEFT JOIN LATERAL (
       SELECT pr.nombre AS producto_nombre
       FROM detalle_pedidos de2
       JOIN productos pr ON pr.id_producto = de2.id_producto
       WHERE de2.id_pedido = p.id_pedido
       ORDER BY de2.id_detalle
       LIMIT 1
     ) dp1 ON true
     LEFT JOIN LATERAL (
       SELECT SUM(de2.cantidad) AS cantidad_total
       FROM detalle_pedidos de2
       WHERE de2.id_pedido = p.id_pedido
     ) dp_sum ON true
     WHERE ddp.id_despacho = $1
     ORDER BY p.fecha_pedido DESC`,
    [id]
  );

  d.pedidos = pedidosQ.rows.map((p) => ({
    id: p.id_pedido,
    pedido: formatearPedido(p.id_pedido),
    cliente: `${p.nombre} ${p.apellido}`,
    email: p.email,
    producto: p.producto_nombre || "Sin producto",
    cantidad: Number(p.cantidad_total) || 0,
    total: Number(p.total),
    estado: bucketEstado(p.estado),
    estado_pago: p.estado_pago,
    metodo_pago: p.metodo_pago,
    sector_envio: p.sector_envio || null,
    fecha: p.fecha_pedido,
  }));

  return d;
}

// Valida que un pedido pueda entrar a un despacho activo:
// no entregado/cancelado y no ya asignado a otra salida vigente.
async function validarPedidoParaDespacho(solicitud, idPedido) {
  const p = await solicitud.query(
    `SELECT p.estado FROM pedidos p WHERE p.id_pedido = $1`,
    [idPedido]
  );
  if (p.rows.length === 0) return "El pedido no existe";

  const estado = normalizar(p.rows[0].estado);
  if (["entregado", "cancelado", "rechazado"].includes(estado)) {
    return "El pedido ya está entregado, cancelado o rechazado";
  }

  const enOtro = await solicitud.query(
    `SELECT 1
     FROM despacho_pedidos ddp
     JOIN despachos d ON d.id_despacho = ddp.id_despacho
     WHERE ddp.id_pedido = $1 AND d.estado <> 'Entregado'
     LIMIT 1`,
    [idPedido]
  );
  if (enOtro.rows.length > 0) return "El pedido ya está asignado a una salida activa";

  return null;
}

async function recalcularTotalUnidades(solicitud, idDespacho) {
  await solicitud.query(
    `UPDATE despachos d
     SET total_unidades = COALESCE((
       SELECT SUM(de.cantidad)::int
       FROM despacho_pedidos ddp
       JOIN pedidos p ON p.id_pedido = ddp.id_pedido
       JOIN detalle_pedidos de ON de.id_pedido = p.id_pedido
       WHERE ddp.id_despacho = $1
     ), 0)
     WHERE d.id_despacho = $1`,
    [idDespacho]
  );
}

// GET /api/despachos?estado=...
export async function listarDespachos(req, res) {
  try {
    const estado = req.query.estado ? String(req.query.estado) : null;
    const result = await pool.query(
      `${consultaDespachoBase}
       WHERE ($1::text IS NULL OR d.estado = $1)
       GROUP BY d.id_despacho, t.nombre, t.tipo_vehiculo, t.imagen_url, u1.nombre, u1.apellido, u2.nombre, u2.apellido
       ORDER BY d.fecha_creacion DESC`,
      [estado]
    );
    res.json({ ok: true, despachos: result.rows.map(mapearDespacho) });
  } catch (error) {
    console.error("Error en listarDespachos:", error);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los despachos." });
  }
}

// GET /api/despachos/sectores (la usa el checkout del cliente)
export async function listarSectores(req, res) {
  res.json({ ok: true, sectores: SECTORES });
}

// GET /api/despachos/:id
export async function obtenerDespacho(req, res) {
  try {
    if (Number.isNaN(Number(req.params.id))) {
      return res.status(400).json({ ok: false, error: "Id de despacho inválido." });
    }
    const despacho = await obtenerDespachoDetalle(Number(req.params.id));
    if (!despacho) {
      return res.status(404).json({ ok: false, error: "Despacho no encontrado." });
    }
    res.json({ ok: true, despacho });
  } catch (error) {
    console.error("Error en obtenerDespacho:", error);
    res.status(500).json({ ok: false, error: "No se pudo cargar el despacho." });
  }
}

// POST /api/despachos  { id_transportadora?, sector_destino?, fecha_programada?, pedidos? }
export async function crearDespacho(req, res) {
  const client = await pool.connect();
  try {
    const { id_transportadora, sector_destino, fecha_programada, pedidos } = req.body;

    if (id_transportadora != null && Number.isNaN(Number(id_transportadora))) {
      return res.status(400).json({ ok: false, error: "Transportadora inválida." });
    }
    if (id_transportadora != null) {
      const t = await client.query(`SELECT 1 FROM transportadoras WHERE id_transportadora = $1`, [Number(id_transportadora)]);
      if (t.rows.length === 0) {
        return res.status(400).json({ ok: false, error: "La transportadora no existe." });
      }
    }

    await client.query("BEGIN");
    const guia = await siguienteGuia(client);

    const insert = await client.query(
      `INSERT INTO despachos (numero_guia, id_transportadora, sector_destino, fecha_programada, creado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_despacho`,
      [guia, id_transportadora != null ? Number(id_transportadora) : null,
       sector_destino ? String(sector_destino).trim() : null,
       fecha_programada || null, req.usuario?.id || null]
    );
    const idDespacho = insert.rows[0].id_despacho;

    const lista = Array.isArray(pedidos) ? [...new Set(pedidos.map(Number))].filter((n) => !Number.isNaN(n)) : [];
    for (const idPedido of lista) {
      const error = await validarPedidoParaDespacho(client, idPedido);
      if (error) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: `Pedido ${formatearPedido(idPedido)}: ${error}.` });
      }
      await client.query(
        `INSERT INTO despacho_pedidos (id_despacho, id_pedido) VALUES ($1, $2)`,
        [idDespacho, idPedido]
      );
      await asignarPedidoASalida(client, idPedido);
    }

    await recalcularTotalUnidades(client, idDespacho);
    await client.query("COMMIT");

    const despacho = await obtenerDespachoDetalle(idDespacho);
    res.json({ ok: true, despacho });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en crearDespacho:", error);
    res.status(500).json({ ok: false, error: "No se pudo crear el despacho." });
  } finally {
    client.release();
  }
}

// PATCH /api/despachos/:id/pedidos  { agregar: [], quitar: [] }
export async function modificarPedidosDespacho(req, res) {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "Id de despacho inválido." });

    const { agregar = [], quitar = [] } = req.body;

    await client.query("BEGIN");
    const despacho = await client.query(
      `SELECT estado FROM despachos WHERE id_despacho = $1 FOR UPDATE`,
      [id]
    );
    if (despacho.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Despacho no encontrado." });
    }
    if (!["Preparando", "Novedad"].includes(despacho.rows[0].estado)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "El despacho ya salió: no se pueden cambiar sus pedidos." });
    }

    const agregarLista = [...new Set(agregar.map(Number))].filter((n) => !Number.isNaN(n));
    for (const idPedido of agregarLista) {
      const error = await validarPedidoParaDespacho(client, idPedido);
      if (error) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: `Pedido ${formatearPedido(idPedido)}: ${error}.` });
      }
      await client.query(
        `INSERT INTO despacho_pedidos (id_despacho, id_pedido) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, idPedido]
      );
      await asignarPedidoASalida(client, idPedido);
    }

    const quitarLista = [...new Set(quitar.map(Number))].filter((n) => !Number.isNaN(n));
    if (quitarLista.length > 0) {
      await client.query(
        `DELETE FROM despacho_pedidos WHERE id_despacho = $1 AND id_pedido = ANY($2)`,
        [id, quitarLista]
      );
      for (const idPedido of quitarLista) {
        await devolverPedidoASinSalida(client, idPedido);
      }
    }

    await recalcularTotalUnidades(client, id);
    await client.query("COMMIT");

    const despachoFinal = await obtenerDespachoDetalle(id);
    res.json({ ok: true, despacho: despachoFinal });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en modificarPedidosDespacho:", error);
    res.status(500).json({ ok: false, error: "No se pudieron actualizar los pedidos del despacho." });
  } finally {
    client.release();
  }
}

// PATCH /api/despachos/:id/estado  { estado: "En ruta" | "Entregado" | "Novedad" }
// Al salir, todos los pedidos pasan a "enviado" (En camino); al entregar, a "entregado".
export async function cambiarEstadoDespacho(req, res) {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const destino = String(req.body?.estado || "").trim();
    if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "Id de despacho inválido." });
    if (!ESTADOS_VALIDOS.includes(destino)) {
      return res.status(400).json({ ok: false, error: `Estado inválido. Usa: ${ESTADOS_VALIDOS.join(", ")}.` });
    }

    await client.query("BEGIN");
    const despacho = await client.query(
      `SELECT estado, id_transportadora FROM despachos WHERE id_despacho = $1 FOR UPDATE`,
      [id]
    );
    if (despacho.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Despacho no encontrado." });
    }

    const actual = despacho.rows[0].estado;
    if (destino === actual) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: `El despacho ya está "${actual}".` });
    }
    if (!SIGUIENTE_ESTADO[actual].includes(destino)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: actual === "Entregado"
          ? "Un despacho entregado es terminal: no puede volver a un estado anterior."
          : `No puedes pasar de "${actual}" a "${destino}".`,
      });
    }

    // Necesitamos los pedidos del despacho para actualizarlos y notificar.
    const pedidos = await client.query(
      `SELECT ddp.id_pedido, p.id_cliente, p.estado, p.estado_pago
       FROM despacho_pedidos ddp
       JOIN pedidos p ON p.id_pedido = ddp.id_pedido
       WHERE ddp.id_despacho = $1`,
      [id]
    );

    if (destino === "En ruta") {
      if (pedidos.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "Agrega al menos un pedido antes de marcar el despacho como En ruta." });
      }
      await client.query(`UPDATE despachos SET estado = 'En ruta', fecha_salida = NOW() WHERE id_despacho = $1`, [id]);
      for (const p of pedidos.rows) {
        const estadoP = normalizar(p.estado);
        if (["cancelado", "rechazado"].includes(estadoP) || p.estado_pago === "fallido") continue;
        if (estadoP !== "entregado") {
          await client.query(`UPDATE pedidos SET estado = 'enviado' WHERE id_pedido = $1`, [p.id_pedido]);
        }
        const notif = TITULOS_NOTIFICACION.enviado;
        await client.query(
          `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
           VALUES ($1, 'pedido', $2, $3, $4)`,
          [p.id_cliente, notif.titulo, notif.mensaje, p.id_pedido]
        );
      }
    } else if (destino === "Entregado") {
      await client.query(
        `UPDATE despachos SET estado = 'Entregado', fecha_entrega = NOW(), confirmado_por = $1 WHERE id_despacho = $2`,
        [req.usuario?.id || null, id]
      );
      for (const p of pedidos.rows) {
        const estadoP = normalizar(p.estado);
        if (["cancelado", "rechazado"].includes(estadoP)) continue;
        await client.query(`UPDATE pedidos SET estado = 'entregado' WHERE id_pedido = $1`, [p.id_pedido]);
        const notif = TITULOS_NOTIFICACION.entregado;
        await client.query(
          `INSERT INTO notificaciones (id_cliente, tipo, titulo, mensaje, id_pedido)
           VALUES ($1, 'reseña', $2, $3, $4)`,
          [p.id_cliente, notif.titulo, notif.mensaje, p.id_pedido]
        );
      }
    } else {
      // Novedad: solo marca incidencia, no toca pedidos.
      await client.query(`UPDATE despachos SET estado = 'Novedad' WHERE id_despacho = $1`, [id]);
    }

    await client.query("COMMIT");

    const despachoFinal = await obtenerDespachoDetalle(id);
    res.json({ ok: true, despacho: despachoFinal });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en cambiarEstadoDespacho:", error);
    if (error.code === "42P01") {
      return res.status(500).json({ ok: false, error: "Falta la tabla notificaciones. Corre sql/12_notificaciones.sql." });
    }
    res.status(500).json({ ok: false, error: "No se pudo cambiar el estado del despacho." });
  } finally {
    client.release();
  }
}

// GET /api/despachos/pedidos-disponibles?search=
export async function pedidosDisponibles(req, res) {
  try {
    const search = String(req.query.search || "").trim();
    const q = normalizar(search);

    const result = await pool.query(
      `SELECT
         p.id_pedido, p.fecha_pedido, p.estado, p.estado_pago, p.metodo_pago, p.total,
         p.operacion, p.sector_envio,
         c.nombre, c.apellido, c.email,
         dp1.producto_nombre, dp_sum.cantidad_total
       FROM pedidos p
       JOIN clientes c ON c.id_cliente = p.id_cliente
       LEFT JOIN LATERAL (
         SELECT pr.nombre AS producto_nombre
         FROM detalle_pedidos de2
         JOIN productos pr ON pr.id_producto = de2.id_producto
         WHERE de2.id_pedido = p.id_pedido
         ORDER BY de2.id_detalle
         LIMIT 1
       ) dp1 ON true
       LEFT JOIN LATERAL (
         SELECT SUM(de2.cantidad) AS cantidad_total
         FROM detalle_pedidos de2
         WHERE de2.id_pedido = p.id_pedido
       ) dp_sum ON true
       WHERE p.operacion = 'reparto'
         AND lower(p.estado) NOT IN ('entregado', 'cancelado', 'rechazado')
         AND p.id_pedido NOT IN (
           SELECT ddp.id_pedido
           FROM despacho_pedidos ddp
           JOIN despachos d ON d.id_despacho = ddp.id_despacho
           WHERE d.estado <> 'Entregado'
         )
       ORDER BY p.fecha_pedido DESC`
    );

    let pedidos = result.rows.map((p) => ({
      id: p.id_pedido,
      pedido: formatearPedido(p.id_pedido),
      cliente: `${p.nombre} ${p.apellido}`,
      email: p.email,
      producto: p.producto_nombre || "Sin producto",
      cantidad: Number(p.cantidad_total) || 0,
      total: Number(p.total),
      estado: bucketEstado(p.estado),
      estado_pago: p.estado_pago,
      metodo_pago: p.metodo_pago,
      sector_envio: p.sector_envio || null,
      operacion: p.operacion,
      fecha: p.fecha_pedido,
    }));

    if (q) {
      pedidos = pedidos.filter((p) =>
        normalizar(p.cliente).includes(q) ||
        normalizar(p.producto).includes(q) ||
        normalizar(p.pedido).includes(q)
      );
    }

    res.json({ ok: true, pedidos });
  } catch (error) {
    console.error("Error en pedidosDisponibles:", error);
    res.status(500).json({ ok: false, error: "No se pudieron cargar los pedidos disponibles." });
  }
}

// PATCH /api/despachos/pedidos/:id/operacion  { operacion: "reparto" | "domicilio" }
export async function reclasificarPedido(req, res) {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const operacion = String(req.body?.operacion || "").trim();
    if (Number.isNaN(id)) return res.status(400).json({ ok: false, error: "Id de pedido inválido." });
    if (!["reparto", "domicilio"].includes(operacion)) {
      return res.status(400).json({ ok: false, error: 'Operación inválida. Usa "reparto" o "domicilio".' });
    }

    await client.query("BEGIN");
    const p = await client.query(
      `SELECT p.estado FROM pedidos p WHERE p.id_pedido = $1 FOR UPDATE`,
      [id]
    );
    if (p.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Pedido no encontrado." });
    }
    const estado = normalizar(p.rows[0].estado);
    if (["entregado", "cancelado", "rechazado"].includes(estado)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "No se puede reclasificar un pedido entregado, cancelado o rechazado." });
    }

    const enDespacho = await client.query(
      `SELECT 1
       FROM despacho_pedidos ddp
       JOIN despachos d ON d.id_despacho = ddp.id_despacho
       WHERE ddp.id_pedido = $1 AND d.estado <> 'Entregado'
       LIMIT 1`,
      [id]
    );
    if (enDespacho.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "El pedido está asignado a una salida activa: sacalo del despacho antes de reclasificarlo." });
    }

    await client.query(`UPDATE pedidos SET operacion = $1 WHERE id_pedido = $2`, [operacion, id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error en reclasificarPedido:", error);
    res.status(500).json({ ok: false, error: "No se pudo reclasificar el pedido." });
  } finally {
    client.release();
  }
}