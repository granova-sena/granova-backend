import pool from "../config/db.js";

const TIPOS_PERSONA = ["natural", "juridica"];
const TIPOS_DOCUMENTO = ["CC", "CE", "NIT", "PASAPORTE"];

// Valida los campos de identificación de un cliente (PN/PJ).
// Devuelve un mensaje de error o null si todo está bien.
function validarIdentificacion(tipo_persona, tipo_documento, numero_documento, digito_verificacion, razon_social) {
  if (!TIPOS_PERSONA.includes(tipo_persona)) {
    return "Tipo de persona inválido. Opciones: natural, juridica";
  }

  if (!tipo_documento || !TIPOS_DOCUMENTO.includes(tipo_documento)) {
    return "Tipo de documento inválido. Opciones: CC, CE, NIT, PASAPORTE";
  }

  if (!numero_documento || !numero_documento.trim()) {
    return "El número de documento es obligatorio";
  }

  if (tipo_persona === "juridica") {
    if (tipo_documento !== "NIT") {
      return "Una persona jurídica debe registrarse con NIT";
    }
    if (!razon_social || !razon_social.trim()) {
      return "La razón social es obligatoria para personas jurídicas";
    }
    if (!digito_verificacion || !digito_verificacion.trim()) {
      return "El dígito de verificación del NIT es obligatorio";
    }
  } else if (tipo_documento === "NIT") {
    return "Una persona natural no puede registrarse con NIT";
  }

  return null;
}

// GET /api/clientes/:id — datos de identificación del cliente
// Solo el propio cliente (o admin/empleado) puede verlos.
export const obtenerCliente = async (req, res) => {
  const { id } = req.params;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "El id del cliente debe ser un número" });
  }

  // Solo el propio cliente (id en token sin rol) o un ADMIN (rol 'admin')
  // pueden ver perfiles. Un token de empleado NUNCA accede por aquí.
  const esAdmin = req.usuario?.rol === "admin";
  const esDueno = req.usuario?.id === Number(id);
  if (!esAdmin && !esDueno) {
    return res.status(403).json({ ok: false, mensaje: "No tienes permiso para ver este perfil" });
  }

  try {
    const resultado = await pool.query(
      `SELECT id_cliente, nombre, apellido, email, verificado, fecha_creacion, puntos,
              tipo_persona, tipo_documento, numero_documento, digito_verificacion, razon_social, tipo_cliente
       FROM clientes
       WHERE id_cliente = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Cliente no encontrado" });
    }

    res.status(200).json({ ok: true, data: resultado.rows[0] });
  } catch (error) {
    console.error("Error obteniendo cliente:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener el cliente" });
  }
};

// PUT /api/clientes/:id — actualiza los datos de identificación del cliente
// Nota: tipo_cliente NO se edita desde aquí (decide el precio); lo gestiona el equipo interno.
export const actualizarCliente = async (req, res) => {
  const { id } = req.params;

  if (Number.isNaN(Number(id))) {
    return res.status(400).json({ ok: false, mensaje: "El id del cliente debe ser un número" });
  }

  // Mismo criterio que el GET: solo el propio cliente o un ADMIN.
  const esAdmin = req.usuario?.rol === "admin";
  const esDueno = req.usuario?.id === Number(id);
  if (!esAdmin && !esDueno) {
    return res.status(403).json({ ok: false, mensaje: "No tienes permiso para editar este perfil" });
  }

  const {
    tipo_persona, tipo_documento, numero_documento,
    digito_verificacion, razon_social
  } = req.body;

  if (!tipo_persona || !tipo_documento || !numero_documento) {
    return res.status(400).json({ ok: false, mensaje: "tipo_persona, tipo_documento y numero_documento son obligatorios" });
  }

  const errorValidacion = validarIdentificacion(
    tipo_persona, tipo_documento, numero_documento, digito_verificacion, razon_social
  );
  if (errorValidacion) {
    return res.status(400).json({ ok: false, mensaje: errorValidacion });
  }

  try {
    const resultado = await pool.query(
      `UPDATE clientes
       SET tipo_persona = $1,
           tipo_documento = $2,
           numero_documento = $3,
           digito_verificacion = $4,
           razon_social = $5
       WHERE id_cliente = $6
       RETURNING id_cliente, nombre, apellido, email, tipo_persona, tipo_documento, numero_documento, digito_verificacion, razon_social, tipo_cliente`,
      [tipo_persona, tipo_documento, numero_documento.trim(), digito_verificacion || null, razon_social || null, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Cliente no encontrado" });
    }

    res.status(200).json({ ok: true, data: resultado.rows[0], mensaje: "Perfil actualizado correctamente" });
  } catch (error) {
    if (error.code === "23505") {
      const campo = error.constraint || "";
      if (campo.includes("numero_documento")) {
        return res.status(400).json({ ok: false, mensaje: "Ese número de documento ya está registrado por otro cliente" });
      }
      return res.status(400).json({ ok: false, mensaje: "Ya existe un registro con esos datos" });
    }
    if (error.code === "23502") {
      return res.status(400).json({ ok: false, mensaje: `Falta un campo obligatorio: ${error.column || 'desconocido'}` });
    }
    if (error.code === "22P02") {
      return res.status(400).json({ ok: false, mensaje: "Formato de dato inválido en uno de los campos" });
    }
    console.error("Error actualizando cliente:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al actualizar el cliente" });
  }
};
