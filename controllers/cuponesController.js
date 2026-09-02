import pool from "../config/db.js";
import crypto from "node:crypto";

// ─────────────────────────────────────────
// Frente D (Jhon) — Lealtad: canje de puntos por cupones
// - El barrio de niveles vive en la tabla `niveles_lealtad` (Bronce/Plata/Oro)
//   para poder ajustar puntos/canje/% sin tocar código.
// - Cada nivel define: cuántos puntos hay que tener (puntos_min, "alcanzar"),
//   cuántos se pagan al canjear (canje_puntos) y el % del cupón (descuento_pct).
// - Cupón: código aleatorio corto, vigencia 30 días, un solo uso.
// - El cupón entra al "mayor gana" en crearPedido (nunca suma).
// ─────────────────────────────────────────

const VIGENCIA_DIAS = 30;

async function obtenerNivelesActivos() {
  const res = await pool.query(
    `SELECT id, nombre, puntos_min, canje_puntos, descuento_pct
     FROM niveles_lealtad
     WHERE activo = true
     ORDER BY puntos_min ASC`
  );
  return res.rows;
}

// POST /api/cupones/validar  { codigo: "GRN-XXXXXX" }
// Solo INFORMA si el cupón es válido (dueño, no usado, no vencido).
// NO consume nada: el consumo real pasa en crearPedido al confirmar.
export const validarCupon = async (req, res) => {
  const id_cliente = req.usuario?.id;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para validar un cupón" });
  }

  const codigo = (req.body?.codigo || "").trim().toUpperCase();

  if (!codigo) {
    return res.status(400).json({ ok: false, mensaje: "Escribe el código del cupón" });
  }

  try {
    // Personas jurídicas no usan cupones de lealtad (tienen 10% de empresa)
    const perfil = await pool.query(
      `SELECT tipo_persona FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );
    if (perfil.rows[0]?.tipo_persona === "juridica") {
      return res.status(400).json({
        ok: false,
        mensaje: "Los cupones de lealtad no aplican para cuentas empresariales",
      });
    }

    const resultado = await pool.query(
      `SELECT descuento_pct, fecha_vencimiento
       FROM cupones
       WHERE codigo = $1 AND id_cliente = $2 AND usado = false AND fecha_vencimiento > NOW()`,
      [codigo, id_cliente]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "Cupón inválido, vencido o ya usado" });
    }

    res.status(200).json({
      ok: true,
      data: {
        codigo,
        descuento_pct: Number(resultado.rows[0].descuento_pct),
        fecha_vencimiento: resultado.rows[0].fecha_vencimiento,
      },
      mensaje: `Cupón válido: ${resultado.rows[0].descuento_pct}% de descuento`,
    });

  } catch (error) {
    console.error("Error validando cupón:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al validar el cupón" });
  }
};

// GET /api/cupones — cupones del cliente: activos + historial (usados/vencidos)
//                  + niveles de lealtad disponibles para el canje.
export const obtenerCupones = async (req, res) => {
  const id_cliente = req.usuario?.id;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para ver tus cupones" });
  }

  try {
    const [activosRes, historialRes, niveles, perfilRes] = await Promise.all([
      pool.query(
        `SELECT codigo, descuento_pct, fecha_creacion, fecha_vencimiento
         FROM cupones
         WHERE id_cliente = $1 AND usado = false AND fecha_vencimiento > NOW()
         ORDER BY fecha_creacion DESC`,
        [id_cliente]
      ),
      pool.query(
        `SELECT codigo, descuento_pct, fecha_creacion, fecha_vencimiento, usado,
                CASE WHEN usado = false THEN 'vencido'
                     WHEN usado = true  THEN 'usado'
                     ELSE 'usado' END AS estado_usado
         FROM cupones
         WHERE id_cliente = $1 AND (usado = true OR fecha_vencimiento <= NOW())
         ORDER BY fecha_creacion DESC
         LIMIT 20`,
        [id_cliente]
      ),
      obtenerNivelesActivos(),
      pool.query(`SELECT puntos FROM clientes WHERE id_cliente = $1`, [id_cliente]),
    ]);

    const puntos = Number(perfilRes.rows[0]?.puntos || 0);

    // Solo se ofrecen canjes de niveles que el cliente ya ALCANZÓ (puntos >= puntos_min)
    // y que además puede pagar (puntos >= canje_puntos).
    const opcionesCanje = niveles.map(n => ({
      ...n,
      alcanzado: puntos >= Number(n.puntos_min),
      canjeable: puntos >= Number(n.canje_puntos),
    }));

    res.status(200).json({
      ok: true,
      data: {
        activos: activosRes.rows,
        historial: historialRes.rows,
        niveles: niveles,
        opciones_canje: opcionesCanje,
        puntos,
      },
    });

  } catch (error) {
    console.error("Error obteniendo cupones:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener los cupones" });
  }
};

// POST /api/cupones/canjear  { puntos: 500 | 1000 | 2500 }
export const canjearCupon = async (req, res) => {
  const id_cliente = req.usuario?.id;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para canjear puntos" });
  }

  const puntosPedidos = Number(req.body?.puntos);
  const niveles = await obtenerNivelesActivos();
  const recompensa = niveles.find(n => Number(n.canje_puntos) === puntosPedidos);

  if (!recompensa) {
    const opciones = niveles.map(n => n.canje_puntos).join(", ");
    return res.status(400).json({
      ok: false,
      mensaje: `Canje inválido. Opciones: ${opciones} puntos`
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const clienteRes = await client.query(
      `SELECT puntos, tipo_persona FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Cliente no encontrado" });
    }

    // Personas jurídicas no participan del programa de lealtad
    if (clienteRes.rows[0].tipo_persona === "juridica") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        mensaje: "Las cuentas empresariales no canjean puntos: ya tienen descuento de empresa",
      });
    }

    const puntosActuales = Number(clienteRes.rows[0].puntos || 0);

    // Debe haber ALCANZADO el nivel además de tener los puntos para pagarlo.
    if (puntosActuales < Number(recompensa.puntos_min)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        mensaje: `Aún no alcanzas el nivel ${recompensa.nombre}: necesitas ${recompensa.puntos_min} puntos acumulados`,
      });
    }

    if (puntosActuales < recompensa.canje_puntos) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        mensaje: `Puntos insuficientes: tienes ${puntosActuales} y necesitas ${recompensa.canje_puntos}`
      });
    }

    // Código corto y legible (fácil de escribir en el checkout): GRN-XXXXXX
    // Debe ser ÚNICO (columna codigo): se regenera si choca con uno existente,
    // para que cada reclamo genere un token nuevo de verdad.
    let codigo = "";
    for (let intento = 0; intento < 5; intento++) {
      codigo = "GRN-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      const existe = await client.query(
        `SELECT 1 FROM cupones WHERE codigo = $1`,
        [codigo]
      );
      if (existe.rows.length === 0) break;
    }
    const fechaVencimiento = new Date(Date.now() + VIGENCIA_DIAS * 24 * 60 * 60 * 1000);

    // Decremento atómico: la condición "puntos >= $1" evita que dos canjes
    // simultáneos dupliquen el cupón o dejen puntos negativos.
    const puntosRes = await client.query(
      `UPDATE clientes SET puntos = puntos - $1 WHERE id_cliente = $2 AND puntos >= $1 RETURNING puntos`,
      [recompensa.canje_puntos, id_cliente]
    );

    if (puntosRes.rows.length === 0) {
      const puntosActualesTrasCambio = Number((await client.query(
        `SELECT puntos FROM clientes WHERE id_cliente = $1`,
        [id_cliente]
      )).rows[0]?.puntos || 0);
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        mensaje: `Puntos insuficientes: tienes ${puntosActualesTrasCambio} y necesitas ${recompensa.canje_puntos}`
      });
    }

    await client.query(
      `INSERT INTO cupones (id_cliente, codigo, descuento_pct, fecha_vencimiento)
       VALUES ($1, $2, $3, $4)`,
      [id_cliente, codigo, recompensa.descuento_pct, fechaVencimiento]
    );

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      data: {
        codigo,
        descuento_pct: recompensa.descuento_pct,
        vigencia_dias: VIGENCIA_DIAS,
        puntos_restantes: Number(puntosRes.rows[0].puntos),
      },
      mensaje: `¡Cupón de ${recompensa.descuento_pct}% creado (nivel ${recompensa.nombre})!`
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error canjeando cupón:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al canjear el cupón" });
  } finally {
    client.release();
  }
};
