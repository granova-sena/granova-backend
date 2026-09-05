import transportador from "../config/email.js"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const escapeHtml = (valor) =>
  String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]))

// ─────────────────────────────────────────────────────────────
// POST /api/correo/cotizacion
// Envía la cotización por correo al cliente
// ─────────────────────────────────────────────────────────────
export const enviarCotizacion = async (req, res) => {
  const { email, nombre, productos, subtotal, descuento, total, numero, id_cotizacion } = req.body

  // Ruta de detalle de la cotización: /cliente/cotizaciones/:id muestra el
  // documento y permite comprar desde la propia cotización (flujo GRN-58).
  const URL_FRONTEND = process.env.FRONTEND_URL || "https://www.granovaoficial.com"
  const linkCotizacion = id_cotizacion
    ? `${URL_FRONTEND}/cliente/cotizaciones/${id_cotizacion}`
    : `${URL_FRONTEND}/cliente/cotizacion`

  if (!email || !nombre || !productos?.length) {
    return res.status(400).json({
      ok:      false,
      mensaje: "Faltan datos obligatorios"
    })
  }

  if (!EMAIL_REGEX.test(String(email))) {
    return res.status(400).json({ ok: false, mensaje: "El correo no es válido" })
  }

  if (!Array.isArray(productos) || productos.length > 60) {
    return res.status(400).json({ ok: false, mensaje: "Lista de productos inválida" })
  }

  const filasProductos = productos.slice(0, 60).map(p => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">${escapeHtml(p.nombre)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">${escapeHtml(p.presentacion || '-')}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">${escapeHtml(p.cantidad)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">$${Number(p.precio).toLocaleString()}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">$${(Number(p.precio) * p.cantidad).toLocaleString()}</td>
    </tr>
  `).join("")

  const contenidoHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1C3A0A; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">GRANOVA</h1>
        <p style="color: #D4C49A; margin: 5px 0 0;">Cotización de productos${numero ? ` · N° ${numero}` : ''}</p>
      </div>
      <div style="padding: 24px;">
        <p>Hola <strong>${escapeHtml(nombre)}</strong>,</p>
        <p>Adjuntamos la cotización que solicitaste:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #2D5A27; color: white;">
              <th style="padding: 10px; text-align: left;">Producto</th>
              <th style="padding: 10px; text-align: left;">Presentación</th>
              <th style="padding: 10px; text-align: left;">Cantidad</th>
              <th style="padding: 10px; text-align: left;">Precio</th>
              <th style="padding: 10px; text-align: left;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${filasProductos}</tbody>
        </table>
        <div style="text-align: right; margin-top: 16px;">
          <p>Subtotal: <strong>$${Number(subtotal).toLocaleString()}</strong></p>
          <p style="color: #2D5A27;">Descuento: <strong>- $${Number(descuento).toLocaleString()}</strong></p>
          <h3>TOTAL (IVA incluido): $${Number(total).toLocaleString()}</h3>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${linkCotizacion}" style="background-color: #6FA98C; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Ver mi cotización
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e7e7e7; margin: 20px 0;">
        <p style="color: #888888; font-size: 12px;">
          Esta cotización es válida por 8 días y no representa una orden de compra. Si tienes dudas contáctanos por WhatsApp 300 123 4567.
        </p>
      </div>
    </div>
  `

  try {
    await transportador.sendMail({
      to:      email,
      subject: "Tu cotización de Granova",
      html:    contenidoHTML,
    })

    return res.status(200).json({
      ok:      true,
      mensaje: "Cotización enviada exitosamente"
    })

  } catch (error) {
    console.error("Error enviando correo:", error.message)
    return res.status(500).json({
      ok:      false,
      mensaje: "Error al enviar el correo"
    })
  }
}