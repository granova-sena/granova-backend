import nodemailer from "nodemailer"
import { obtenerFacturaCompleta, obtenerProductosDePedido } from "../models/facturasModel.js"

// ── Configuración del transportador de correo ─────────────────
const transportador = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// ─────────────────────────────────────────────────────────────
// POST /api/correo/cotizacion
// Envía la cotización por correo al cliente
// ─────────────────────────────────────────────────────────────
export const enviarCotizacion = async (req, res) => {
    console.log("Body recibido:", req.body)

  const { email, nombre, productos, subtotal, descuento, iva, total } = req.body

  if (!email || !nombre || !productos?.length) {
    return res.status(400).json({
      ok:      false,
      mensaje: "Faltan datos obligatorios"
    })
  }

  // Construimos la tabla de productos en HTML
  const filasProductos = productos.map(p => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">${p.nombre}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">${p.presentacion || '-'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">${p.cantidad}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">$${Number(p.precio).toLocaleString()}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e7e7e7;">$${(Number(p.precio) * p.cantidad).toLocaleString()}</td>
    </tr>
  `).join("")

  const contenidoHTML = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

      <div style="background-color: #1C3A0A; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">GRANOVA</h1>
        <p style="color: #D4C49A; margin: 5px 0 0;">Cotización de productos</p>
      </div>

      <div style="padding: 24px;">
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Adjuntamos la cotización que solicitaste. A continuación encontrarás el detalle:</p>

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
          <tbody>
            ${filasProductos}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 16px;">
          <p>Subtotal: <strong>$${Number(subtotal).toLocaleString()}</strong></p>
          <p style="color: #2D5A27;">Descuento: <strong>- $${Number(descuento).toLocaleString()}</strong></p>
          <p style="color: #C8102E;">IVA: <strong>$${Number(iva).toLocaleString()}</strong></p>
          <h3>TOTAL: $${Number(total).toLocaleString()}</h3>
        </div>

        <hr style="border: none; border-top: 1px solid #e7e7e7; margin: 20px 0;">
        <p style="color: #888888; font-size: 12px;">
          Esta cotización es válida por 2 días. Si tienes dudas contáctanos por WhatsApp 300 123 4567.
        </p>
      </div>

    </div>
  `

  try {
    await transportador.sendMail({
      from:    `"Granova" <${process.env.EMAIL_USER}>`,
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