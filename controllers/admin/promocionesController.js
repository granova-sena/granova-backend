import pool from "../../config/db.js"

// ─────────────────────────────────────────
// Frente ADMIN: gestión de promociones (crear, editar, desactivar)
// Solo accesible con rol admin.
// ─────────────────────────────────────────

const TIPOS_DESCUENTO_VALIDOS = ["porcentaje", "monto_fijo"];

// GET /api/admin/promociones — todas las promos con sus productos
export const listarPromociones = async (req, res) => {
  try {
    const promos = await pool.query(
      `SELECT pr.id_promocion, pr.nombre, pr.tipo_descuento, pr.valor_descuento, pr.fecha_inicio, pr.fecha_fin, pr.estado
       FROM promociones pr
       ORDER BY pr.fecha_fin DESC NULLS LAST, pr.id_promocion DESC`
    );

    const productos = await pool.query(
      `SELECT pp.id_promocion, p.id_producto, p.nombre
       FROM promocion_productos pp
       JOIN productos p ON p.id_producto = pp.id_producto`
    );

    const data = promos.rows.map((p) => ({
      ...p,
      productos: productos.rows.filter((x) => x.id_promocion === p.id_promocion),
    }));

    res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error("Error listando promociones:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al listar promociones" });
  }
};

// POST /api/admin/promociones
// body: { nombre, tipo_descuento, valor_descuento, fecha_fin, productos?: [id_producto] }
//
// tipo_descuento y fecha_fin son NOT NULL en la tabla `promociones`, así que
// ambos son obligatorios en el body (antes solo se validaban nombre y
// valor_descuento, y tipo_descuento ni se enviaba al INSERT).
export const crearPromocion = async (req, res) => {
  const { nombre, valor_descuento, fecha_fin, productos } = req.body;
  // El formulario actual no pide tipo de descuento (siempre valida el valor
  // entre 1 y 100), así que se asume 'porcentaje' por defecto en vez de
  // exigir un campo nuevo en el frontend.
  const tipo_descuento = TIPOS_DESCUENTO_VALIDOS.includes(req.body.tipo_descuento)
    ? req.body.tipo_descuento
    : "porcentaje";

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ ok: false, mensaje: "El nombre es obligatorio" });
  }
  const descuento = Number(valor_descuento);
  if (!Number.isFinite(descuento) || descuento <= 0) {
    return res.status(400).json({ ok: false, mensaje: "El descuento debe ser mayor a 0" });
  }
  if (tipo_descuento === "porcentaje" && descuento > 100) {
    return res.status(400).json({ ok: false, mensaje: "El descuento en porcentaje no puede superar 100" });
  }
  if (!fecha_fin) {
    return res.status(400).json({ ok: false, mensaje: "fecha_fin es obligatoria" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const promo = await client.query(
      `INSERT INTO promociones (nombre, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, estado)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, 'activa')
       RETURNING id_promocion`,
      [String(nombre).trim(), tipo_descuento, descuento, fecha_fin]
    );

    const idPromo = promo.rows[0].id_promocion;
    if (Array.isArray(productos) && productos.length > 0) {
      for (const idProducto of productos) {
        await client.query(
          `INSERT INTO promocion_productos (id_promocion, id_producto) VALUES ($1, $2)`,
          [idPromo, Number(idProducto)]
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ ok: true, data: { id_promocion: idPromo } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error creando promoción:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al crear la promoción" });
  } finally {
    client.release();
  }
};

// PATCH /api/admin/promociones/:id
// body: { nombre?, tipo_descuento?, valor_descuento?, fecha_fin?, estado?, productos? }
export const actualizarPromocion = async (req, res) => {
  const { id } = req.params;
  const { nombre, tipo_descuento, valor_descuento, fecha_fin, estado, productos } = req.body;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "Id inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existente = await client.query(`SELECT id_promocion FROM promociones WHERE id_promocion = $1`, [id]);
    if (existente.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Promoción no encontrada" });
    }

    if (nombre !== undefined) {
      await client.query(`UPDATE promociones SET nombre = $1 WHERE id_promocion = $2`, [String(nombre).trim(), id]);
    }
    if (tipo_descuento !== undefined) {
      if (!TIPOS_DESCUENTO_VALIDOS.includes(tipo_descuento)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "tipo_descuento debe ser 'porcentaje' o 'monto_fijo'" });
      }
      await client.query(`UPDATE promociones SET tipo_descuento = $1 WHERE id_promocion = $2`, [tipo_descuento, id]);
    }
    if (valor_descuento !== undefined) {
      const descuento = Number(valor_descuento);
      if (!Number.isFinite(descuento) || descuento <= 0 || descuento > 100) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "El descuento debe estar entre 1 y 100" });
      }
      await client.query(`UPDATE promociones SET valor_descuento = $1 WHERE id_promocion = $2`, [descuento, id]);
    }
    if (fecha_fin !== undefined) {
      if (!fecha_fin) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "fecha_fin no puede quedar vacía" });
      }
      await client.query(`UPDATE promociones SET fecha_fin = $1 WHERE id_promocion = $2`, [fecha_fin, id]);
    }
    if (estado !== undefined) {
      if (!["activa", "inactiva", "finalizada"].includes(estado)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "Estado inválido: activa, inactiva o finalizada" });
      }
      await client.query(`UPDATE promociones SET estado = $1 WHERE id_promocion = $2`, [estado, id]);
    }
    if (Array.isArray(productos)) {
      await client.query(`DELETE FROM promocion_productos WHERE id_promocion = $1`, [id]);
      for (const idProducto of productos) {
        await client.query(
          `INSERT INTO promocion_productos (id_promocion, id_producto) VALUES ($1, $2)`,
          [id, Number(idProducto)]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error actualizando promoción:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al actualizar la promoción" });
  } finally {
    client.release();
  }
};