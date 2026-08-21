import pool from "../../config/db.js"
import { obtenerParametro } from "./parametrosController.js"

// POST /inventario/entregas - registrar entrega de café de una finca (empleado)
const crearEntrega = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id_finca, id_lote, cantidad_kg, valor, tipo_cafe } = req.body
    if (!id_finca || !id_lote || !cantidad_kg || valor === undefined) {
      return res.status(400).json({ ok: false, error: "id_finca, id_lote, cantidad_kg y valor son obligatorios" })
    }
    const tipo = tipo_cafe === 'cereza' ? 'cereza' : 'pergamino'

    // Kg netos: la cereza tiene que pasar por LAS DOS mermas para llegar a
    // café tostado (cereza→pergamino, y luego pergamino→tostado); el
    // pergamino que ya llega así solo pasa por la segunda.
    const pctQuedaCereza = 100 - (await obtenerParametro('merma_cereza_pergamino_pct', 22))
    const pctQuedaTueste = 100 - (await obtenerParametro('merma_pergamino_tostado_pct', 18))
    const kgNetos = tipo === 'cereza'
      ? Number(cantidad_kg) * (pctQuedaCereza / 100) * (pctQuedaTueste / 100)
      : Number(cantidad_kg) * (pctQuedaTueste / 100)

    await client.query("BEGIN")

    const entrega = await client.query(
      `INSERT INTO entregas_finca (id_finca, id_lote, cantidad_kg, kg_netos, valor, tipo_cafe, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_entrega`,
      [id_finca, id_lote, Number(cantidad_kg), kgNetos, Number(valor), tipo, req.usuario.id]
    )

    // Café que llega se SUMA al lote (en kg netos, ya utilizables), nunca se sobreescribe
    await client.query(
      `UPDATE lotes SET cantidad_kg = cantidad_kg + $1,
       estado = CASE WHEN estado = 'agotado' THEN 'disponible' ELSE estado END
       WHERE id_lote = $2`,
      [kgNetos, id_lote]
    )

    await client.query("COMMIT")
    res.json({ ok: true, id_entrega: entrega.rows[0].id_entrega, kg_netos: kgNetos })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  } finally {
    client.release()
  }
}

// GET /inventario/entregas - listado + resumen para Control de lotes
const listarEntregas = async (req, res) => {
  try {
    const entregas = await pool.query(`
      SELECT e.id_entrega, e.cantidad_kg, e.kg_netos, e.tipo_cafe, e.valor, e.estado_pago, e.estado, e.fecha,
             f.id AS id_finca, f.nombre AS finca_nombre,
             l.id_lote, l.codigo_lote,
             ur.nombre AS registrado_por_nombre,
             up.nombre AS pagado_por_nombre, e.fecha_pago
      FROM entregas_finca e
      JOIN fincas f ON f.id = e.id_finca
      JOIN lotes l ON l.id_lote = e.id_lote
      LEFT JOIN usuarios ur ON ur.id_usuario = e.registrado_por
      LEFT JOIN usuarios up ON up.id_usuario = e.pagado_por
      WHERE e.estado = 'registrada'
      ORDER BY e.fecha DESC, e.id_entrega DESC
    `)

    const resumen = await pool.query(`
      SELECT
        COALESCE(SUM(cantidad_kg), 0) AS kg_entregados,
        COALESCE(SUM(valor) FILTER (WHERE estado_pago = 'pagado'), 0) AS total_pagado,
        COALESCE(SUM(valor) FILTER (WHERE estado_pago = 'pendiente'), 0) AS total_pendiente
      FROM entregas_finca
      WHERE estado = 'registrada'
        AND date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)
    `)

    res.json({ ok: true, entregas: entregas.rows, resumen: resumen.rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/entregas/:id/pagar
const marcarPagado = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `UPDATE entregas_finca SET estado_pago = 'pagado', pagado_por = $1, fecha_pago = NOW()
       WHERE id_entrega = $2 AND estado = 'registrada' RETURNING id_entrega`,
      [req.usuario.id, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Entrega no encontrada" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/entregas/:id/anular - no borra, conserva trazabilidad
const anularEntrega = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id } = req.params

    await client.query("BEGIN")
    const entrega = await client.query(
      `SELECT id_lote, kg_netos FROM entregas_finca WHERE id_entrega = $1 AND estado = 'registrada'`,
      [id]
    )
    if (entrega.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, error: "Entrega no encontrada o ya anulada" })
    }

    const lote = await client.query(
      `SELECT cantidad_kg, kg_perdido, kg_en_proceso FROM lotes WHERE id_lote = $1 FOR UPDATE`,
      [entrega.rows[0].id_lote]
    )
    const kgNetos = Number(entrega.rows[0].kg_netos)
    const nuevoCantidad = Number(lote.rows[0].cantidad_kg) - kgNetos
    const yaComprometido = Number(lote.rows[0].kg_perdido) + Number(lote.rows[0].kg_en_proceso)
    if (nuevoCantidad < yaComprometido) {
      await client.query("ROLLBACK")
      return res.status(400).json({
        ok: false,
        error: "No se puede anular: parte de ese café ya se marcó como perdido, en proceso, o ya se convirtió en producto (Procesar Lote). Revisa el lote antes de anular."
      })
    }

    await client.query(`UPDATE entregas_finca SET estado = 'anulada' WHERE id_entrega = $1`, [id])
    // Revierte los kg netos que se habían sumado por error
    await client.query(
      `UPDATE lotes SET cantidad_kg = cantidad_kg - $1 WHERE id_lote = $2`,
      [kgNetos, entrega.rows[0].id_lote]
    )
    await client.query("COMMIT")
    res.json({ ok: true })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  } finally {
    client.release()
  }
}

export { crearEntrega, listarEntregas, marcarPagado, anularEntrega }
