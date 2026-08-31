import pool from "../../config/db.js"

// GET /inventario/lotes/:id/disponible - kg neto disponible para repartir
const getDisponibleLote = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT cantidad_kg, kg_perdido, kg_en_proceso,
              (cantidad_kg - kg_perdido - kg_en_proceso) AS kg_disponible
       FROM lotes WHERE id_lote = $1`,
      [id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Lote no encontrado" })
    res.json({ ok: true, ...result.rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/lotes/:id/perdida-proceso - el empleado actualiza cuánto
// se perdió y cuánto sigue en proceso; el disponible se recalcula solo.
// Validación ANTES de escribir: si la pérdida supera el disponible, se
// rechaza sin tocar la BD (antes quedaba guardado el valor inválido).
const actualizarPerdidaProceso = async (req, res) => {
  try {
    const { id } = req.params
    const { kg_perdido, kg_en_proceso } = req.body

    const actual = await pool.query(
      `SELECT cantidad_kg, kg_perdido, kg_en_proceso FROM lotes WHERE id_lote = $1`,
      [id]
    )
    if (actual.rows.length === 0) return res.status(404).json({ ok: false, error: "Lote no encontrado" })

    const nuevoPerdido = kg_perdido !== undefined ? Number(kg_perdido) : Number(actual.rows[0].kg_perdido)
    const nuevoProceso = kg_en_proceso !== undefined ? Number(kg_en_proceso) : Number(actual.rows[0].kg_en_proceso)

    if (!Number.isFinite(nuevoPerdido) || nuevoPerdido < 0 || !Number.isFinite(nuevoProceso) || nuevoProceso < 0) {
      return res.status(400).json({ ok: false, error: "Los kg deben ser números positivos" })
    }
    if (Number(actual.rows[0].cantidad_kg) - nuevoPerdido - nuevoProceso < -0.001) {
      return res.status(400).json({ ok: false, error: "La pérdida más el proceso no puede superar el kg total del lote" })
    }

    const result = await pool.query(
      `UPDATE lotes SET
         kg_perdido = $1,
         kg_en_proceso = $2
       WHERE id_lote = $3
       RETURNING cantidad_kg, kg_perdido, kg_en_proceso, (cantidad_kg - kg_perdido - kg_en_proceso) AS kg_disponible`,
      [nuevoPerdido, nuevoProceso, id]
    )
    res.json({ ok: true, ...result.rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/lotes/:id/liberar-proceso
// Cuando el café que estaba "en proceso" (tostándose/empacándose) ya
// terminó, esto lo libera de vuelta al disponible para poder repartirlo.
// SOLO aplica a procesos que NO llegaron por "Cosechas planeadas": si el
// lote tiene un proceso pendiente allí (origen 'proceso-lote'), liberar a
// mano descuadraría el lote (los kg volverían y luego la confirmación los
// descontaría otra vez). En ese caso se usa el confirmar/cancelar de la bandeja.
const liberarProceso = async (req, res) => {
  try {
    const { id } = req.params
    const { kg } = req.body
    if (!kg || Number(kg) <= 0) {
      return res.status(400).json({ ok: false, error: "Indica cuántos kg terminaron el proceso" })
    }

    const pendiente = await pool.query(
      `SELECT id_cosecha FROM cosechas_planeadas
       WHERE id_lote = $1 AND estado = 'planeada' AND origen = 'proceso-lote'
       LIMIT 1`,
      [id]
    )
    if (pendiente.rows.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "Este lote tiene un proceso pendiente en 'Cosechas planeadas'. Confírmalo o cancélalo allí: ese kg se libera o se descuenta automáticamente, sin editar aquí."
      })
    }

    const result = await pool.query(
      `UPDATE lotes SET kg_en_proceso = GREATEST(kg_en_proceso - $1, 0)
       WHERE id_lote = $2
       RETURNING cantidad_kg, kg_perdido, kg_en_proceso, (cantidad_kg - kg_perdido - kg_en_proceso) AS kg_disponible`,
      [Number(kg), id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Lote no encontrado" })
    res.json({ ok: true, ...result.rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// POST /inventario/lotes/:id/procesar  [DEPRECADO]
// Antes materializaba productos, sumaba stock y descontaba kg de una sola vez.
// Ese camino quedó reemplazado por el flujo unificado que usa el frontend:
//   Procesar lote (Cosechas planeadas) -> confirmar agregar-catálogo
// (crearCosecha con marcar_en_proceso + confirmarCosecha). Este endpoint ya no
// se usa y además contravenía el flujo (y escribía tipo_cafe no permitido).
// Se deja con un 410 para que cualquier llamada vieja reciba un mensaje claro.
const procesarLote = async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: "Este endpoint quedó deprecado. Usa 'Procesar lote' en Control de Inventario: deja el lote en 'en proceso' y luego conflmar 'Agregar a catálogo' en Cosechas planeadas (POST /inventario/cosechas y PATCH /inventario/cosechas/:id/confirmar)."
  })
}

export { getDisponibleLote, actualizarPerdidaProceso, liberarProceso, procesarLote }

