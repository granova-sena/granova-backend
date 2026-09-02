import pool from "../config/db.js";
import { PALABRAS_PROHIBIDAS } from "../utils/palabrasProhibidas.js";

function contieneGroserias(texto) {
  if (!texto) return false
  const normalizado = texto.toLowerCase()
  return PALABRAS_PROHIBIDAS.some(palabra => normalizado.includes(palabra))
}

// POST /resenas
export const crearResena = async (req, res) => {
  const { id_detalle, calificacion, comentario } = req.body;
  // El cliente sale del token, nunca del body — así nadie puede
  // reseñar haciéndose pasar por otro cliente.
  const id_cliente = req.usuario.id;

  if (!id_detalle || !calificacion) {
    return res.status(400).json({ ok: false, mensaje: "Faltan campos obligatorios" });
  }
  if (calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ ok: false, mensaje: "La calificación debe estar entre 1 y 5" });
  }
  if (contieneGroserias(comentario)) {
    return res.status(400).json({ ok: false, mensaje: "El comentario contiene lenguaje inapropiado, por favor edítalo" });
  }

  try {
    // Validar en una sola query: el detalle existe, pertenece a ese cliente,
    // y el pedido ya fue entregado
    const compra = await pool.query(
      `SELECT dp.id_detalle, p.id_pedido
       FROM detalle_pedidos dp
       JOIN pedidos p ON p.id_pedido = dp.id_pedido
       WHERE dp.id_detalle = $1 AND p.id_cliente = $2 AND p.estado = 'entregado'`,
      [id_detalle, id_cliente]
    );

    if (compra.rows.length === 0) {
      return res.status(403).json({
        ok: false,
        mensaje: "Solo puedes reseñar productos de pedidos entregados a tu cuenta"
      });
    }

    const nuevaResena = await pool.query(
      `INSERT INTO resenas (id_detalle_pedido, calificacion, comentario)
       VALUES ($1, $2, $3)
       RETURNING id_resena, calificacion, comentario, fecha_resena`,
      [id_detalle, calificacion, comentario || null]
    );

    // Si ya no quedan productos sin reseñar en ese pedido, se elimina la
    // notificación recordatorio; si faltan más, sigue hasta completarlas.
    const id_pedido = compra.rows[0].id_pedido;
    await pool.query(
      `DELETE FROM notificaciones n
       WHERE n.id_cliente = $1 AND n.id_pedido = $2 AND n.tipo = 'reseña'
         AND NOT EXISTS (
           SELECT 1 FROM detalle_pedidos d
           LEFT JOIN resenas r ON r.id_detalle_pedido = d.id_detalle
           WHERE d.id_pedido = $2 AND r.id_resena IS NULL
         )`,
      [id_cliente, id_pedido]
    );

    res.status(201).json({ ok: true, data: nuevaResena.rows[0] });

  } catch (error) {
    if (error.code === "23505") { // violación de UNIQUE en Postgres
      return res.status(409).json({ ok: false, mensaje: "Ya dejaste una reseña para esta compra" });
    }
    console.error("Error creando reseña:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al crear la reseña" });
  }
};

// GET /resenas/foros
// Vista "Foros": todas las reseñas visibles agrupadas por producto,
// con promedio y total por hilo. Solo lectura, requiere sesión de cliente.
export const obtenerForos = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         pr.id_producto,
         pr.nombre,
         pr.imagen_url,
         COALESCE(AVG(r.calificacion), 0)::numeric(3,1) AS promedio,
         COUNT(r.id_resena)::int AS total_resenas,
         json_agg(json_build_object(
           'id_resena',    r.id_resena,
           'calificacion', r.calificacion,
           'comentario',   r.comentario,
           'fecha_resena', r.fecha_resena,
           'cliente_nombre', c.nombre
         ) ORDER BY r.fecha_resena DESC) AS resenas
       FROM productos pr
       JOIN detalle_pedidos dp ON dp.id_producto = pr.id_producto
       JOIN resenas r ON r.id_detalle_pedido = dp.id_detalle AND r.visible = TRUE
       JOIN pedidos p ON p.id_pedido = dp.id_pedido
       JOIN clientes c ON c.id_cliente = p.id_cliente
       GROUP BY pr.id_producto, pr.nombre, pr.imagen_url
       ORDER BY AVG(r.calificacion) DESC, COUNT(r.id_resena) DESC`
    );

    // Los hilos sin reseñas visibles no participan (el JOIN ya los excluye)

    res.status(200).json({ ok: true, data: resultado.rows });

  } catch (error) {
    console.error("Error obteniendo foros:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener las reseñas" });
  }
};

// GET /resenas/producto/:id_producto
export const obtenerResenasProducto = async (req, res) => {
  const { id_producto } = req.params;

  if (Number.isNaN(Number(id_producto))) {
    return res.status(400).json({ ok: false, mensaje: "El id del producto debe ser un número" });
  }

  try {
    const resenas = await pool.query(
      `SELECT r.id_resena, r.calificacion, r.comentario, r.fecha_resena, c.nombre AS cliente_nombre
       FROM resenas r
       JOIN detalle_pedidos dp ON dp.id_detalle = r.id_detalle_pedido
       JOIN pedidos p ON p.id_pedido = dp.id_pedido
       JOIN clientes c ON c.id_cliente = p.id_cliente
       WHERE dp.id_producto = $1 AND r.visible = TRUE
       ORDER BY r.fecha_resena DESC`,
      [id_producto]
    );

    const resumen = await pool.query(
      `SELECT COUNT(*) AS total_resenas, COALESCE(AVG(r.calificacion), 0) AS promedio
       FROM resenas r
       JOIN detalle_pedidos dp ON dp.id_detalle = r.id_detalle_pedido
       WHERE dp.id_producto = $1 AND r.visible = TRUE`,
      [id_producto]
    );

    res.status(200).json({
      ok: true,
      data: {
        promedio: Number(resumen.rows[0].promedio).toFixed(1),
        total_resenas: Number(resumen.rows[0].total_resenas),
        resenas: resenas.rows
      }
    });

  } catch (error) {
    console.error("Error obteniendo reseñas:", error.message);
    res.status(500).json({ ok: false, mensaje: "Error interno al obtener las reseñas" });
  }
};