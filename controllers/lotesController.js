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

  if (isNaN(id)) {
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