import pool from "../../config/db.js"

const listarParametros = async (req, res) => {
  try {
    const result = await pool.query(`SELECT clave, valor, descripcion FROM parametros_cafe ORDER BY clave`)
    res.json({ ok: true, parametros: result.rows })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

const actualizarParametro = async (req, res) => {
  try {
    const { clave } = req.params
    const { valor } = req.body
    if (valor === undefined || Number.isNaN(Number(valor))) {
      return res.status(400).json({ ok: false, error: "Valor inválido" })
    }
    const result = await pool.query(
      `UPDATE parametros_cafe SET valor = $1 WHERE clave = $2 RETURNING clave`,
      [Number(valor), clave]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: "Parámetro no encontrado" })
    res.json({ ok: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ ok: false, error: error.message })
  }
}

export async function obtenerParametro(clave, valorPorDefecto = 0) {
  const result = await pool.query(`SELECT valor FROM parametros_cafe WHERE clave = $1`, [clave])
  return result.rows.length > 0 ? Number(result.rows[0].valor) : valorPorDefecto
}

export { listarParametros, actualizarParametro }
