import pool from "../../config/db.js"

const listarParametros = async (req, res) => {
  try {
    const result = await pool.query(`SELECT clave, valor, descripcion FROM parametros_cafe ORDER BY clave`)
    res.json({ ok: true, parametros: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: "Error al listar los parámetros" })
  }
}

const actualizarParametro = async (req, res) => {
  try {
    const { clave } = req.params
    const { valor } = req.body
    const numero = Number(valor)
    if (valor === undefined || !Number.isFinite(numero)) {
      return res.status(400).json({ ok: false, error: "Valor inválido" })
    }
    // Todos los parámetros de negocio son porcentajes (0-100).
    if (numero < 0 || numero > 100) {
      return res.status(400).json({ ok: false, error: "El valor debe estar entre 0 y 100" })
    }
    const result = await pool.query(
      `UPDATE parametros_cafe SET valor = $1 WHERE clave = $2 RETURNING clave`,
      [numero, clave]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Parámetro no encontrado" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: "Error interno al actualizar el parámetro" })
  }
}

export async function obtenerParametro(clave, valorPorDefecto = 0) {
  const result = await pool.query(`SELECT valor FROM parametros_cafe WHERE clave = $1`, [clave])
  return result.rows.length > 0 ? Number(result.rows[0].valor) : valorPorDefecto
}

// Los clientes necesitan algunos parámetros (p.ej. el % de descuento de
// empresa) sin iniciar sesión. Aquí solo se exponen los seguros, NUNCA
// mermas/márgenes internos.
const PARAMETROS_PUBLICOS = ['descuento_empresa_pct']

const listarParametrosPublicos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT clave, valor FROM parametros_cafe WHERE clave = ANY($1)`,
      [PARAMETROS_PUBLICOS]
    )
    res.json({ ok: true, parametros: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: "Error al listar los parámetros" })
  }
}

export { listarParametros, listarParametrosPublicos, actualizarParametro }
