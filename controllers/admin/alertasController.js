import pool from "../../config/db.js"
import { getContadorHoy } from "../../utils/resueltasHoy.js"

const UMBRAL_STOCK_BAJO = 50; // % — debe coincidir con inventarioController.js

function calcularEstado(esMaquina, stock, kgStock, capacidad) {
  const referencia = esMaquina ? stock : kgStock;
  if (referencia <= 0) return 'Agotado';
  if (capacidad > 0 && (kgStock / capacidad) * 100 <= UMBRAL_STOCK_BAJO) return 'Stock bajo';
  return 'Disponible';
}

async function obtenerAlertasCalculadas() {
  const result = await pool.query(`
    SELECT pr.id_producto, pr.nombre, pr.imagen_url, pr.categoria_producto,
           pc.kg_equivalente,
           l.finca, l.variedad, l.cantidad_kg AS capacidad, pr.stock
    FROM productos pr
    LEFT JOIN presentaciones_catalogo pc ON pc.id_presentacion = pr.id_presentacion
    LEFT JOIN lotes l ON l.id_lote = pr.id_lote
  `);

  return result.rows
    .map(p => {
      const esMaquina = p.categoria_producto === 'maquina';
      const capacidad = Number(p.capacidad) || 0;
      const kgEquivalente = Number(p.kg_equivalente) || 0;
      const stock = Number(p.stock);
      // El % y el estado se calculan en kg equivalentes (bolsas × kg_equivalente),
      // igual que en inventarioController; la capacidad del lote está en kg.
      const kgStock = esMaquina ? stock : stock * kgEquivalente;
      let pct;
      if (capacidad > 0) {
        pct = Math.min(Math.round((kgStock / capacidad) * 100), 100);
      } else {
        pct = kgStock > 0 ? 100 : 0;
      }
      const estado = calcularEstado(esMaquina, stock, kgStock, capacidad);
      return {
        id: p.id_producto,
        nombre: p.nombre,
        origen: [p.finca, p.variedad].filter(Boolean).join(' · '),
        imagen: p.imagen_url,
        categoriaProducto: p.categoria_producto || 'cafe',
        stock,
        capacidad,
        kg_equivalente: kgEquivalente,
        pct,
        estado: estado
      };
    })
    .filter(p => p.estado !== 'Disponible')
    .sort((a, b) => {
      const prioridad = (e) => (e === 'Agotado' ? 0 : 1);
      if (prioridad(a.estado) !== prioridad(b.estado)) return prioridad(a.estado) - prioridad(b.estado);
      return a.pct - b.pct;
    });
}

const getResumen = async (req, res) => {
  try {
    const alertas = await obtenerAlertasCalculadas();
    const agotados = alertas.filter(a => a.estado === 'Agotado').length;
    const stockBajo = alertas.filter(a => a.estado === 'Stock bajo').length;

    res.json({
      ok: true,
      alertasActivas: agotados + stockBajo, // total de alertas visibles en la lista de abajo
      agotados,
      resueltasHoy: getContadorHoy(),
      umbralGlobal: UMBRAL_STOCK_BAJO
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

const getAlertas = async (req, res) => {
  try {
    const alertas = await obtenerAlertasCalculadas();
    res.json({ ok: true, alertas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

export { getResumen, getAlertas };