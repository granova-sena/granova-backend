import pool from "../../config/db.js"
import { registrarResuelta } from "../../utils/resueltasHoy.js"

const UMBRAL_STOCK_BAJO = 50; // % de la capacidad del lote

function calcularEstado(stock, capacidad) {
    if (stock <= 0) return 'Agotado';
    if (capacidad > 0 && (stock / capacidad) * 100 <= UMBRAL_STOCK_BAJO) return 'Stock bajo';
    return 'Disponible';
}

// Quita tildes y pasa a minúsculas, para que buscar "cafe" encuentre "Café".
function normalizar(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

async function obtenerProductosCalculados() {
    const result = await pool.query(`
    SELECT pr.id_producto, pr.nombre, pr.tipo_cafe, pr.precio, pr.stock, pr.imagen_url,
           pr.categoria_producto, pr.marca, pr.modelo, pr.garantia_meses,
           l.finca, l.variedad, l.cantidad_kg AS capacidad
    FROM productos pr
    LEFT JOIN lotes l ON l.id_lote = pr.id_lote
    ORDER BY pr.nombre
  `);

    return result.rows.map(p => {
        const capacidad = Number(p.capacidad) || 0;
        const stock = Number(p.stock);
        const esMaquina = p.categoria_producto === 'maquina';
        const pct = capacidad > 0
            ? Math.min(Math.round((stock / capacidad) * 100), 100)
            : (stock > 0 ? 100 : 0);

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
            estado: calcularEstado(stock, capacidad)
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
        const cambioVentas = ayer === 0 ? (hoy > 0 ? 100 : 0) : Math.round(((hoy - ayer) / ayer) * 100);

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

const getProductoPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
      SELECT pr.id_producto, pr.nombre, pr.descripcion, pr.tipo_cafe, pr.presentacion,
             pr.precio, pr.stock, pr.imagen_url, pr.id_lote,
             pr.categoria_producto, pr.marca, pr.modelo, pr.garantia_meses,
             l.finca, l.variedad, l.cantidad_kg AS capacidad
      FROM productos pr
      LEFT JOIN lotes l ON l.id_lote = pr.id_lote
      WHERE pr.id_producto = $1
    `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
        }

        const producto = result.rows[0];
        const capacidad = Number(producto.capacidad) || 0;
        const stock = Number(producto.stock);
        const pct = capacidad > 0
            ? Math.min(Math.round((stock / capacidad) * 100), 100)
            : (stock > 0 ? 100 : 0);

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
                estado: calcularEstado(stock, capacidad)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

function validarProducto(body) {
    const { nombre, precio, stock, categoria_producto } = body;
    if (!nombre || precio === '' || precio == null || stock === '' || stock == null) {
        return 'Faltan campos obligatorios.';
    }
    if (isNaN(precio) || Number(precio) < 0) return 'El precio debe ser un número válido.';
    if (isNaN(stock) || Number(stock) < 0) return 'El stock debe ser un número válido.';

    if (categoria_producto === 'maquina') {
        if (!body.marca || !body.modelo) return 'Para máquinas, marca y modelo son obligatorios.';
    } else {
        if (!body.id_lote || !body.tipo_cafe || !body.presentacion) {
            return 'Para café, lote, categoría y presentación son obligatorios.';
        }
    }
    return null;
}

const crearProducto = async (req, res) => {
    try {
        const { id_lote, nombre, descripcion, tipo_cafe, presentacion, precio, stock, imagen_url, categoria_producto, marca, modelo, garantia_meses } = req.body;

        const errorValidacion = validarProducto(req.body);
        if (errorValidacion) return res.status(400).json({ ok: false, error: errorValidacion });

        const esMaquina = categoria_producto === 'maquina';

        const result = await pool.query(`
      INSERT INTO productos (
        id_lote, nombre, descripcion, tipo_cafe, presentacion, precio, stock, imagen_url,
        estado, categoria_producto, marca, modelo, garantia_meses, fecha_creacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'activo', $9, $10, $11, $12, NOW())
      RETURNING id_producto
    `, [
            esMaquina ? null : id_lote,
            nombre,
            descripcion || null,
            esMaquina ? null : tipo_cafe,
            esMaquina ? null : presentacion,
            Number(precio),
            Number(stock),
            imagen_url || null,
            esMaquina ? 'maquina' : 'cafe',
            esMaquina ? (marca || null) : null,
            esMaquina ? (modelo || null) : null,
            esMaquina ? (garantia_meses ? Number(garantia_meses) : null) : null,
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
        const { id_lote, nombre, descripcion, tipo_cafe, presentacion, precio, stock, imagen_url, estado, categoria_producto, marca, modelo, garantia_meses } = req.body;

        const errorValidacion = validarProducto(req.body);
        if (errorValidacion) return res.status(400).json({ ok: false, error: errorValidacion });

        const esMaquina = categoria_producto === 'maquina';

        const result = await pool.query(`
      UPDATE productos
      SET id_lote = $1,
          nombre = $2,
          descripcion = $3,
          tipo_cafe = $4,
          presentacion = $5,
          precio = $6,
          stock = $7,
          imagen_url = $8,
          estado = $9,
          categoria_producto = $10,
          marca = $11,
          modelo = $12,
          garantia_meses = $13
      WHERE id_producto = $14
      RETURNING id_producto
    `, [
            esMaquina ? null : id_lote,
            nombre,
            descripcion || null,
            esMaquina ? null : tipo_cafe,
            esMaquina ? null : presentacion,
            Number(precio),
            Number(stock),
            imagen_url || null,
            estado || 'activo',
            esMaquina ? 'maquina' : 'cafe',
            esMaquina ? (marca || null) : null,
            esMaquina ? (modelo || null) : null,
            esMaquina ? (garantia_meses ? Number(garantia_meses) : null) : null,
            id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
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

// Importación masiva: recibe un arreglo ya parseado en el frontend (desde el Excel)
// con filas de café. Cada fila necesita: nombre, codigo_lote (o id_lote), tipo_cafe,
// presentacion, precio, stock. Filas de máquinas no se soportan por Excel por ahora.
const importarProductos = async (req, res) => {
    const { productos } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ ok: false, error: 'No se recibieron productos para importar.' });
    }

    const lotesResult = await pool.query(`SELECT id_lote, codigo_lote FROM lotes`);
    const loteIdPorCodigo = {};
    lotesResult.rows.forEach(l => { loteIdPorCodigo[String(l.codigo_lote).trim().toLowerCase()] = l.id_lote; });

    const creados = [];
    const errores = [];

    for (let i = 0; i < productos.length; i++) {
        const fila = productos[i];
        const numeroFila = i + 2; // +2 porque la fila 1 del Excel es el encabezado

        try {
            const nombre = String(fila.nombre || fila.Nombre || '').trim();
            const tipo_cafe = String(fila.tipo_cafe || fila.categoria || fila.Categoria || '').trim();
            const presentacion = String(fila.presentacion || fila.Presentacion || '').trim();
            const precio = Number(fila.precio || fila.Precio);
            const stock = Number(fila.stock || fila.Stock);
            const codigoLote = String(fila.codigo_lote || fila.lote || fila.Lote || '').trim().toLowerCase();
            const imagen_url = fila.imagen_url || fila.imagen || null;

            if (!nombre || !tipo_cafe || !presentacion || !codigoLote) {
                errores.push({ fila: numeroFila, error: 'Faltan datos obligatorios (nombre, categoría, presentación o lote).' });
                continue;
            }
            if (isNaN(precio) || precio < 0 || isNaN(stock) || stock < 0) {
                errores.push({ fila: numeroFila, error: 'Precio o stock inválido.' });
                continue;
            }
            const id_lote = loteIdPorCodigo[codigoLote];
            if (!id_lote) {
                errores.push({ fila: numeroFila, error: `El lote "${fila.codigo_lote || fila.lote}" no existe.` });
                continue;
            }

            const result = await pool.query(`
        INSERT INTO productos (id_lote, nombre, tipo_cafe, presentacion, precio, stock, imagen_url, estado, categoria_producto, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'activo', 'cafe', NOW())
        RETURNING id_producto
      `, [id_lote, nombre, tipo_cafe, presentacion, precio, stock, imagen_url]);

            creados.push({ fila: numeroFila, id: result.rows[0].id_producto, nombre });
        } catch (err) {
            errores.push({ fila: numeroFila, error: err.message });
        }
    }

    res.json({ ok: true, creados: creados.length, errores });
};

// Fija el stock a un valor exacto (no suma, reemplaza el total actual).
const restablecerProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const { cantidad } = req.body;

        if (cantidad === undefined || cantidad === null || isNaN(cantidad) || Number(cantidad) < 0) {
            return res.status(400).json({ ok: false, error: 'Ingresa una cantidad válida (0 o más).' });
        }

        const actual = await pool.query(`
      SELECT pr.stock, l.cantidad_kg AS capacidad
      FROM productos pr
      LEFT JOIN lotes l ON l.id_lote = pr.id_lote
      WHERE pr.id_producto = $1
    `, [id]);

        if (actual.rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Producto no encontrado.' });
        }

        const stockActual = Number(actual.rows[0].stock);
        const capacidad = Number(actual.rows[0].capacidad) || 0;

        let nuevoStock = Number(cantidad);
        let tope = false;
        if (capacidad > 0 && nuevoStock > capacidad) {
            nuevoStock = capacidad;
            tope = true;
        }

        const estadoAnterior = calcularEstado(stockActual, capacidad);
        const estadoNuevo = calcularEstado(nuevoStock, capacidad);

        const result = await pool.query(`
      UPDATE productos SET stock = $1 WHERE id_producto = $2
      RETURNING id_producto, stock
    `, [nuevoStock, id]);

        if (estadoAnterior !== 'Disponible' && estadoNuevo === 'Disponible') {
            registrarResuelta();
        }

        res.json({ ok: true, producto: result.rows[0], tope });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

export {
    getResumen, getProductos, getProductoPorId, getLotes,
    crearProducto, actualizarProducto, importarProductos, restablecerProducto
};
