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
  const {
    sabor_preferido, metodo_preparacion, presupuesto,
    categoria = "cafe", uso_equipo, metodo_equipo, presupuesto_equipo
  } = req.body
  // El cliente sale del token, nunca del body — así nadie puede
  // sobreescribir las preferencias de otro.
  const id_cliente = req.usuario.id

  if (categoria === "maquina") {
    if (!uso_equipo || !metodo_equipo || !presupuesto_equipo) {
      return res.status(400).json({ ok: false, mensaje: "El quiz de maquinaria requiere uso, método y presupuesto" })
    }

    try {
      const resultado = await pool.query(
        `INSERT INTO preferencias_cliente (id_cliente, categoria_preferida, uso_equipo, metodo_equipo, presupuesto_equipo, fecha_actualizacion)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id_cliente)
         DO UPDATE SET
           categoria_preferida = $2,
           uso_equipo = $3,
           metodo_equipo = $4,
           presupuesto_equipo = $5,
           fecha_actualizacion = NOW()
         RETURNING *`,
        [id_cliente, categoria, uso_equipo, metodo_equipo, presupuesto_equipo]
      )

      return res.status(200).json({ ok: true, data: resultado.rows[0] })
    } catch (error) {
      console.error("Error guardando preferencias de equipo:", error.message)
      return res.status(500).json({ ok: false, mensaje: "Error al guardar preferencias de equipo" })
    }
  }

  if (!sabor_preferido || !metodo_preparacion || !presupuesto) {
    return res.status(400).json({ ok: false, mensaje: "Faltan campos obligatorios" })
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO preferencias_cliente (id_cliente, categoria_preferida, sabor_preferido, metodo_preparacion, presupuesto, fecha_actualizacion)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id_cliente)
       DO UPDATE SET
         categoria_preferida = $2,
         sabor_preferido = $3,
         metodo_preparacion = $4,
         presupuesto = $5,
         fecha_actualizacion = NOW()
       RETURNING *`,
      [id_cliente, categoria, sabor_preferido, metodo_preparacion, presupuesto]
    )

    res.status(200).json({ ok: true, data: resultado.rows[0] })

  } catch (error) {
    console.error("Error guardando preferencias:", error.message)
    res.status(500).json({ ok: false, mensaje: "Error al guardar preferencias" })
  }
}

const PRESUPUESTO_EQUIPO_RANGO = {
  economico: { min: 0, max: 1000000 },
  medio: { min: 1000000, max: 3000000 },
  premium: { min: 3000000, max: 999999999 }
}

const CLAVES_EQUIPO = {
  espresso: ["%espresso%", "%capuchin%"],
  filtrado: ["%filtrad%", "%goteo%", "%v60%", "%prensa%"],
  molido: ["%molino%", "%molido%", "%grano%"]
}

function recomendarMaquinas(res, pref) {
  const rango = PRESUPUESTO_EQUIPO_RANGO[pref.presupuesto_equipo] || { min: 0, max: 999999999 }
  const claves = CLAVES_EQUIPO[pref.metodo_equipo] || []

  return pool.query(
    `SELECT * FROM productos
      WHERE estado = 'activo' AND stock > 0 AND categoria_producto = 'maquina'
        AND precio BETWEEN $1 AND $2
      ORDER BY
        CASE WHEN ($3::text[] IS NOT NULL AND (nombre ILIKE ANY($3::text[]) OR descripcion ILIKE ANY($3::text[]))) THEN 0 ELSE 1 END,
        stock DESC
      LIMIT 6`,
    [rango.min, rango.max, claves.length ? claves : null]
  ).then((resultado) => res.status(200).json({ ok: true, data: resultado.rows }))
}

// ─────────────────────────────────────────
// GET /api/preferencias/:id_cliente/recomendaciones?categoria=cafe|maquina
// ─────────────────────────────────────────
export const obtenerRecomendaciones = async (req, res) => {
  const { id_cliente } = req.params
  const { categoria } = req.query

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

    const pref = prefs.rows[0]
    const cat = categoria || pref.categoria_preferida || "cafe"

    if (cat === "maquina") {
      return recomendarMaquinas(res, pref)
    }

    const { sabor_preferido, presupuesto } = pref

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
          AND precio BETWEEN $1 AND $2
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