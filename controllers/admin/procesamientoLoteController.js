import pool from "../../config/db.js"
import { obtenerParametro } from "./parametrosController.js"

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
const actualizarPerdidaProceso = async (req, res) => {
  try {
    const { id } = req.params
    const { kg_perdido, kg_en_proceso } = req.body
    const result = await pool.query(
      `UPDATE lotes SET
         kg_perdido = COALESCE($1, kg_perdido),
         kg_en_proceso = COALESCE($2, kg_en_proceso)
       WHERE id_lote = $3
       RETURNING cantidad_kg, kg_perdido, kg_en_proceso, (cantidad_kg - kg_perdido - kg_en_proceso) AS kg_disponible`,
      [kg_perdido !== undefined ? Number(kg_perdido) : null, kg_en_proceso !== undefined ? Number(kg_en_proceso) : null, id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Lote no encontrado" })
    if (Number(result.rows[0].kg_disponible) < 0) {
      return res.status(400).json({ ok: false, error: "La pérdida más el proceso no puede superar el kg total del lote" })
    }
    res.json({ ok: true, ...result.rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/lotes/:id/liberar-proceso
// Cuando el café que estaba "en proceso" (tostándose/empacándose) ya
// terminó, esto lo libera de vuelta al disponible para poder repartirlo.
const liberarProceso = async (req, res) => {
  try {
    const { id } = req.params
    const { kg } = req.body
    if (!kg || Number(kg) <= 0) {
      return res.status(400).json({ ok: false, error: "Indica cuántos kg terminaron el proceso" })
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

// Costo real por kg de un lote: lo que de verdad se le pagó a la finca,
// entre los kg netos que entregó. Si el lote no tiene entregas registradas
// (caso raro / dato viejo), no hay forma de saberlo y se devuelve null.
async function costoPromedioLote(client, idLote) {
  const result = await client.query(
    `SELECT SUM(valor) / NULLIF(SUM(kg_netos), 0) AS costo_kg
     FROM entregas_finca WHERE id_lote = $1 AND estado = 'registrada'`,
    [idLote]
  )
  const costo = result.rows[0].costo_kg
  return costo !== null ? Number(costo) : null
}

// POST /inventario/lotes/:id/procesar
// body: { repartos: [{ id_presentacion, cantidad }] }
// Ya no exige que el producto exista de antemano: si no hay un producto
// para esa combinación lote+presentación, el sistema lo crea solo, con
// nombre, costo y precio calculados desde lo que de verdad costó el lote.
const procesarLote = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const { repartos } = req.body
    if (!Array.isArray(repartos) || repartos.length === 0) {
      return res.status(400).json({ ok: false, error: "Agrega al menos un reparto" })
    }

    await client.query("BEGIN")

    const loteRes = await client.query(
      `SELECT id_lote, codigo_lote, finca, variedad, cantidad_kg, kg_perdido, kg_en_proceso
       FROM lotes WHERE id_lote = $1 FOR UPDATE`,
      [id]
    )
    if (loteRes.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, error: "Lote no encontrado" })
    }
    const lote = loteRes.rows[0]
    const kgDisponible = Number(lote.cantidad_kg) - Number(lote.kg_perdido) - Number(lote.kg_en_proceso)

    let kgUtilizados = 0
    const detalleValidado = []

    for (const r of repartos) {
      if (!r.id_presentacion || !r.cantidad || Number(r.cantidad) <= 0) {
        await client.query("ROLLBACK")
        return res.status(400).json({ ok: false, error: "Cada reparto necesita id_presentacion y una cantidad válida" })
      }
      const presRes = await client.query(
        `SELECT id_presentacion, nombre, kg_equivalente FROM presentaciones_catalogo WHERE id_presentacion = $1 AND activo = true`,
        [r.id_presentacion]
      )
      if (presRes.rows.length === 0) {
        await client.query("ROLLBACK")
        return res.status(404).json({ ok: false, error: `Presentación ${r.id_presentacion} no existe o está inactiva` })
      }
      const pres = presRes.rows[0]
      const kgDeEsteReparto = Number(r.cantidad) * Number(pres.kg_equivalente)
      kgUtilizados += kgDeEsteReparto
      detalleValidado.push({ presentacion: pres, cantidad: Number(r.cantidad) })
    }

    if (kgUtilizados > kgDisponible + 0.001) {
      await client.query("ROLLBACK")
      return res.status(400).json({
        ok: false,
        error: `El reparto usa ${kgUtilizados.toFixed(2)} kg pero solo hay ${kgDisponible.toFixed(2)} kg disponibles`
      })
    }

    const costoKg = await costoPromedioLote(client, id)
    const margenMayorista = await obtenerParametro('margen_venta_mayorista_pct', 20)
    const margenMinimo = await obtenerParametro('margen_minimo_mayorista_publico_pct', 30)

    const procesamiento = await client.query(
      `INSERT INTO procesamientos_lote (id_lote, kg_utilizados, procesado_por) VALUES ($1, $2, $3) RETURNING id_procesamiento`,
      [id, kgUtilizados, req.usuario.id]
    )

    for (const d of detalleValidado) {
      let producto = await client.query(
        `SELECT id_producto FROM productos WHERE id_lote = $1 AND id_presentacion = $2 AND estado = 'activo'`,
        [id, d.presentacion.id_presentacion]
      )

      let idProducto
      if (producto.rows.length > 0) {
        idProducto = producto.rows[0].id_producto
        // Sumar stock, nunca sobreescribir
        await client.query(`UPDATE productos SET stock = stock + $1 WHERE id_producto = $2`, [d.cantidad, idProducto])
      } else {
        // No existe: el sistema lo crea solo con el costo real del lote
        const costoUnitario = costoKg !== null ? costoKg * Number(d.presentacion.kg_equivalente) : 0
        const precioMayorista = costoUnitario * (1 + margenMayorista / 100)
        const precioPublico = precioMayorista * (1 + margenMinimo / 100)
        const nombre = `${lote.variedad || lote.codigo_lote} · ${d.presentacion.nombre} · ${lote.finca}`

        const nuevo = await client.query(
          `INSERT INTO productos (
             id_lote, nombre, tipo_cafe, presentacion, id_presentacion, precio, precio_mayorista,
             costo_unitario, stock, estado, categoria_producto, creado_por, fecha_creacion
           ) VALUES ($1, $2, 'pergamino', $3, $4, $5, $6, $7, $8, 'activo', 'cafe', $9, NOW())
           RETURNING id_producto`,
          [id, nombre, d.presentacion.nombre, d.presentacion.id_presentacion,
           Math.round(precioPublico), Math.round(precioMayorista), Math.round(costoUnitario),
           d.cantidad, req.usuario.id]
        )
        idProducto = nuevo.rows[0].id_producto
      }

      await client.query(
        `INSERT INTO procesamiento_detalle (id_procesamiento, id_producto, cantidad_agregada) VALUES ($1, $2, $3)`,
        [procesamiento.rows[0].id_procesamiento, idProducto, d.cantidad]
      )
    }

    // El kg procesado deja de estar "disponible" para repartir de nuevo
    await client.query(
      `UPDATE lotes SET cantidad_kg = cantidad_kg - $1 WHERE id_lote = $2`,
      [kgUtilizados, id]
    )

    await client.query("COMMIT")
    res.json({ ok: true, kg_utilizados: kgUtilizados })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  } finally {
    client.release()
  }
}

export { getDisponibleLote, actualizarPerdidaProceso, liberarProceso, procesarLote }

