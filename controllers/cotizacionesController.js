import pool from "../config/db.js";

const ESTADOS_DISPONIBLES = ["emitida", "aceptada", "vencida", "anulada"];

const sanearItems = (items) =>
  Array.isArray(items)
    ? items.slice(0, 60).map((it) => ({
        id_producto: it.id_producto != null ? Number(it.id_producto) : null,
        nombre: String(it.nombre || "").slice(0, 200),
        presentacion: it.presentacion != null ? String(it.presentacion).slice(0, 120) : null,
        cantidad: Math.max(Math.floor(Number(it.cantidad ?? it.cant ?? 0)) || 0, 1),
        precio: Math.max(Number(it.precio) || 0, 0),
        subtotal: Math.max(Number(it.subtotal) || 0, 0),
      }))
    : [];

// POST /api/cotizaciones → cliente guarda una cotización de su carrito o pedido
const guardarCotizacion = async (req, res) => {
  const { numero_cotizacion, items, subtotal, descuento, total, validez_dias } = req.body;
  const id_cliente = req.usuario?.id ?? req.usuario?.id_cliente;

  if (!id_cliente) {
    return res.status(401).json({ ok: false, error: "No hay sesión de cliente activa." });
  }

  const pItems = sanearItems(items);
  if (pItems.length === 0) {
    return res.status(400).json({ ok: false, error: "La cotización no tiene productos." });
  }

  const numero = String(numero_cotizacion || "").trim() || null;
  const subtotalNum = Math.max(Number(subtotal) || 0, 0);
  const descuentoNum = Math.max(Number(descuento) || 0, 0);
  const totalNum = Math.max(Number(total) || 0, 0);
  const validez = Math.min(Math.max(Math.floor(Number(validez_dias)) || 8, 1), 90);

  try {
    // "Una sola cotización por el carrito": el cliente mantiene una única
    // cotización activa de su carrito. Si ya tiene una, se reemplaza la
    // última en lugar de acumular duplicados cada vez que pulsa "Guardar".
    const ultima = await pool.query(
      `SELECT id_cotizacion FROM cotizaciones
       WHERE id_cliente = $1
       ORDER BY creada_en DESC
       LIMIT 1`,
      [id_cliente]
    );

    let resultado;
    if (ultima.rows.length > 0) {
      resultado = await pool.query(
        `UPDATE cotizaciones
           SET numero_cotizacion = $1, items = $2, subtotal = $3,
               descuento = $4, total = $5, validez_dias = $6, estado = 'emitida', creada_en = NOW()
         WHERE id_cotizacion = $7
         RETURNING id_cotizacion, numero_cotizacion, creada_en`,
        [numero, JSON.stringify(pItems), subtotalNum, descuentoNum, totalNum, validez, ultima.rows[0].id_cotizacion]
      );
    } else {
      resultado = await pool.query(
        `INSERT INTO cotizaciones
           (numero_cotizacion, id_cliente, items, subtotal, descuento, total, validez_dias)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_cotizacion, numero_cotizacion, creada_en`,
        [numero, id_cliente, JSON.stringify(pItems), subtotalNum, descuentoNum, totalNum, validez]
      );
    }
    res.status(200).json({ ok: true, cotizacion: resultado.rows[0] });
  } catch (error) {
    console.error("Error guardando cotización:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo guardar la cotización." });
  }
};

// GET /api/cotizaciones → "Mis cotizaciones"
const listarMisCotizaciones = async (req, res) => {
  const id_cliente = req.usuario?.id ?? req.usuario?.id_cliente;
  if (!id_cliente) {
    return res.status(401).json({ ok: false, error: "No hay sesión de cliente activa." });
  }

  try {
    const resultado = await pool.query(
      `SELECT id_cotizacion, numero_cotizacion, items, subtotal, descuento, total,
              validez_dias, estado, creada_en
       FROM cotizaciones
       WHERE id_cliente = $1
       ORDER BY creada_en DESC
       LIMIT 100`,
      [id_cliente]
    );
    res.json({ ok: true, cotizaciones: resultado.rows });
  } catch (error) {
    console.error("Error listando cotizaciones:", error);
    res.status(500).json({ ok: false, error: "No se pudieron cargar las cotizaciones." });
  }
};

// GET /api/admin/cotizaciones → panel: todas, con datos del cliente
const listarCotizaciones = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.id_cotizacion, c.numero_cotizacion, c.items, c.subtotal, c.descuento,
              c.total, c.validez_dias, c.estado, c.creada_en,
              c.id_cliente, cl.nombre, cl.apellido, cl.email, cl.razon_social
       FROM cotizaciones c
       LEFT JOIN clientes cl ON cl.id_cliente = c.id_cliente
       ORDER BY c.creada_en DESC
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

export { guardarCotizacion, listarMisCotizaciones, listarCotizaciones, cambiarEstadoCotizacion };