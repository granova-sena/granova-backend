import pool from "../config/db.js";

// ─────────────────────────────────────────
// GET /api/preferencias/:id_cliente
// ─────────────────────────────────────────
export const obtenerPreferencias = async (req, res) => {
  const { id_cliente } = req.params

  if (String(req.usuario.id) !== String(id_cliente)) {
    return res.status(403).json({ ok: false, mensaje: "No puedes ver las preferencias de otro cliente" })
  }

  try {
    const resultado = await pool.query(
      `SELECT * FROM preferencias_cliente WHERE id_cliente = $1`,
      [id_cliente]
    )

    if (resultado.rows.length === 0) {
      return res.status(200).json({ ok: true, data: null })
    }

    res.status(200).json({ ok: true, data: resultado.rows[0] })

  } catch (error) {
    console.error("Error obteniendo preferencias:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al obtener preferencias" })
  }
}

// ─────────────────────────────────────────
// POST /api/preferencias
// ─────────────────────────────────────────
export const guardarPreferencias = async (req, res) => {
  const { sabor_preferido, metodo_preparacion, presupuesto } = req.body
  // El cliente sale del token, nunca del body — así nadie puede
  // sobreescribir las preferencias de otro.
  const id_cliente = req.usuario.id

  if (!sabor_preferido || !metodo_preparacion || !presupuesto) {
    return res.status(400).json({ ok: false, mensaje: "Faltan campos obligatorios" })
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO preferencias_cliente (id_cliente, sabor_preferido, metodo_preparacion, presupuesto, fecha_actualizacion)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id_cliente) 
       DO UPDATE SET 
         sabor_preferido = $2,
         metodo_preparacion = $3,
         presupuesto = $4,
         fecha_actualizacion = NOW()
       RETURNING *`,
      [id_cliente, sabor_preferido, metodo_preparacion, presupuesto]
    )

    res.status(200).json({ ok: true, data: resultado.rows[0] })

  } catch (error) {
    console.error("Error guardando preferencias:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al guardar preferencias" })
  }
}

// ─────────────────────────────────────────
// GET /api/preferencias/:id_cliente/recomendaciones
// ─────────────────────────────────────────
export const obtenerRecomendaciones = async (req, res) => {
  const { id_cliente } = req.params

  if (String(req.usuario.id) !== String(id_cliente)) {
    return res.status(403).json({ ok: false, mensaje: "No puedes ver las recomendaciones de otro cliente" })
  }

  try {
    // Obtener preferencias del cliente
    const prefs = await pool.query(
      `SELECT * FROM preferencias_cliente WHERE id_cliente = $1`,
      [id_cliente]
    )

    if (prefs.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "El cliente no tiene preferencias guardadas" })
    }

    const { sabor_preferido, presupuesto } = prefs.rows[0]

    // Mapear sabor a tipo_cafe
    const saborTipo = {
      afrutado: ['natural', 'honey', 'washed'],
      achocolatado: ['molido', 'espresso', 'blend'],
      tostado: ['tostado', 'grano', 'molido'],
      floral: ['natural', 'washed', 'especial']
    }

    // Mapear presupuesto a rango de precios
    const presupuestoRango = {
      menos_20000: { min: 0, max: 20000 },
      '20000_50000': { min: 20000, max: 50000 },
      mas_50000: { min: 50000, max: 999999999 }
    }

    const tipos = saborTipo[sabor_preferido] || []
    const rango = presupuestoRango[presupuesto] || { min: 0, max: 999999999 }

    const productos = await pool.query(
      `(SELECT * FROM productos 
        WHERE estado = 'activo' AND stock > 0 AND categoria_producto = 'cafe'
          AND precio BETWEEN $1 AND $2
        ORDER BY CASE WHEN tipo_cafe = ANY($3::text[]) THEN 0 ELSE 1 END, stock DESC
        LIMIT 4)
       UNION ALL
       (SELECT * FROM productos 
        WHERE estado = 'activo' AND stock > 0 AND categoria_producto = 'maquina'
        ORDER BY stock DESC
        LIMIT 2)`,
      [rango.min, rango.max, tipos]
    )

    res.status(200).json({ ok: true, data: productos.rows })

  } catch (error) {
    console.error("Error obteniendo recomendaciones:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al obtener recomendaciones" })
  }
}