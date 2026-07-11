const express = require('express');
const router  = express.Router();
const pool = require('../config/db');

// GET /api/productos - obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM productos ORDER BY fecha_creacion DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener productos:', error.message);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/productos/:id - obtener un producto por id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM productos WHERE id_producto = $1', [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

module.exports = router;