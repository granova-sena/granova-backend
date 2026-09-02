import pool from "../../config/db.js"
import bcrypt from "bcrypt"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ESTADOS_VALIDOS = ["activo", "inactivo", "bloqueado"]
const ROLES_VALIDOS = ["admin", "empleado", "logistica"]

// Chequeo cruzado: un correo no puede existir en clientes y usuarios a la vez.
const emailYaEnUso = async (client, email) => {
  const resultado = await client.query(
    `SELECT email FROM usuarios WHERE email = $1
     UNION
     SELECT email FROM clientes WHERE email = $1`,
    [email]
  )
  return resultado.rows.length > 0
}

const getUsuarios = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_usuario, nombre, apellido, email, rol, estado
      FROM usuarios
      ORDER BY id_usuario ASC
    `);

    res.json({ ok: true, usuarios: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Error al listar los usuarios" });
  }
};

const crearUsuario = async (req, res) => {
  try {
    const { nombre, apellido, email, contraseña, rol = 'empleado', estado = 'activo' } = req.body;

    if (!nombre || !apellido || !email || !contraseña) {
      return res.status(400).json({ ok: false, error: 'Nombre, apellido, email y contraseña son obligatorios.' });
    }

    if (!EMAIL_REGEX.test(String(email))) {
      return res.status(400).json({ ok: false, error: 'El correo no es válido.' });
    }

    // Misma política mínima que el registro de clientes.
    const errorContraseña = !contraseña || String(contraseña).length < 6
      ? 'La contraseña debe tener al menos 6 caracteres'
      : null;
    if (errorContraseña) return res.status(400).json({ ok: false, error: errorContraseña });

    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ ok: false, error: 'Rol inválido. Opciones: admin, empleado, logistica.' });
    }
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, error: 'Estado inválido. Opciones: activo, inactivo, bloqueado.' });
    }

    if (await emailYaEnUso(pool, email)) {
      return res.status(400).json({ ok: false, error: 'Ese correo ya está registrado.' });
    }

    const contraseñaHash = await bcrypt.hash(contraseña, 10);

    const result = await pool.query(`
      INSERT INTO usuarios (nombre, apellido, email, contraseña, rol, estado)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_usuario, nombre, apellido, email, rol, estado
    `, [nombre, apellido, email, contraseñaHash, rol, estado]);

    res.status(201).json({ ok: true, usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return res.status(400).json({ ok: false, error: 'Ese correo ya está registrado.' });
    }
    res.status(500).json({ ok: false, error: 'Error al crear el usuario' });
  }
};

const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: 'Id inválido.' });
    }
    if (!ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ ok: false, error: 'Estado inválido. Opciones: activo, inactivo, bloqueado.' });
    }

    const result = await pool.query(`
      UPDATE usuarios
      SET estado = $1
      WHERE id_usuario = $2
      RETURNING id_usuario, nombre, email, rol, estado
    `, [estado, Number(id)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    res.json({ ok: true, usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error al cambiar el estado' });
  }
};

const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    if (Number.isNaN(Number(id))) {
      return res.status(400).json({ ok: false, error: 'Id inválido.' });
    }

    const result = await pool.query(`
      DELETE FROM usuarios
      WHERE id_usuario = $1
      RETURNING id_usuario
    `, [Number(id)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    res.json({ ok: true, eliminado: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error al eliminar el usuario' });
  }
};

export { getUsuarios, cambiarEstado, eliminarUsuario, crearUsuario };