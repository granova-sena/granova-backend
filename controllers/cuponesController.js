import pool from "../config/db.js";
import crypto from "node:crypto";

// ─────────────────────────────────────────
// Frente D (Jhon) — Lealtad: canje de puntos por cupones
// - 500 puntos → cupón 5% | 1.000 puntos → cupón 10%
// - Cupón: código aleatorio corto, vigencia 30 días, un solo uso.
// - El cupón entra al "mayor gana" en crearPedido (nunca suma).
// ─────────────────────────────────────────
const RECOMPENSAS = [
  { puntos: 500, descuento_pct: 5 },
  { puntos: 1000, descuento_pct: 10 },
];

const VIGENCIA_DIAS = 30;

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

// GET /api/cupones — cupones activos del cliente (persisten aunque cierre sesión)
export const obtenerCupones = async (req, res) => {
  const id_cliente = req.usuario?.id;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para ver tus cupones" });
  }

  try {
    const resultado = await pool.query(
      `SELECT codigo, descuento_pct, fecha_creacion, fecha_vencimiento
       FROM cupones
       WHERE id_cliente = $1 AND usado = false AND fecha_vencimiento > NOW()
       ORDER BY fecha_creacion DESC`,
      [id_cliente]
    );

    res.status(200).json({ ok: true, data: resultado.rows });

  } catch (error) {
    console.error("Error obteniendo cupones:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener los cupones" });
  }
};

// POST /api/cupones/canjear  { puntos: 500 | 1000 }
export const canjearCupon = async (req, res) => {
  const id_cliente = req.usuario?.id;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para canjear puntos" });
  }

  const puntosPedidos = Number(req.body?.puntos);
  const recompensa = RECOMPENSAS.find(r => r.puntos === puntosPedidos);

  if (!recompensa) {
    return res.status(400).json({
      ok: false,
      mensaje: "Canje inválido. Opciones: 500 puntos (cupón 5%) o 1000 puntos (cupón 10%)"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const clienteRes = await client.query(
      `SELECT puntos FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Cliente no encontrado" });
    }

    const puntosActuales = Number(clienteRes.rows[0].puntos || 0);

    if (puntosActuales < recompensa.puntos) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        mensaje: `Puntos insuficientes: tienes ${puntosActuales} y necesitas ${recompensa.puntos}`
      });
    }

    // Código corto y legible (fácil de escribir en el checkout): GRN-XXXXXX
    const codigo = "GRN-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const fechaVencimiento = new Date(Date.now() + VIGENCIA_DIAS * 24 * 60 * 60 * 1000);

    const puntosRes = await client.query(
      `UPDATE clientes SET puntos = puntos - $1 WHERE id_cliente = $2 RETURNING puntos`,
      [recompensa.puntos, id_cliente]
    );

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
      mensaje: `¡Cupón de ${recompensa.descuento_pct}% creado!`
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error canjeando cupón:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al canjear el cupón" });
  } finally {
    client.release();
  }
};
