import pool from "../../config/db.js"

const getUsuarios = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM usuarios
      ORDER BY id_usuario ASC
    `);

    res.json({ ok: true, usuarios: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const crearUsuario = async (req, res) => {
  try {
    const { nombre, email, estado = 'activo' } = req.body;

    if (!nombre || !email) {
      return res.status(400).json({ ok: false, error: 'Nombre y email son obligatorios.' });
    }

    const result = await pool.query(`
      INSERT INTO usuarios (nombre, email, estado)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [nombre, email, estado]);

    res.status(201).json({ ok: true, usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ ok: false, error: 'El estado es obligatorio.' });
    }

    const result = await pool.query(`
      UPDATE usuarios
      SET estado = $1
      WHERE id_usuario = $2
      RETURNING *
    `, [estado, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    res.json({ ok: true, usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM usuarios
      WHERE id_usuario = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
    }

    res.json({ ok: true, eliminado: true, usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

export { getUsuarios, cambiarEstado, eliminarUsuario, crearUsuario };