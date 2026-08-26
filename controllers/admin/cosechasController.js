import pool from "../../config/db.js"
import { obtenerParametro } from "./parametrosController.js"

// POST /inventario/cosechas
// body: { id_finca, id_lote, kg_estimados, tipo_cafe, valor_estimado, repartos: [{id_presentacion, cantidad}] }
const crearCosecha = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id_finca, id_lote, kg_estimados, tipo_cafe, valor_estimado, repartos } = req.body
    if (!id_finca || !id_lote || !kg_estimados || valor_estimado === undefined) {
      return res.status(400).json({ ok: false, error: "id_finca, id_lote, kg_estimados y valor_estimado son obligatorios" })
    }
    if (!Array.isArray(repartos) || repartos.length === 0) {
      return res.status(400).json({ ok: false, error: "Agrega al menos un reparto por presentación" })
    }

    const tipo = tipo_cafe === 'cereza' ? 'cereza' : 'pergamino'
    const pctQuedaCereza = 100 - (await obtenerParametro('merma_cereza_pergamino_pct', 22))
    const pctQuedaTueste = 100 - (await obtenerParametro('merma_pergamino_tostado_pct', 18))
    const kgNetosEstimados = tipo === 'cereza'
      ? Number(kg_estimados) * (pctQuedaCereza / 100) * (pctQuedaTueste / 100)
      : Number(kg_estimados) * (pctQuedaTueste / 100)

    await client.query("BEGIN")

    let kgReparto = 0
    for (const r of repartos) {
      if (!r.id_presentacion || !r.cantidad || Number(r.cantidad) <= 0) {
        await client.query("ROLLBACK")
        return res.status(400).json({ ok: false, error: "Cada reparto necesita id_presentacion y una cantidad válida" })
      }
      const pres = await client.query(
        `SELECT kg_equivalente FROM presentaciones_catalogo WHERE id_presentacion = $1 AND activo = true`,
        [r.id_presentacion]
      )
      if (pres.rows.length === 0) {
        await client.query("ROLLBACK")
        return res.status(404).json({ ok: false, error: `Presentación ${r.id_presentacion} no existe o está inactiva` })
      }
      kgReparto += Number(r.cantidad) * Number(pres.rows[0].kg_equivalente)
    }

    if (kgReparto > kgNetosEstimados + 0.001) {
      await client.query("ROLLBACK")
      return res.status(400).json({
        ok: false,
        error: `El reparto planeado usa ${kgReparto.toFixed(2)} kg netos, pero con la merma solo vas a tener ${kgNetosEstimados.toFixed(2)} kg netos de esos ${kg_estimados} kg estimados`
      })
    }

    const cosecha = await client.query(
      `INSERT INTO cosechas_planeadas (id_finca, id_lote, kg_estimados, tipo_cafe, valor_estimado, planeado_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_cosecha`,
      [id_finca, id_lote, Number(kg_estimados), tipo, Number(valor_estimado), req.usuario.id]
    )

    for (const r of repartos) {
      await client.query(
        `INSERT INTO cosecha_detalle (id_cosecha, id_presentacion, cantidad) VALUES ($1, $2, $3)`,
        [cosecha.rows[0].id_cosecha, r.id_presentacion, Number(r.cantidad)]
      )
    }

    await client.query("COMMIT")
    res.json({ ok: true, id_cosecha: cosecha.rows[0].id_cosecha })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  } finally {
    client.release()
  }
}

// GET /inventario/cosechas?estado=planeada
const listarCosechas = async (req, res) => {
  try {
    const { estado } = req.query
    const cosechas = await pool.query(
      `SELECT c.id_cosecha, c.kg_estimados, c.tipo_cafe, c.valor_estimado, c.estado,
              c.fecha_planeada, c.fecha_confirmada,
              f.id AS id_finca, f.nombre AS finca_nombre,
              l.id_lote, l.codigo_lote,
              up.nombre AS planeado_por_nombre, uc.nombre AS confirmado_por_nombre
       FROM cosechas_planeadas c
       JOIN fincas f ON f.id = c.id_finca
       JOIN lotes l ON l.id_lote = c.id_lote
       LEFT JOIN usuarios up ON up.id_usuario = c.planeado_por
       LEFT JOIN usuarios uc ON uc.id_usuario = c.confirmado_por
       WHERE ($1::text IS NULL OR c.estado = $1)
       ORDER BY c.fecha_planeada DESC`,
      [estado || null]
    )

    const detalle = await pool.query(
      `SELECT cd.id_cosecha, cd.cantidad, pc.nombre AS presentacion_nombre
       FROM cosecha_detalle cd
       JOIN presentaciones_catalogo pc ON pc.id_presentacion = cd.id_presentacion`
    )

    const cosechasConDetalle = cosechas.rows.map((c) => ({
      ...c,
      repartos: detalle.rows.filter((d) => d.id_cosecha === c.id_cosecha)
    }))

    res.json({ ok: true, cosechas: cosechasConDetalle })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/cosechas/:id/cancelar
const cancelarCosecha = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `UPDATE cosechas_planeadas SET estado = 'cancelada' WHERE id_cosecha = $1 AND estado = 'planeada' RETURNING id_cosecha`,
      [id]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Cosecha no encontrada o ya no está planeada" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// PATCH /inventario/cosechas/:id/confirmar
// Aquí es donde el café "ya llegó de verdad". Dispara todo internamente:
// registra la entrega real, suma el kg neto al lote, y procesa el reparto
// que ya se había planeado (crea/suma productos). Todo en una transacción.
const confirmarCosecha = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id } = req.params

    await client.query("BEGIN")

    const cosechaRes = await client.query(
      `SELECT * FROM cosechas_planeadas WHERE id_cosecha = $1 AND estado = 'planeada' FOR UPDATE`,
      [id]
    )
    if (cosechaRes.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, error: "Cosecha no encontrada o ya fue procesada" })
    }
    const cosecha = cosechaRes.rows[0]

    const detalleRes = await client.query(
      `SELECT cd.id_presentacion, cd.cantidad, pc.nombre AS presentacion_nombre, pc.kg_equivalente
       FROM cosecha_detalle cd
       JOIN presentaciones_catalogo pc ON pc.id_presentacion = cd.id_presentacion
       WHERE cd.id_cosecha = $1`,
      [id]
    )

    const pctQuedaCereza = 100 - (await obtenerParametro('merma_cereza_pergamino_pct', 22))
    const pctQuedaTueste = 100 - (await obtenerParametro('merma_pergamino_tostado_pct', 18))
    const kgNetos = cosecha.tipo_cafe === 'cereza'
      ? Number(cosecha.kg_estimados) * (pctQuedaCereza / 100) * (pctQuedaTueste / 100)
      : Number(cosecha.kg_estimados) * (pctQuedaTueste / 100)

    // 1. Registrar la entrega real (bloquea el lote con FOR UPDATE para
    //    que dos empleados no puedan confirmar/procesar el mismo lote
    //    a la vez y desalinear el kg disponible)
    const lote = await client.query(`SELECT id_lote FROM lotes WHERE id_lote = $1 FOR UPDATE`, [cosecha.id_lote])
    if (lote.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, error: "El lote de esta cosecha ya no existe" })
    }

    const entrega = await client.query(
      `INSERT INTO entregas_finca (id_finca, id_lote, cantidad_kg, kg_netos, valor, tipo_cafe, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_entrega`,
      [cosecha.id_finca, cosecha.id_lote, cosecha.kg_estimados, kgNetos, cosecha.valor_estimado, cosecha.tipo_cafe, req.usuario.id]
    )

    await client.query(
      `UPDATE lotes SET cantidad_kg = cantidad_kg + $1,
       estado = CASE WHEN estado = 'agotado' THEN 'disponible' ELSE estado END
       WHERE id_lote = $2`,
      [kgNetos, cosecha.id_lote]
    )

    // 2. Procesar el reparto que ya se había planeado (mismo criterio que
    //    Procesar Lote: sumar si el producto existe, crearlo si no)
    const costoRes = await client.query(
      `SELECT SUM(valor) / NULLIF(SUM(kg_netos), 0) AS costo_kg
       FROM entregas_finca WHERE id_lote = $1 AND estado = 'registrada'`,
      [cosecha.id_lote]
    )
    const costoKg = costoRes.rows[0].costo_kg !== null ? Number(costoRes.rows[0].costo_kg) : null
    const margenMayorista = await obtenerParametro('margen_venta_mayorista_pct', 20)
    const margenMinimo = await obtenerParametro('margen_minimo_mayorista_publico_pct', 30)

    const loteInfo = await client.query(`SELECT codigo_lote, finca, variedad FROM lotes WHERE id_lote = $1`, [cosecha.id_lote])
    const { codigo_lote, finca: fincaNombre, variedad } = loteInfo.rows[0]

    const procesamiento = await client.query(
      `INSERT INTO procesamientos_lote (id_lote, kg_utilizados, procesado_por) VALUES ($1, $2, $3) RETURNING id_procesamiento`,
      [cosecha.id_lote, kgNetos, req.usuario.id]
    )

    for (const d of detalleRes.rows) {
      let producto = await client.query(
        `SELECT id_producto FROM productos WHERE id_lote = $1 AND id_presentacion = $2 AND estado = 'activo'`,
        [cosecha.id_lote, d.id_presentacion]
      )

      let idProducto
      if (producto.rows.length > 0) {
        idProducto = producto.rows[0].id_producto
        await client.query(`UPDATE productos SET stock = stock + $1 WHERE id_producto = $2`, [d.cantidad, idProducto])
      } else {
        const costoUnitario = costoKg !== null ? costoKg * Number(d.kg_equivalente) : 0
        const precioMayorista = costoUnitario * (1 + margenMayorista / 100)
        const precioPublico = precioMayorista * (1 + margenMinimo / 100)
        const nombre = `${variedad || codigo_lote} · ${d.presentacion_nombre} · ${fincaNombre}`

        const nuevo = await client.query(
          `INSERT INTO productos (
             id_lote, nombre, tipo_cafe, presentacion, id_presentacion, precio, precio_mayorista,
             costo_unitario, stock, estado, categoria_producto, creado_por, fecha_creacion
           ) VALUES ($1, $2, 'pergamino', $3, $4, $5, $6, $7, $8, 'activo', 'cafe', $9, NOW())
           RETURNING id_producto`,
          [cosecha.id_lote, nombre, d.presentacion_nombre, d.id_presentacion,
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

    // El kg ya se convirtió en producto, deja de estar "disponible" del lote
    await client.query(`UPDATE lotes SET cantidad_kg = cantidad_kg - $1 WHERE id_lote = $2`, [kgNetos, cosecha.id_lote])

    await client.query(
      `UPDATE cosechas_planeadas SET estado = 'confirmada', confirmado_por = $1, fecha_confirmada = NOW(), id_entrega = $2
       WHERE id_cosecha = $3`,
      [req.usuario.id, entrega.rows[0].id_entrega, id]
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

export { crearCosecha, listarCosechas, cancelarCosecha, confirmarCosecha }
