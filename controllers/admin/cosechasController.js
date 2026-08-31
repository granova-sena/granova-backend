import pool from "../../config/db.js"
import { obtenerParametro } from "./parametrosController.js"
import { sumarStockFormato } from "./stockHelper.js"

// Valores que sí acepta productos_tipo_cafe_check para productos de venta al
// cliente. 'pergamino'/'cereza' son solo estados de PROCESAMIENTO del café
// (tabla cosechas_planeadas / entregas_finca), nunca el tipo del producto
// final que se muestra en el catálogo.
const TIPOS_CAFE_PRODUCTO_VALIDOS = ['molido', 'grano']
const TIPO_CAFE_PRODUCTO_DEFECTO = 'molido'

// POST /inventario/cosechas
// body: { id_finca, id_lote, kg_estimados, tipo_cafe, valor_estimado, repartos: [{id_presentacion, cantidad}], marcar_en_proceso? }
// Cuando viene desde "Procesar lote" (marcar_en_proceso = true), el café YA está
// pesado en el lote: se mueve a "kg en proceso" y la cosecha queda planeada para
// confirmarse después (ahí sí se suma a los productos del catálogo).
const crearCosecha = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id_finca, id_lote, kg_estimados, tipo_cafe, valor_estimado, repartos } = req.body
    const marcarEnProceso = req.body.marcar_en_proceso === true
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

    if (marcarEnProceso) {
      // El café ya está en el lote: validar contra el disponible real
      // (cantidad - perdido - en proceso) para que la columna y la BD coincidan.
      const lote = await client.query(
        `SELECT cantidad_kg, kg_perdido, kg_en_proceso FROM lotes WHERE id_lote = $1 FOR UPDATE`,
        [id_lote]
      )
      if (lote.rows.length === 0) {
        await client.query("ROLLBACK")
        return res.status(404).json({ ok: false, error: "El lote no existe" })
      }
      const disponible = Number(lote.rows[0].cantidad_kg) - Number(lote.rows[0].kg_perdido) - Number(lote.rows[0].kg_en_proceso)
      if (kgReparto > disponible + 0.001) {
        await client.query("ROLLBACK")
        return res.status(400).json({
          ok: false,
          error: `El reparto usa ${kgReparto.toFixed(2)} kg pero el lote solo tiene ${disponible.toFixed(2)} kg disponibles`
        })
      }
    } else if (kgReparto > kgNetosEstimados + 0.001) {
      await client.query("ROLLBACK")
      return res.status(400).json({
        ok: false,
        error: `El reparto planeado usa ${kgReparto.toFixed(2)} kg netos, pero con la merma solo vas a tener ${kgNetosEstimados.toFixed(2)} kg netos de esos ${kg_estimados} kg estimados`
      })
    }

    const origen = marcarEnProceso ? 'proceso-lote' : 'cosecha'
    const cosecha = await client.query(
      `INSERT INTO cosechas_planeadas (id_finca, id_lote, kg_estimados, tipo_cafe, valor_estimado, planeado_por, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_cosecha`,
      [id_finca, id_lote, Number(kg_estimados), tipo, Number(valor_estimado), req.usuario.id, origen]
    )

    for (const r of repartos) {
      await client.query(
        `INSERT INTO cosecha_detalle (id_cosecha, id_presentacion, cantidad) VALUES ($1, $2, $3)`,
        [cosecha.rows[0].id_cosecha, r.id_presentacion, Number(r.cantidad)]
      )
    }

    // El café pesado del lote pasa a "en proceso" hasta que se confirme la cosecha
    if (marcarEnProceso) {
      await client.query(
        `UPDATE lotes SET kg_en_proceso = kg_en_proceso + $1 WHERE id_lote = $2`,
        [kgReparto, id_lote]
      )
    }

    await client.query("COMMIT")
    res.json({ ok: true, id_cosecha: cosecha.rows[0].id_cosecha, marcar_en_proceso: marcarEnProceso })
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
              c.origen, c.fecha_planeada, c.fecha_confirmada,
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
// Al cancelar una planeada que vino de "Procesar lote" (origen 'proceso-lote'),
// el kg que quedó retenido en "en proceso" vuelve a estar disponible: nada de
// ese café se materializó todavía, así que el lote recupera su capacidad.
const cancelarCosecha = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id } = req.params
    await client.query("BEGIN")
    const result = await client.query(
      `UPDATE cosechas_planeadas SET estado = 'cancelada'
       WHERE id_cosecha = $1 AND estado = 'planeada'
       RETURNING id_cosecha, id_lote, origen`,
      [id]
    )
    if (result.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, error: "Cosecha no encontrada o ya no está planeada" })
    }
    const cancelada = result.rows[0]

    if (cancelada.origen === 'proceso-lote' && cancelada.id_lote) {
      const detalle = await client.query(
        `SELECT cd.cantidad, pc.kg_equivalente
         FROM cosecha_detalle cd
         JOIN presentaciones_catalogo pc ON pc.id_presentacion = cd.id_presentacion
         WHERE cd.id_cosecha = $1`,
        [id]
      )
      const kgPlaneado = detalle.rows.reduce(
        (suma, d) => suma + Number(d.cantidad) * Number(d.kg_equivalente || 0),
        0
      )
      if (kgPlaneado > 0) {
        await client.query(
          `UPDATE lotes SET kg_en_proceso = GREATEST(kg_en_proceso - $1, 0) WHERE id_lote = $2`,
          [kgPlaneado, cancelada.id_lote]
        )
      }
    }

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

// PATCH /inventario/cosechas/:id/confirmar
// body opcional: { tipo_cafe_producto: 'molido' | 'grano' }  (default: 'molido')
// Aquí es donde el café "ya llegó de verdad". Dispara todo internamente:
// registra la entrega real, suma el kg neto al lote, y procesa el reparto
// que ya se había planeado (crea/suma productos). Todo en una transacción.
//
// IMPORTANTE: cosecha.tipo_cafe ('cereza'/'pergamino') es el estado de
// PROCESAMIENTO, no el tipo de producto de venta. El producto que se crea en
// el catálogo debe usar 'molido' o 'grano' (los únicos valores que acepta
// productos_tipo_cafe_check) — antes se mandaba 'pergamino' fijo, lo cual
// violaba el constraint y tumbaba el endpoint con 500.
const confirmarCosecha = async (req, res) => {
  const client = await pool.connect()
  try {
    const { id } = req.params

    const tipoCafeProductoBody = req.body?.tipo_cafe_producto
    if (tipoCafeProductoBody !== undefined && !TIPOS_CAFE_PRODUCTO_VALIDOS.includes(tipoCafeProductoBody)) {
      return res.status(400).json({ ok: false, error: "tipo_cafe_producto debe ser 'molido' o 'grano'" })
    }
    const tipoCafeProducto = tipoCafeProductoBody || TIPO_CAFE_PRODUCTO_DEFECTO

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

    // 'proceso-lote' = el café ya estaba pesado en el lote (Control de
    // Inventario -> Procesar lote). Al confirmar NO se registra entrega nueva
    // ni se suma kg: el kg real que se convierte en producto se DESCUENTA de
    // la capacidad del lote. El kg real consumido es la suma exacta del
    // reparto (cantidad × kg_equivalente), el mismo que quedó "en proceso".
    const esProcesoLote = cosecha.origen === 'proceso-lote'
    const kgConsumido = detalleRes.rows.reduce(
      (suma, d) => suma + Number(d.cantidad) * Number(d.kg_equivalente || 0),
      0
    )

    const pctQuedaCereza = 100 - (await obtenerParametro('merma_cereza_pergamino_pct', 22))
    const pctQuedaTueste = 100 - (await obtenerParametro('merma_pergamino_tostado_pct', 18))
    const kgNetos = cosecha.tipo_cafe === 'cereza'
      ? Number(cosecha.kg_estimados) * (pctQuedaCereza / 100) * (pctQuedaTueste / 100)
      : Number(cosecha.kg_estimados) * (pctQuedaTueste / 100)

    // 1. Registrar la entrega real (bloquea el lote con FOR UPDATE para
    //    que dos empleados no puedan confirmar/procesar el mismo lote
    //    a la vez y desalinear el kg disponible).
    //    SOLO aplica al café que de verdad llega ('cosecha'); el café que
    //    viene de "Procesar lote" ya estaba contabilizado en el lote.
    const lote = await client.query(`SELECT id_lote FROM lotes WHERE id_lote = $1 FOR UPDATE`, [cosecha.id_lote])
    if (lote.rows.length === 0) {
      await client.query("ROLLBACK")
      return res.status(404).json({ ok: false, error: "El lote de esta cosecha ya no existe" })
    }

    let idEntrega = null
    if (!esProcesoLote) {
      const entrega = await client.query(
        `INSERT INTO entregas_finca (id_finca, id_lote, cantidad_kg, kg_netos, valor, tipo_cafe, registrado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id_entrega`,
        [cosecha.id_finca, cosecha.id_lote, cosecha.kg_estimados, kgNetos, cosecha.valor_estimado, cosecha.tipo_cafe, req.usuario.id]
      )
      idEntrega = entrega.rows[0].id_entrega

      await client.query(
        `UPDATE lotes SET cantidad_kg = cantidad_kg + $1,
         estado = CASE WHEN estado = 'agotado' THEN 'disponible' ELSE estado END
         WHERE id_lote = $2`,
        [kgNetos, cosecha.id_lote]
      )
    }

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

    // kg que se registran como "procesados" en el historial: para 'proceso-lote'
    // es el kg neto exacto del reparto (ya está descontado el café crudo), NO
    // volver a aplicar la merma sobre un kg_estimados que ya es neto.
    const kgProcesado = esProcesoLote ? kgConsumido : kgNetos
    const procesamiento = await client.query(
      `INSERT INTO procesamientos_lote (id_lote, kg_utilizados, procesado_por) VALUES ($1, $2, $3) RETURNING id_procesamiento`,
      [cosecha.id_lote, kgProcesado, req.usuario.id]
    )

    for (const d of detalleRes.rows) {
      let producto = await client.query(
        `SELECT id_producto FROM productos WHERE id_lote = $1 AND id_presentacion = $2 AND estado = 'activo'`,
        [cosecha.id_lote, d.id_presentacion]
      )

      let idProducto
      let precioPublicoCalculado
      if (producto.rows.length > 0) {
        idProducto = producto.rows[0].id_producto
        // Stock en UNIDADES (bolsas) + actualización del formato en el catálogo
        await client.query(`UPDATE productos SET stock = stock + $1 WHERE id_producto = $2`, [Number(d.cantidad), idProducto])
        const pRes = await client.query(`SELECT precio FROM productos WHERE id_producto = $1`, [idProducto])
        precioPublicoCalculado = Number(pRes.rows[0].precio)
      } else {
        const costoUnitario = costoKg !== null ? costoKg * Number(d.kg_equivalente) : 0
        const precioMayorista = costoUnitario * (1 + margenMayorista / 100)
        const precioPublico = precioMayorista * (1 + margenMinimo / 100)
        precioPublicoCalculado = Math.round(precioPublico)
        const nombre = `${variedad || codigo_lote} · ${d.presentacion_nombre} · ${fincaNombre}`

        const nuevo = await client.query(
          `INSERT INTO productos (
             id_lote, nombre, tipo_cafe, presentacion, id_presentacion, precio, precio_mayorista,
             costo_unitario, stock, estado, categoria_producto, creado_por, fecha_creacion
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'activo', 'cafe', $10, NOW())
           RETURNING id_producto`,
          [cosecha.id_lote, nombre, tipoCafeProducto, d.presentacion_nombre, d.id_presentacion,
           Math.round(precioPublico), Math.round(precioMayorista), Math.round(costoUnitario),
           Number(d.cantidad), req.usuario.id]
        )
        idProducto = nuevo.rows[0].id_producto
      }

      // Conectar con el catálogo: el formato (bolsa) del producto suma las
      // unidades repartidas, creándolo si todavía no existe.
      await sumarStockFormato(client, {
        idProducto,
        presentacion: { id_presentacion: d.id_presentacion, nombre: d.presentacion_nombre, kg_equivalente: d.kg_equivalente },
        cantidad: Number(d.cantidad),
        precioPublico: precioPublicoCalculado,
      })

      await client.query(
        `INSERT INTO procesamiento_detalle (id_procesamiento, id_producto, cantidad_agregada) VALUES ($1, $2, $3)`,
        [procesamiento.rows[0].id_procesamiento, idProducto, d.cantidad]
      )
    }

    // El kg ya se convirtió en producto y deja de ser café "crudo" del lote.
    // Si venía de "Procesar lote" ese kg YA estaba contabilizado en la
    // capacidad: se DESCUENTA cantidad_kg (y se libera de "en proceso").
    // Si venía de una cosecha planeada ('cosecha'), primero se sumó como
    // entrega y ahora se resta al convertirlo: neto 0 en el lote.
    const kgDescontar = esProcesoLote ? kgConsumido : kgNetos
    await client.query(
      `UPDATE lotes SET
         cantidad_kg = GREATEST(cantidad_kg - $1, 0),
         kg_en_proceso = GREATEST(kg_en_proceso - $1, 0)
       WHERE id_lote = $2`,
      [kgDescontar, cosecha.id_lote]
    )

    await client.query(
      `UPDATE cosechas_planeadas SET estado = 'confirmada', confirmado_por = $1, fecha_confirmada = NOW(), id_entrega = $2
       WHERE id_cosecha = $3`,
      [req.usuario.id, idEntrega, id]
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