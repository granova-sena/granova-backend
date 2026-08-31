import bcrypt from "bcrypt"
import pool from "../../config/db.js"

function generarPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let pass = ""
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

function slug(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

async function generarEmailUnico(nombre, apellido) {
  const base = `${slug(nombre)}.${slug(apellido)}`
  let intento = base
  let sufijo = 0
  while (true) {
    const email = `${intento}@granova.com.co`
    const existe = await pool.query(
      `SELECT 1 FROM usuarios WHERE email = $1 UNION SELECT 1 FROM clientes WHERE email = $1`,
      [email]
    )
    if (existe.rows.length === 0) return email
    sufijo++
    intento = `${base}${sufijo}`
  }
}

const listarEmpleados = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.estado, u.fecha_creacion,
              COUNT(r.id_reporte)::int AS reportes
       FROM usuarios u
       LEFT JOIN reportes_empleado r ON r.id_empleado = u.id_usuario
       WHERE u.rol = 'empleado' AND u.estado != 'eliminado'
       GROUP BY u.id_usuario
       ORDER BY u.fecha_creacion DESC`
    )
    res.json({ ok: true, empleados: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const obtenerEmpleado = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT id_usuario, nombre, apellido, email, estado, fecha_creacion, fecha_actualizacion
       FROM usuarios WHERE id_usuario = $1 AND rol = 'empleado' AND estado != 'eliminado'`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }

    const reportes = await pool.query(
      `SELECT r.id_reporte, r.motivo, r.fecha, u.nombre AS creado_por_nombre,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id_respuesta', rr.id_respuesta,
                  'respuesta', rr.respuesta,
                  'fecha', rr.fecha,
                  'id_empleado', rr.id_empleado
                ) ORDER BY rr.fecha ASC)
                FROM reporte_respuestas rr WHERE rr.id_reporte = r.id_reporte
              ), '[]'::json) AS respuestas
       FROM reportes_empleado r
       LEFT JOIN usuarios u ON u.id_usuario = r.creado_por
       WHERE r.id_empleado = $1
       ORDER BY r.fecha DESC`,
      [id]
    )

    // Historial real: productos que creó + entregas que registró o marcó
    // pagadas + lotes que procesó en presentaciones
    const historial = await pool.query(
      `SELECT 'producto' AS tipo, p.nombre AS detalle, p.fecha_creacion AS fecha
       FROM productos p WHERE p.creado_por = $1
       UNION ALL
       SELECT 'entrega' AS tipo,
              f.nombre || ' · ' || e.cantidad_kg || ' kg · lote ' || l.codigo_lote AS detalle,
              e.fecha::timestamp AS fecha
       FROM entregas_finca e
       JOIN fincas f ON f.id = e.id_finca
       JOIN lotes l ON l.id_lote = e.id_lote
       WHERE e.registrado_por = $1 AND e.estado = 'registrada'
       UNION ALL
       SELECT 'pago' AS tipo,
              'Marcó pagada la entrega de ' || f.nombre || ' (' || e.cantidad_kg || ' kg)' AS detalle,
              e.fecha_pago AS fecha
       FROM entregas_finca e
       JOIN fincas f ON f.id = e.id_finca
       WHERE e.pagado_por = $1 AND e.estado = 'registrada'
       UNION ALL
       SELECT 'proceso' AS tipo,
              'Procesó ' || pl.kg_utilizados || ' kg del lote ' || l.codigo_lote AS detalle,
              pl.fecha AS fecha
       FROM procesamientos_lote pl
       JOIN lotes l ON l.id_lote = pl.id_lote
       WHERE pl.procesado_por = $1
       ORDER BY fecha DESC
       LIMIT 30`,
      [id]
    )

    // Totales reales (sin el LIMIT de la vista) para que el resumen sea exacto
    const totales = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM productos p WHERE p.creado_por = $1)::int AS productos,
        (SELECT COUNT(*) FROM entregas_finca e WHERE e.registrado_por = $1 AND e.estado = 'registrada')::int AS entregas,
        (SELECT COUNT(*) FROM entregas_finca e WHERE e.pagado_por = $1 AND e.estado = 'registrada')::int AS pagos,
        (SELECT COUNT(*) FROM procesamientos_lote pl WHERE pl.procesado_por = $1)::int AS procesos`,
      [id]
    )

    const resumenHistorial = {
      productosAgregados: totales.rows[0].productos,
      entregasRegistradas: totales.rows[0].entregas,
      pagosMarcados: totales.rows[0].pagos,
      lotesProcesados: totales.rows[0].procesos,
    }

    res.json({ ok: true, empleado: result.rows[0], reportes: reportes.rows, historial: historial.rows, resumenHistorial })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const crearEmpleado = async (req, res) => {
  try {
    const { nombre, apellido } = req.body
    if (!nombre || !apellido) {
      return res.status(400).json({ ok: false, error: "Nombre y apellido son obligatorios" })
    }

    const email = await generarEmailUnico(nombre, apellido)
    const passwordGenerada = generarPassword()
    const hash = await bcrypt.hash(passwordGenerada, 10)

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, email, contraseña, rol, estado, fecha_creacion)
       VALUES ($1, $2, $3, $4, 'empleado', 'activo', NOW())
       RETURNING id_usuario`,
      [nombre.trim(), apellido.trim(), email, hash]
    )

    res.json({
      ok: true,
      id: result.rows[0].id_usuario,
      email,
      password: passwordGenerada
    })
  } catch (error) {
    console.error(error)
    if (error.code === "23514") {
      return res.status(400).json({ ok: false, error: "No se pudo crear el empleado: un valor no cumple las reglas de la base de datos" })
    }
    res.status(500).json({ ok: false, error: error.message })
  }
}

const actualizarEmpleado = async (req, res) => {
  try {
    const { id } = req.params
    const { nombre, apellido, estado } = req.body

    if (estado !== undefined && !["activo", "inactivo", "bloqueado"].includes(estado)) {
      return res.status(400).json({ ok: false, error: "Estado inválido" })
    }

    const result = await pool.query(
      `UPDATE usuarios
       SET nombre = COALESCE($1, nombre),
           apellido = COALESCE($2, apellido),
           estado = COALESCE($3, estado),
           fecha_actualizacion = NOW()
       WHERE id_usuario = $4 AND rol = 'empleado'
       RETURNING id_usuario`,
      [nombre || null, apellido || null, estado || null, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const resetearPasswordEmpleado = async (req, res) => {
  try {
    const { id } = req.params
    const nuevaPassword = generarPassword()
    const hash = await bcrypt.hash(nuevaPassword, 10)

    const result = await pool.query(
      `UPDATE usuarios SET contraseña = $1, fecha_actualizacion = NOW()
       WHERE id_usuario = $2 AND rol = 'empleado' RETURNING id_usuario`,
      [hash, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }
    res.json({ ok: true, password: nuevaPassword })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const crearReporte = async (req, res) => {
  try {
    const { id } = req.params
    const { motivo } = req.body
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ ok: false, error: "El motivo es obligatorio" })
    }

    const empleado = await pool.query(
      `SELECT id_usuario FROM usuarios WHERE id_usuario = $1 AND rol = 'empleado'`,
      [id]
    )
    if (empleado.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }

    await pool.query(
      `INSERT INTO reportes_empleado (id_empleado, motivo, creado_por) VALUES ($1, $2, $3)`,
      [id, motivo.trim(), req.usuario.id]
    )

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reportes_empleado WHERE id_empleado = $1`,
      [id]
    )

    res.json({ ok: true, totalReportes: total.rows[0].total })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const eliminarReporte = async (req, res) => {
  try {
    const { id, idReporte } = req.params
    const result = await pool.query(
      `DELETE FROM reportes_empleado WHERE id_reporte = $1 AND id_empleado = $2 RETURNING id_reporte`,
      [idReporte, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Reporte no encontrado" })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const eliminarTodosLosReportes = async (req, res) => {
  try {
    const { id } = req.params
    await pool.query(`DELETE FROM reportes_empleado WHERE id_empleado = $1`, [id])
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const bloquearEmpleado = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `UPDATE usuarios SET estado = 'bloqueado', fecha_actualizacion = NOW()
       WHERE id_usuario = $1 AND rol = 'empleado' RETURNING id_usuario`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const desbloquearEmpleado = async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `UPDATE usuarios SET estado = 'activo', fecha_actualizacion = NOW()
       WHERE id_usuario = $1 AND rol = 'empleado' RETURNING id_usuario`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// Empleados con 3+ reportes activos, para la alerta del admin al entrar al panel
const alertasEmpleados = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id_usuario, u.nombre, u.apellido, COUNT(r.id_reporte)::int AS reportes,
              MAX(r.motivo) FILTER (WHERE r.fecha = (
                SELECT MAX(r2.fecha) FROM reportes_empleado r2 WHERE r2.id_empleado = u.id_usuario
              )) AS ultimo_motivo
       FROM usuarios u
       JOIN reportes_empleado r ON r.id_empleado = u.id_usuario
       WHERE u.rol = 'empleado' AND u.estado NOT IN ('bloqueado', 'eliminado')
       GROUP BY u.id_usuario
       HAVING COUNT(r.id_reporte) >= 3`
    )
    res.json({ ok: true, alertas: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const eliminarEmpleado = async (req, res) => {
  try {
    const { id } = req.params
    // Borrado visual: nunca se borra la fila real, solo se marca 'eliminado'
    // para no perder trazabilidad (reportes, ventas registradas, etc.)
    const result = await pool.query(
      `UPDATE usuarios SET estado = 'eliminado', fecha_actualizacion = NOW()
       WHERE id_usuario = $1 AND rol = 'empleado' RETURNING id_usuario`,
      [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Empleado no encontrado" })
    }
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// Reportes del propio empleado (los ve él mismo, no puede borrarlos)
const misReportes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id_reporte, r.motivo, r.fecha, u.nombre AS creado_por_nombre,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id_respuesta', rr.id_respuesta,
                  'respuesta', rr.respuesta,
                  'fecha', rr.fecha,
                  'id_empleado', rr.id_empleado
                ) ORDER BY rr.fecha ASC)
                FROM reporte_respuestas rr WHERE rr.id_reporte = r.id_reporte
              ), '[]'::json) AS respuestas
       FROM reportes_empleado r
       LEFT JOIN usuarios u ON u.id_usuario = r.creado_por
       WHERE r.id_empleado = $1
       ORDER BY r.fecha DESC`,
      [req.usuario.id]
    )
    res.json({ ok: true, reportes: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

// El empleado responde a un reporte suyo con una explicación
const responderReporte = async (req, res) => {
  try {
    const { idReporte } = req.params
    const { respuesta } = req.body
    if (!respuesta || !respuesta.trim()) {
      return res.status(400).json({ ok: false, error: "La respuesta es obligatoria" })
    }

    // Verificar que el reporte pertenece al empleado conectado
    const reporte = await pool.query(
      `SELECT id_reporte FROM reportes_empleado WHERE id_reporte = $1 AND id_empleado = $2`,
      [idReporte, req.usuario.id]
    )
    if (reporte.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Reporte no encontrado" })
    }

    const result = await pool.query(
      `INSERT INTO reporte_respuestas (id_reporte, id_empleado, respuesta)
       VALUES ($1, $2, $3)
       RETURNING id_respuesta, respuesta, fecha`,
      [idReporte, req.usuario.id, respuesta.trim()]
    )
    res.json({ ok: true, respuesta: result.rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

export {
  listarEmpleados, obtenerEmpleado, crearEmpleado,
  actualizarEmpleado, resetearPasswordEmpleado, eliminarEmpleado,
  crearReporte, eliminarReporte, eliminarTodosLosReportes, responderReporte,
  bloquearEmpleado, desbloquearEmpleado, alertasEmpleados, misReportes
}
