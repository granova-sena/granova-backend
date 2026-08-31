import pool from "../../config/db.js"
import { registrarResuelta } from "../../utils/resueltasHoy.js"
import { obtenerParametro } from "./parametrosController.js"

const UMBRAL_STOCK_BAJO = 50; // % de la capacidad del lote

function calcularEstado(kgStock, capacidad) {
    if (kgStock <= 0) return 'Agotado';
    if (capacidad > 0 && (kgStock / capacidad) * 100 <= UMBRAL_STOCK_BAJO) return 'Stock bajo';
    return 'Disponible';
}

// El stock del café se guarda en UNIDADES (bolsas), pero la capacidad del lote
// es en kg. Para compararlos, cada producto se traduce a su kg equivalente
// (unidades × kg_equivalente de su presentación); así el % y el estado usan
// la misma unidad y no se mezclan bolsas con kg.
function kgEquivalenteStock(stock, kgEquivalente) {
    return Number(stock) * (Number(kgEquivalente) || 0);
}

// Quita tildes y pasa a minúsculas, para que buscar "cafe" encuentre "Café".
function normalizar(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Lista corta de palabras a bloquear en la descripción. No es exhaustiva,
// es un filtro básico para evitar groserías obvias.
const PALABRAS_PROHIBIDAS = [
    'mierda', 'puta', 'puto', 'gonorrea', 'malparido', 'malparida', 'hijueputa',
    'marica', 'pendejo', 'pendeja', 'imbecil', 'idiota', 'estupido', 'estupida', 'perra'
];

function contieneOfensivas(texto) {
    const limpio = normalizar(texto);
    return PALABRAS_PROHIBIDAS.some(palabra => limpio.includes(palabra));
}

// Distancia de edición simple, para tolerar errores de tipeo en encabezados de Excel.
function distancia(a, b) {
    a = normalizar(a); b = normalizar(b);
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
            else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

// Encabezados válidos por campo, para tolerar errores de tipeo ("nombe" -> "nombre").
const CAMPOS_EXCEL = {
    nombre: ['nombre', 'producto', 'nombre producto'],
    tipo_cafe: ['tipo_cafe', 'categoria', 'tipo de cafe', 'categoria producto'],
    presentacion: ['presentacion', 'presentación'],
    precio: ['precio', 'precio kg', 'precio/kg'],
    stock: ['stock', 'cantidad', 'stock kg'],
    codigo_lote: ['codigo_lote', 'lote', 'codigo lote'],
    imagen_url: ['imagen_url', 'imagen', 'foto'],
};

function valorPorCampo(fila, campo) {
    const clavesFila = Object.keys(fila);
    for (const clave of clavesFila) {
        const claveNorm = normalizar(clave);
        for (const candidato of CAMPOS_EXCEL[campo]) {
            if (claveNorm === normalizar(candidato) || distancia(claveNorm, normalizar(candidato)) <= 2) {
                return fila[clave];
            }
        }
    }
    return undefined;
}

async function obtenerProductosCalculados() {
    const result = await pool.query(`
    SELECT pr.id_producto, pr.nombre, pr.tipo_cafe, pr.precio, pr.costo_unitario, pr.stock, pr.imagen_url,
           pr.categoria_producto, pr.marca, pr.modelo, pr.garantia_meses,
           l.finca, l.variedad, l.cantidad_kg AS capacidad,
           pc.kg_equivalente
    FROM productos pr
    LEFT JOIN lotes l ON l.id_lote = pr.id_lote
    LEFT JOIN presentaciones_catalogo pc ON pc.id_presentacion = pr.id_presentacion
    ORDER BY pr.nombre
  `);

    return result.rows.map(p => {
        const capacidad = Number(p.capacidad) || 0;
        const stock = Number(p.stock);
        const esMaquina = p.categoria_producto === 'maquina';
        // En kg equivalentes: unidades × kg_equivalente (para café). El stock
        // de una máquina no es bolsas; ahí se usa el conteo directo.
        const kgStock = esMaquina ? stock : kgEquivalenteStock(stock, p.kg_equivalente);
        let pct;
        if (capacidad > 0) {
            pct = Math.min(Math.round((kgStock / capacidad) * 100), 100);
        } else {
            pct = stock > 0 ? 100 : 0;
        }
        return {
            id: p.id_producto,
            nombre: p.nombre,
            origen: esMaquina
                ? [p.marca, p.modelo].filter(Boolean).join(' · ')
                : [p.finca, p.variedad].filter(Boolean).join(' · '),
            categoria: esMaquina ? 'Máquina de café' : (p.tipo_cafe || 'Café'),
            categoriaProducto: p.categoria_producto || 'cafe',
            stock,
            capacidad,
            pct,
            precio: Number(p.precio),
            imagen: p.imagen_url,
            estado: calcularEstado(kgStock, capacidad)
        };
    });
}

const getResumen = async (req, res) => {
    try {
        const productos = await obtenerProductosCalculados();

        const nuevosMes = await pool.query(`
      SELECT COUNT(*) AS total FROM productos
      WHERE date_trunc('month', fecha_creacion) = date_trunc('month', CURRENT_DATE)
    `);

        const ventasHoy = await pool.query(`
      SELECT COALESCE(SUM(dp.subtotal), 0) AS total
      FROM detalle_pedidos dp
      JOIN pedidos p ON p.id_pedido = dp.id_pedido
      WHERE date_trunc('day', p.fecha_pedido) = CURRENT_DATE
    `);
        const ventasAyer = await pool.query(`
      SELECT COALESCE(SUM(dp.subtotal), 0) AS total
      FROM detalle_pedidos dp
      JOIN pedidos p ON p.id_pedido = dp.id_pedido
      WHERE date_trunc('day', p.fecha_pedido) = CURRENT_DATE - INTERVAL '1 day'
    `);

        const hoy = Number(ventasHoy.rows[0].total);
        const ayer = Number(ventasAyer.rows[0].total);
        let cambioVentas;
        if (ayer === 0) {
            cambioVentas = hoy > 0 ? 100 : 0;
        } else {
            cambioVentas = Math.round(((hoy - ayer) / ayer) * 100);
        }

        res.json({
            ok: true,
            totalProductos: productos.length,
            nuevosMes: Number(nuevosMes.rows[0].total),
            stockBajo: productos.filter(p => p.estado === 'Stock bajo').length,
            agotados: productos.filter(p => p.estado === 'Agotado').length,
            ventasHoy: hoy,
            cambioVentasHoy: cambioVentas
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

const getProductos = async (req, res) => {
    try {
        const { tab = 'Todos', search = '', page = 1, limit = 10 } = req.query;
        const todos = await obtenerProductosCalculados();

        const conteos = {
            Todos: todos.length,
            Disponibles: todos.filter(p => p.estado === 'Disponible').length,
            StockBajo: todos.filter(p => p.estado === 'Stock bajo').length
        };

        let filtrados = todos;
        if (tab === 'Disponibles') filtrados = filtrados.filter(p => p.estado === 'Disponible');
        if (tab === 'StockBajo') filtrados = filtrados.filter(p => p.estado === 'Stock bajo');

        if (search) {
            const q = normalizar(search);
            filtrados = filtrados.filter(p =>
                normalizar(p.nombre).includes(q) || normalizar(p.origen).includes(q) || normalizar(p.categoria).includes(q)
            );
        }

        const totalFiltrados = filtrados.length;
        const start = (Number(page) - 1) * Number(limit);
        const pagina = filtrados.slice(start, start + Number(limit));

        res.json({
            ok: true,
            productos: pagina,
            conteos,
            totalFiltrados,
            page: Number(page),
            totalPaginas: Math.max(Math.ceil(totalFiltrados / Number(limit)), 1)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

const getLotes = async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT id_lote, codigo_lote, finca, region, variedad, cantidad_kg, estado
      FROM lotes
      ORDER BY fecha_registro DESC
    `);
        res.json({ ok: true, lotes: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// Inventario agrupado por finca -> lote -> productos, para el panel de empleado
const getInventarioPorFinca = async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT f.id AS id_finca, f.nombre AS finca_nombre,
             l.id_lote, l.codigo_lote, l.cantidad_kg AS lote_kg, l.kg_perdido, l.kg_en_proceso,
             p.id_producto, p.nombre AS producto_nombre, p.precio, p.precio_mayorista, p.stock,
             p.id_presentacion, pc.nombre AS presentacion_nombre, pc.kg_equivalente
      FROM fincas f
      LEFT JOIN lotes l ON l.id_finca = f.id OR (l.id_finca IS NULL AND l.finca = f.nombre)
      LEFT JOIN productos p ON p.id_lote = l.id_lote AND p.estado = 'activo'
      LEFT JOIN presentaciones_catalogo pc ON pc.id_presentacion = p.id_presentacion
      ORDER BY f.nombre, l.codigo_lote, p.nombre
    `);

        const fincas = new Map();
        for (const row of result.rows) {
            if (!fincas.has(row.id_finca)) {
                fincas.set(row.id_finca, { id_finca: row.id_finca, nombre: row.finca_nombre, kgTotales: 0, lotes: new Map() });
            }
            const finca = fincas.get(row.id_finca);

            if (!row.id_lote) continue;

            if (!finca.lotes.has(row.id_lote)) {
                finca.lotes.set(row.id_lote, {
                    id_lote: row.id_lote,
                    codigo_lote: row.codigo_lote,
                    cantidad_kg: Number(row.lote_kg),
                    kg_perdido: Number(row.kg_perdido) || 0,
                    kg_en_proceso: Number(row.kg_en_proceso) || 0,
                    productos: [],
                });
                finca.kgTotales += Number(row.lote_kg) || 0;
            }
            if (row.id_producto) {
                finca.lotes.get(row.id_lote).productos.push({
                    id_producto: row.id_producto,
                    nombre: row.producto_nombre,
                    precio: Number(row.precio),
                    precio_mayorista: row.precio_mayorista !== null ? Number(row.precio_mayorista) : null,
                    stock: Number(row.stock),
                    id_presentacion: row.id_presentacion,
                    presentacion_nombre: row.presentacion_nombre,
                    kg_equivalente: row.kg_equivalente !== null ? Number(row.kg_equivalente) : null,
                });
            }
        }

        const salida = [...fincas.values()].map(f => ({
            ...f,
            lotes: [...f.lotes.values()],
        }));

        res.json({ ok: true, fincas: salida });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// Categorías de café que ya existen en la BD, para el desplegable.
const getCategorias = async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT DISTINCT tipo_cafe FROM productos
      WHERE tipo_cafe IS NOT NULL AND tipo_cafe != '' AND categoria_producto = 'cafe'
      ORDER BY tipo_cafe
    `);
        res.json({ ok: true, categorias: result.rows.map(r => r.tipo_cafe) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// Marcas de máquinas que ya existen en la BD, para autocompletar.
const getMarcas = async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT DISTINCT marca FROM productos
      WHERE marca IS NOT NULL AND marca != '' AND categoria_producto = 'maquina'
      ORDER BY marca
    `);
        res.json({ ok: true, marcas: result.rows.map(r => r.marca) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// Sugerencias de precio (y garantía para máquinas) basadas en productos
// similares que ya existen en tu propia base de datos. No consulta fuentes
// externas: no hay integración con Google ni ningún buscador de precios real.
const getSugerencias = async (req, res) => {
    try {
        const { categoria_producto = 'cafe', marca = '', tipo_cafe = '' } = req.query;

        let filas;
        if (categoria_producto === 'maquina') {
            const todos = await pool.query(`SELECT precio, garantia_meses, marca FROM productos WHERE categoria_producto = 'maquina'`);
            filas = todos.rows.filter(r => normalizar(r.marca) === normalizar(marca));
        } else {
            const todos = await pool.query(`SELECT precio, tipo_cafe FROM productos WHERE categoria_producto = 'cafe'`);
            filas = todos.rows.filter(r => normalizar(r.tipo_cafe) === normalizar(tipo_cafe));
        }

        const precios = [...new Set(filas.map(r => Number(r.precio)))].slice(0, 5);
        const garantias = categoria_producto === 'maquina'
            ? [...new Set(filas.map(r => r.garantia_meses).filter(g => g != null))].slice(0, 5)
            : [];

        res.json({ ok: true, precios, garantias });
    } catch (error) {
        console.error(error);
        res.json({ ok: true, precios: [], garantias: [] }); // no bloquea el formulario si falla
    }
};

const getProductoPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
      SELECT pr.id_producto, pr.nombre, pr.descripcion, pr.tipo_cafe, pr.presentacion,
             pr.precio, pr.stock, pr.imagen_url, pr.id_lote,
             pr.categoria_producto, pr.marca, pr.modelo, pr.garantia_meses,
             l.finca, l.variedad, l.cantidad_kg AS capacidad,
             pc.kg_equivalente
      FROM productos pr
      LEFT JOIN lotes l ON l.id_lote = pr.id_lote
      LEFT JOIN presentaciones_catalogo pc ON pc.id_presentacion = pr.id_presentacion
      WHERE pr.id_producto = $1
    `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
        }

        const producto = result.rows[0];
        const capacidad = Number(producto.capacidad) || 0;
        const stock = Number(producto.stock);
        const esMaquina = producto.categoria_producto === 'maquina';
        const kgStock = esMaquina ? stock : kgEquivalenteStock(stock, producto.kg_equivalente);
        let pct;
        if (capacidad > 0) {
            pct = Math.min(Math.round((kgStock / capacidad) * 100), 100);
        } else {
            pct = stock > 0 ? 100 : 0;
        }

        res.json({
            ok: true,
            producto: {
                id: producto.id_producto,
                nombre: producto.nombre,
                descripcion: producto.descripcion,
                tipo_cafe: producto.tipo_cafe,
                presentacion: producto.presentacion,
                precio: Number(producto.precio),
                stock,
                imagen_url: producto.imagen_url,
                id_lote: producto.id_lote,
                categoria_producto: producto.categoria_producto || 'cafe',
                marca: producto.marca,
                modelo: producto.modelo,
                garantia_meses: producto.garantia_meses,
                origen: [producto.finca, producto.variedad].filter(Boolean).join(' · '),
                capacidad,
                pct,
                estado: calcularEstado(kgStock, capacidad)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

function validarCamposBasicos({ nombre, precio, stock }) {
    if (!nombre || precio === '' || precio == null || stock === '' || stock == null) {
        return 'Faltan campos obligatorios.';
    }
    if (Number.isNaN(Number(precio)) || Number(precio) < 0) {
        return 'El precio debe ser un número válido.';
    }
    if (Number.isNaN(Number(stock)) || Number(stock) < 0) {
        return 'El stock debe ser un número válido.';
    }
    return null;
}

function validarDescripcion(descripcion) {
    if (descripcion && contieneOfensivas(descripcion)) {
        return 'La descripción contiene palabras no permitidas.';
    }
    return null;
}

function validarMaquina(body) {
    const { modelo, garantia_meses } = body;

    if (!body.marca || !modelo) {
        return 'Para máquinas, marca y número de identificación son obligatorios.';
    }
    if (String(modelo).length > 20) {
        return 'El número de identificación no puede tener más de 20 caracteres.';
    }

    const tieneGarantia = garantia_meses !== undefined && garantia_meses !== null && garantia_meses !== '';
    if (tieneGarantia && (Number.isNaN(Number(garantia_meses)) || Number(garantia_meses) < 0)) {
        return 'La garantía debe ser un número de meses válido.';
    }
    return null;
}

function validarCafe(body) {
    if (!body.id_lote || !body.tipo_cafe || !body.presentacion) {
        return 'Para café, lote, categoría y presentación son obligatorios.';
    }
    return null;
}

function validarProducto(body) {
    const { precio, stock, descripcion, categoria_producto } = body;

    const errorBasico = validarCamposBasicos({ nombre: body.nombre, precio, stock });
    if (errorBasico) return errorBasico;

    const errorDescripcion = validarDescripcion(descripcion);
    if (errorDescripcion) return errorDescripcion;

    if (categoria_producto === 'maquina') {
        return validarMaquina(body);
    }

    return validarCafe(body);
}

const crearProducto = async (req, res) => {
    try {
        const { id_lote, nombre, descripcion, tipo_cafe, presentacion, id_presentacion, precio, precio_mayorista, costo_unitario, stock, imagen_url, categoria_producto, marca, modelo, garantia_meses } = req.body;

        const errorValidacion = validarProducto(req.body);
        if (errorValidacion) return res.status(400).json({ ok: false, error: errorValidacion });

        if (precio_mayorista !== undefined && precio_mayorista !== '' && precio !== undefined) {
            const margen = await obtenerParametro('margen_minimo_mayorista_publico_pct', 30);
            const minimoPublico = Number(precio_mayorista) * (1 + margen / 100);
            if (Number(precio) < minimoPublico) {
                return res.status(400).json({
                    ok: false,
                    error: `El precio público debe ser al menos $${Math.round(minimoPublico).toLocaleString('es-CO')} (${margen}% arriba del mayorista), para no perjudicar a los clientes mayoristas.`
                });
            }
        }

        const yaExiste = await pool.query(
            `SELECT id_producto FROM productos WHERE lower(nombre) = lower($1)`,
            [nombre]
        );
        if (yaExiste.rows.length > 0) {
            return res.status(400).json({ ok: false, error: 'Este nombre ya está siendo usado por otro producto.' });
        }

        const esMaquina = categoria_producto === 'maquina';

        let garantiaFinal = null;
        if (esMaquina && garantia_meses) {
            garantiaFinal = Number(garantia_meses);
        }

        const result = await pool.query(`
      INSERT INTO productos (
        id_lote, nombre, descripcion, tipo_cafe, presentacion, id_presentacion, precio, precio_mayorista, costo_unitario, stock, imagen_url,
        estado, categoria_producto, marca, modelo, garantia_meses, creado_por, fecha_creacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'activo', $12, $13, $14, $15, $16, NOW())
      RETURNING id_producto
    `, [
            esMaquina ? null : id_lote,
            nombre,
            descripcion || null,
            esMaquina ? null : tipo_cafe,
            esMaquina ? null : presentacion,
            esMaquina ? null : (id_presentacion || null),
            Number(precio),
            precio_mayorista !== undefined && precio_mayorista !== '' ? Number(precio_mayorista) : null,
            costo_unitario !== undefined && costo_unitario !== '' ? Number(costo_unitario) : 0,
            Number(stock),
            imagen_url || null,
            esMaquina ? 'maquina' : 'cafe',
            esMaquina ? (marca || null) : null,
            esMaquina ? (modelo || null) : null,
            garantiaFinal,
            req.usuario.id,
        ]);

        res.json({ ok: true, id: result.rows[0].id_producto });
    } catch (error) {
        console.error(error);
        if (error.code === '23503') {
            return res.status(400).json({ ok: false, error: 'El lote seleccionado no existe.' });
        }
        res.status(500).json({ ok: false, error: error.message });
    }
};

const actualizarProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const { id_lote, nombre, descripcion, tipo_cafe, presentacion, id_presentacion, precio, precio_mayorista, costo_unitario, stock, imagen_url, estado, categoria_producto, marca, modelo, garantia_meses } = req.body;

        const errorValidacion = validarProducto(req.body);
        if (errorValidacion) return res.status(400).json({ ok: false, error: errorValidacion });

        if (precio_mayorista !== undefined && precio_mayorista !== '' && precio !== undefined) {
            const margen = await obtenerParametro('margen_minimo_mayorista_publico_pct', 30);
            const minimoPublico = Number(precio_mayorista) * (1 + margen / 100);
            if (Number(precio) < minimoPublico) {
                return res.status(400).json({
                    ok: false,
                    error: `El precio público debe ser al menos $${Math.round(minimoPublico).toLocaleString('es-CO')} (${margen}% arriba del mayorista), para no perjudicar a los clientes mayoristas.`
                });
            }
        }

        const esMaquina = categoria_producto === 'maquina';

        let garantiaFinal = null;
        if (esMaquina && garantia_meses) {
            garantiaFinal = Number(garantia_meses);
        }

        const result = await pool.query(`
      UPDATE productos
      SET id_lote = $1,
          nombre = $2,
          descripcion = $3,
          tipo_cafe = $4,
          presentacion = $5,
          id_presentacion = $6,
          precio = $7,
          precio_mayorista = $8,
          costo_unitario = $9,
          stock = $10,
          imagen_url = $11,
          estado = $12,
          categoria_producto = $13,
          marca = $14,
          modelo = $15,
          garantia_meses = $16
      WHERE id_producto = $17
      RETURNING id_producto
    `, [
            esMaquina ? null : id_lote,
            nombre,
            descripcion || null,
            esMaquina ? null : tipo_cafe,
            esMaquina ? null : presentacion,
            esMaquina ? null : (id_presentacion || null),
            Number(precio),
            precio_mayorista !== undefined && precio_mayorista !== '' ? Number(precio_mayorista) : null,
            costo_unitario !== undefined && costo_unitario !== '' ? Number(costo_unitario) : 0,
            Number(stock),
            imagen_url || null,
            estado || 'activo',
            esMaquina ? 'maquina' : 'cafe',
            esMaquina ? (marca || null) : null,
            esMaquina ? (modelo || null) : null,
            garantiaFinal,
            id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
        }

        // Si el lote ya no tiene stock en ningún producto, se marca agotado.
        // Si vuelve a tener stock (se restableció uno agotado), vuelve a 'disponible'.
        if (!esMaquina && id_lote) {
            const restante = await pool.query(
                `SELECT COALESCE(SUM(stock), 0) AS total FROM productos WHERE id_lote = $1 AND estado = 'activo'`,
                [id_lote]
            );
            const nuevoEstadoLote = Number(restante.rows[0].total) <= 0 ? 'agotado' : 'disponible';
            await pool.query(
                `UPDATE lotes SET estado = $1 WHERE id_lote = $2 AND estado != $1`,
                [nuevoEstadoLote, id_lote]
            );
        }

        res.json({ ok: true, id: result.rows[0].id_producto });
    } catch (error) {
        console.error(error);
        if (error.code === '23503') {
            return res.status(400).json({ ok: false, error: 'El lote seleccionado no existe.' });
        }
        res.status(500).json({ ok: false, error: error.message });
    }
};

// Importación masiva de café desde Excel. Tolera encabezados con errores de
// tipeo (ej. "Nombe" en vez de "Nombre") usando distancia de edición.
const importarProductos = async (req, res) => {
    const { productos } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ ok: false, error: 'No se recibieron productos para importar.' });
    }

    const lotesResult = await pool.query(`SELECT id_lote, codigo_lote FROM lotes`);
    const loteIdPorCodigo = {};
    lotesResult.rows.forEach(l => { loteIdPorCodigo[normalizar(l.codigo_lote)] = l.id_lote; });

    const creados = [];
    const errores = [];

    for (let i = 0; i < productos.length; i++) {
        const fila = productos[i];
        const numeroFila = i + 2; // +2 porque la fila 1 del Excel es el encabezado

        try {
            const nombre = String(valorPorCampo(fila, 'nombre') || '').trim();
            const tipo_cafe = String(valorPorCampo(fila, 'tipo_cafe') || '').trim();
            const presentacion = String(valorPorCampo(fila, 'presentacion') || '').trim();
            const precio = Number(valorPorCampo(fila, 'precio'));
            const stock = Number(valorPorCampo(fila, 'stock'));
            const codigoLoteCrudo = valorPorCampo(fila, 'codigo_lote');
            const codigoLote = normalizar(codigoLoteCrudo);
            const imagen_url = valorPorCampo(fila, 'imagen_url') || null;

            if (!nombre || !tipo_cafe || !presentacion || !codigoLoteCrudo) {
                errores.push({ fila: numeroFila, error: 'Faltan datos obligatorios (nombre, categoría, presentación o lote). Revisa que el archivo sea compatible.' });
                continue;
            }
            if (Number.isNaN(precio) || precio < 0 || Number.isNaN(stock) || stock < 0) {
                errores.push({ fila: numeroFila, error: 'Precio o stock inválido.' });
                continue;
            }
            if (contieneOfensivas(nombre)) {
                errores.push({ fila: numeroFila, error: 'El nombre contiene palabras no permitidas.' });
                continue;
            }
            const id_lote = loteIdPorCodigo[codigoLote];
            if (!id_lote) {
                errores.push({ fila: numeroFila, error: `El lote "${codigoLoteCrudo}" no existe.` });
                continue;
            }

            const result = await pool.query(`
        INSERT INTO productos (id_lote, nombre, tipo_cafe, presentacion, precio, stock, imagen_url, estado, categoria_producto, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'activo', 'cafe', NOW())
        RETURNING id_producto
      `, [id_lote, nombre, tipo_cafe, presentacion, precio, stock, imagen_url]);

            creados.push({ fila: numeroFila, id: result.rows[0].id_producto, nombre });
        } catch (err) {
            errores.push({ fila: numeroFila, error: 'No se pudo importar esta fila: ' + err.message });
        }
    }

    res.json({ ok: true, creados: creados.length, errores });
};

// Fija el stock al valor exacto que escribe el admin (sin tope de capacidad).
const restablecerProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const { cantidad } = req.body;

        if (cantidad === undefined || cantidad === null || Number.isNaN(Number(cantidad)) || Number(cantidad) < 0) {
            return res.status(400).json({ ok: false, error: 'Ingresa una cantidad válida (0 o más).' });
        }

        const actual = await pool.query(`
      SELECT pr.stock, pr.categoria_producto, pr.id_presentacion, l.cantidad_kg AS capacidad,
             pc.kg_equivalente
      FROM productos pr
      LEFT JOIN lotes l ON l.id_lote = pr.id_lote
      LEFT JOIN presentaciones_catalogo pc ON pc.id_presentacion = pr.id_presentacion
      WHERE pr.id_producto = $1
    `, [id]);

        if (actual.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
        }

        const stockActual = Number(actual.rows[0].stock);
        const capacidad = Number(actual.rows[0].capacidad) || 0;
        const esMaquina = actual.rows[0].categoria_producto === 'maquina';
        const kgStockActual = esMaquina ? stockActual : kgEquivalenteStock(stockActual, actual.rows[0].kg_equivalente);
        const nuevoStock = Number(cantidad);
        const kgStockNuevo = esMaquina ? nuevoStock : kgEquivalenteStock(nuevoStock, actual.rows[0].kg_equivalente);

        const estadoAnterior = calcularEstado(kgStockActual, capacidad);
        const estadoNuevo = calcularEstado(kgStockNuevo, capacidad);

        const result = await pool.query(`
      UPDATE productos SET stock = $1 WHERE id_producto = $2
      RETURNING id_producto, stock
    `, [nuevoStock, id]);

        if (estadoAnterior !== 'Disponible' && estadoNuevo === 'Disponible') {
            registrarResuelta();
        }

        res.json({ ok: true, producto: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// PATCH /inventario/productos/:id/eliminar - borrado visual (estado inactivo)
const eliminarProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE productos SET estado = 'inactivo' WHERE id_producto = $1 RETURNING id_lote`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
        }

        const id_lote = result.rows[0].id_lote;
        if (id_lote) {
            const restante = await pool.query(
                `SELECT COALESCE(SUM(stock), 0) AS total FROM productos WHERE id_lote = $1 AND estado = 'activo'`,
                [id_lote]
            );
            if (Number(restante.rows[0].total) <= 0) {
                await pool.query(`UPDATE lotes SET estado = 'agotado' WHERE id_lote = $1`, [id_lote]);
            }
        }

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

export {
    getResumen, getProductos, getProductoPorId, getLotes, getInventarioPorFinca, getCategorias, getMarcas, getSugerencias,
    crearProducto, actualizarProducto, importarProductos, restablecerProducto, eliminarProducto
};