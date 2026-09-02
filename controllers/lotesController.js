import pool from "../config/db.js";
import PDFDocument from "pdfkit";

// ─────────────────────────────────────────
// GET /lotes/:id/trazabilidad
// ─────────────────────────────────────────
export const obtenerTrazabilidadLote = async (req, res) => {
  const { id } = req.params;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "El id del lote debe ser un número" });
  }

  try {
    const lote = await pool.query(
      `SELECT
         l.id_lote, l.codigo_lote, l.variedad, l.cantidad_kg, l.estado,
         f.id AS id_finca, f.nombre AS finca_nombre, f.region, f.altitud, f.lat, f.lng
       FROM lotes l
       LEFT JOIN fincas f ON f.nombre = l.finca
       WHERE l.id_lote = $1`,
      [id]
    );

    if (lote.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Lote no encontrado" });
    }

    const eventos = await pool.query(
      `SELECT id_evento, tipo_evento, fecha, descripcion, ubicacion, imagen_url
       FROM eventos_lote
       WHERE id_lote = $1
       ORDER BY fecha ASC`,
      [id]
    );

    res.status(200).json({
      ok: true,
      data: { ...lote.rows[0], eventos: eventos.rows }
    });

  } catch (error) {
    console.error("Error obteniendo trazabilidad del lote:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener la trazabilidad del lote" });
  }
};

// ─────────────────────────────────────────
// GET /lotes/:id/certificado
// ─────────────────────────────────────────

// Paleta de marca, misma que usa el frontend
const VERDE = '#6FA98C'
const VERDE_OSCURO = '#3E6B54'
const GRIS = '#6B6B6B'
const NEGRO = '#1A1A1A'

export const descargarCertificadoLote = async (req, res) => {
  const { id } = req.params;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "El id del lote debe ser un número" });
  }

  try {
    const lote = await pool.query(
      `SELECT
         l.codigo_lote, l.variedad, l.cantidad_kg,
         f.nombre AS finca_nombre, f.region, f.altitud
       FROM lotes l
       LEFT JOIN fincas f ON f.nombre = l.finca
       WHERE l.id_lote = $1`,
      [id]
    );

    if (lote.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Lote no encontrado" });
    }

    const eventoCosecha = await pool.query(
      `SELECT fecha FROM eventos_lote WHERE id_lote = $1 AND tipo_evento = 'cosecha' LIMIT 1`,
      [id]
    );

    const datos = lote.rows[0];
    const fechaCosecha = eventoCosecha.rows[0]?.fecha;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-lote-${id}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);

    const anchoPagina = doc.page.width;
    const altoPagina = doc.page.height;
    const margenContenido = 60;

    // ── Borde decorativo de toda la página ──────────────────────────
    doc.rect(20, 20, anchoPagina - 40, altoPagina - 40)
       .lineWidth(1.5)
       .stroke(VERDE);
    doc.rect(26, 26, anchoPagina - 52, altoPagina - 52)
       .lineWidth(0.5)
       .stroke(VERDE);

    // ── Franja superior con la marca ────────────────────────────────
    doc.rect(20, 20, anchoPagina - 40, 90).fill(VERDE);
    doc.fillColor('#FFFFFF')
       .fontSize(24).font('Helvetica-Bold')
       .text('GRANOVA', margenContenido, 50);
    doc.fontSize(10).font('Helvetica')
       .text('Café de origen · Trazabilidad garantizada', margenContenido, 80);

    // ── Título del documento ────────────────────────────────────────
    doc.fillColor(NEGRO)
       .fontSize(20).font('Helvetica-Bold')
       .text('Certificado de Origen', margenContenido, 140, { align: 'center', width: anchoPagina - margenContenido * 2 });

    doc.moveTo(margenContenido, 175)
       .lineTo(anchoPagina - margenContenido, 175)
       .lineWidth(1).stroke(VERDE);

    // ── Datos del lote ───────────────────────────────────────────────
    let y = 200;
    const escribirFila = (etiqueta, valor) => {
      doc.fillColor(GRIS).fontSize(10).font('Helvetica').text(etiqueta, margenContenido, y);
      doc.fillColor(NEGRO).fontSize(12).font('Helvetica-Bold').text(valor, margenContenido, y + 14);
      y += 45;
    };

    doc.rect(margenContenido - 10, y - 15, 5, 30).fill(VERDE); // barrita de color junto al título
    doc.fillColor(VERDE_OSCURO).fontSize(13).font('Helvetica-Bold').text('DATOS DEL LOTE', margenContenido + 5, y - 10);
    y += 30;

    escribirFila('Código de lote', datos.codigo_lote || '—');
    escribirFila('Variedad', datos.variedad || '—');
    escribirFila('Cantidad', `${datos.cantidad_kg} kg`);

    y += 10;
    doc.rect(margenContenido - 10, y - 15, 5, 30).fill(VERDE);
    doc.fillColor(VERDE_OSCURO).fontSize(13).font('Helvetica-Bold').text('ORIGEN', margenContenido + 5, y - 10);
    y += 30;

    escribirFila('Finca', datos.finca_nombre || 'No registrada');
    if (datos.region) escribirFila('Región', datos.region);
    if (datos.altitud) escribirFila('Altitud', datos.altitud);

    if (fechaCosecha) {
      y += 10;
      doc.rect(margenContenido - 10, y - 15, 5, 30).fill(VERDE);
      doc.fillColor(VERDE_OSCURO).fontSize(13).font('Helvetica-Bold').text('COSECHA', margenContenido + 5, y - 10);
      y += 30;
      escribirFila(
        'Fecha de cosecha',
        new Date(fechaCosecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
      );
    }

    // ── Sello de verificación ───────────────────────────────────────
    const selloX = anchoPagina - 140;
    const selloY = altoPagina - 200;
    doc.circle(selloX, selloY, 45).lineWidth(2).stroke(VERDE);
    doc.circle(selloX, selloY, 38).lineWidth(0.5).stroke(VERDE);
    doc.fillColor(VERDE_OSCURO).fontSize(9).font('Helvetica-Bold')
       .text('ORIGEN', selloX - 35, selloY - 12, { width: 70, align: 'center' });
    doc.text('VERIFICADO', selloX - 35, selloY + 2, { width: 70, align: 'center' });

    // ── Pie de página ───────────────────────────────────────────────
    doc.moveTo(margenContenido, altoPagina - 70)
       .lineTo(anchoPagina - margenContenido, altoPagina - 70)
       .lineWidth(0.5).stroke('#DDDDDD');
    doc.fillColor(GRIS).fontSize(8).font('Helvetica')
       .text(
         `Documento generado automáticamente el ${new Date().toLocaleDateString('es-CO')} · Granova © ${new Date().getFullYear()}`,
         margenContenido, altoPagina - 55,
         { align: 'center', width: anchoPagina - margenContenido * 2 }
       );

    doc.end();

  } catch (error) {
    console.error("Error generando certificado:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al generar el certificado" });
  }
};

// ─────────────────────────────────────────
// POST /inventario/lotes - crear lote (empleado)
// ─────────────────────────────────────────
export const crearLote = async (req, res) => {
  try {
    const { codigo_lote, finca, region, variedad, cantidad_kg } = req.body;
    if (!codigo_lote || !String(codigo_lote).trim()) {
      return res.status(400).json({ ok: false, error: "El código de lote es obligatorio" });
    }
    if (!finca || !String(finca).trim()) {
      return res.status(400).json({ ok: false, error: "La finca es obligatoria" });
    }
    const kg = Number(cantidad_kg);
    if (!Number.isFinite(kg) || kg <= 0) {
      return res.status(400).json({ ok: false, error: "cantidad_kg debe ser un número mayor que 0" });
    }
    const result = await pool.query(
      `INSERT INTO lotes (codigo_lote, finca, region, variedad, cantidad_kg, estado, fecha_registro)
       VALUES ($1, $2, $3, $4, $5, 'disponible', NOW()) RETURNING id_lote`,
      [codigo_lote.trim(), finca, region || null, variedad || null, kg]
    );
    res.json({ ok: true, id_lote: result.rows[0].id_lote });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return res.status(400).json({ ok: false, error: "Ese código de lote ya existe" });
    }
    res.status(500).json({ ok: false, error: error.message });
  }
};

// ─────────────────────────────────────────
// PATCH /inventario/lotes/:id - editar lote (empleado)
// ─────────────────────────────────────────
export const actualizarLote = async (req, res) => {
  try {
    const { id } = req.params;
    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: "El id del lote debe ser un número" });
    }
    const { codigo_lote, region, variedad, cantidad_kg, estado } = req.body;
    if (cantidad_kg !== undefined && (!Number.isFinite(Number(cantidad_kg)) || Number(cantidad_kg) <= 0)) {
      return res.status(400).json({ ok: false, error: "cantidad_kg debe ser un número mayor que 0" });
    }
    const result = await pool.query(
      `UPDATE lotes SET
         codigo_lote = COALESCE($1, codigo_lote),
         region = COALESCE($2, region),
         variedad = COALESCE($3, variedad),
         cantidad_kg = COALESCE($4, cantidad_kg),
         estado = COALESCE($5, estado)
       WHERE id_lote = $6 RETURNING id_lote`,
      [codigo_lote || null, region || null, variedad || null,
       cantidad_kg !== undefined ? Number(cantidad_kg) : null, estado || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Lote no encontrado" });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

// ─────────────────────────────────────────
// DELETE /inventario/lotes/:id - eliminar lote (empleado)
// Solo permite lotes sin actividad: sin productos activos, sin procesamientos,
// sin cosechas planeadas en curso y sin entregas registradas.
// ─────────────────────────────────────────
export const eliminarLote = async (req, res) => {
  const { id } = req.params;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, error: "El id del lote debe ser un número" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existe = await client.query(`SELECT codigo_lote FROM lotes WHERE id_lote = $1`, [id]);
    if (existe.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "Lote no encontrado" });
    }

    const bloqueos = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM productos p WHERE p.id_lote = $1 AND p.estado = 'activo') AS productos,
         (SELECT COUNT(*) FROM procesamientos_lote pl WHERE pl.id_lote = $1) AS procesamientos,
         (SELECT COUNT(*) FROM cosechas_planeadas cp WHERE cp.id_lote = $1 AND cp.estado != 'cancelada') AS cosechas,
         (SELECT COUNT(*) FROM entregas_finca ef WHERE ef.id_lote = $1 AND ef.estado != 'anulada') AS entregas`,
      [id]
    );

    const b = bloqueos.rows[0];
    const razones = [
      Number(b.productos) > 0 && "productos activos",
      Number(b.procesamientos) > 0 && "procesamientos registrados",
      Number(b.cosechas) > 0 && "cosechas planeadas en curso",
      Number(b.entregas) > 0 && "entregas registradas",
    ].filter(Boolean);

    if (razones.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: `El lote no se puede eliminar: tiene ${razones.join(", ")}. Elimina primero esos registros o edítalo para dejarlo sin actividad.`,
      });
    }

    await client.query(`DELETE FROM eventos_lote WHERE id_lote = $1`, [id]);
    await client.query(`DELETE FROM lotes WHERE id_lote = $1 RETURNING id_lote`, [id]);
    await client.query("COMMIT");

    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    if (error.code === "23503") {
      return res.status(409).json({ ok: false, error: "El lote tiene registros relacionados que impiden eliminarlo." });
    }
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// POST /inventario/lotes/:id/eventos - registrar evento de trazabilidad (empleado)
// body: { tipo_evento, descripcion?, ubicacion?, fecha? }
// Tipos permitidos: cosecha, procesado, tostado, envasado, enviado, entregado
// (el CHECK de la tabla eventos_lote los valida de nuevo por seguridad).
// ─────────────────────────────────────────
export const registrarEventoLote = async (req, res) => {
  const { id } = req.params;
  const { tipo_evento, descripcion, ubicacion, fecha } = req.body;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, error: "El id del lote debe ser un número" });
  }

  const TIPOS_PERMITIDOS = ["cosecha", "procesado", "tostado", "envasado", "enviado", "entregado"];
  if (!TIPOS_PERMITIDOS.includes(tipo_evento)) {
    return res.status(400).json({
      ok: false,
      error: `tipo_evento inválido. Usa uno de: ${TIPOS_PERMITIDOS.join(", ")}`,
    });
  }

  try {
    const loteExiste = await pool.query(`SELECT id_lote FROM lotes WHERE id_lote = $1`, [id]);
    if (loteExiste.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Lote no encontrado" });
    }

    const resultado = await pool.query(
      `INSERT INTO eventos_lote (id_lote, tipo_evento, fecha, descripcion, ubicacion)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_evento`,
      [id, tipo_evento, fecha || new Date().toISOString(), descripcion || null, ubicacion || null]
    );

    res.status(201).json({ ok: true, data: resultado.rows[0] });
  } catch (error) {
    console.error("Error registrando evento de lote:", error.message);
    res.status(500).json({ ok: false, error: "No se pudo registrar el evento del lote" });
  }
};