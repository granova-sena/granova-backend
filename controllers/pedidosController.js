import pool from "../config/db.js";

// ─────────────────────────────────────────
// POST /api/pedidos
// ─────────────────────────────────────────
export const crearPedido = async (req, res) => {

  const { id_cliente, metodo_pago, direccion_envio, ciudad_envio, productos } = req.body;

  // Validación de campos obligatorios
  if (!id_cliente || !metodo_pago || !direccion_envio || !ciudad_envio || !productos?.length) {
    return res.status(400).json({
      ok: false,
      mensaje: "Faltan campos obligatorios"
    });
  }

  // Validar que metodo_pago sea un valor permitido por la base de datos
  const metodosPagoPermitidos = ["tarjeta", "pse", "efectivo", "transferencia", "contra_entrega", "nequi", "daviplata"];
  if (!metodosPagoPermitidos.includes(metodo_pago)) {
    return res.status(400).json({
      ok: false,
      mensaje: `Método de pago inválido. Opciones: ${metodosPagoPermitidos.join(", ")}`
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que el cliente existe
    const clienteExiste = await client.query(
      `SELECT id_cliente FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );
    console.log("Resultado cliente:", clienteExiste.rows);

    if (clienteExiste.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        mensaje: "Cliente no encontrado"
      });
    }

    // Verificar que todos los productos existen y tienen stock suficiente
    for (const p of productos) {
      const productoExiste = await client.query(
        `SELECT id_producto, stock, nombre FROM productos WHERE id_producto = $1 AND estado = 'activo'`,
        [p.id_producto]
      );

      if (productoExiste.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          mensaje: `Producto con id ${p.id_producto} no encontrado o inactivo`
        });
      }

      const stockDisponible = productoExiste.rows[0].stock;
      if (stockDisponible < p.cantidad) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: `Stock insuficiente para "${productoExiste.rows[0].nombre}". Disponible: ${stockDisponible}`
        });
      }
    }

    // Calcular total
    const total = productos.reduce(
      (acumulado, p) => acumulado + p.precio_unitario * p.cantidad,
      0
    );

    // Insertar pedido principal
    const resultadoPedido = await client.query(
      `INSERT INTO pedidos (id_cliente, metodo_pago, direccion_envio, ciudad_envio, total)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_pedido`,
      [id_cliente, metodo_pago, direccion_envio, ciudad_envio, total]
    );

    const id_pedido = resultadoPedido.rows[0].id_pedido;

    // Insertar detalle y descontar stock
    for (const p of productos) {
      const subtotal = p.precio_unitario * p.cantidad;

      await client.query(
        `INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [id_pedido, p.id_producto, p.cantidad, p.precio_unitario, subtotal]
      );

      await client.query(
        `UPDATE productos
         SET stock = stock - $1
         WHERE id_producto = $2`,
        [p.cantidad, p.id_producto]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      data: { id_pedido },
      mensaje: "Pedido creado exitosamente"
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creando pedido:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "Error interno al crear el pedido"
    });

  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────
// GET /api/pedidos/:id
// ─────────────────────────────────────────
export const obtenerPedido = async (req, res) => {

  const { id } = req.params;

  // Validar que el id sea un número
  if (isNaN(id)) {
    return res.status(400).json({
      ok: false,
      mensaje: "El id del pedido debe ser un número"
    });
  }

  try {
    const pedido = await pool.query(
      `SELECT 
         p.*,
         c.nombre,
         c.apellido,
         c.email
       FROM pedidos p
       JOIN clientes c ON p.id_cliente = c.id_cliente
       WHERE p.id_pedido = $1`,
      [id]
    );

    if (pedido.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        mensaje: "Pedido no encontrado"
      });
    }

      const detalle = await pool.query(
        `SELECT 
          dp.*,
          pr.nombre AS producto_nombre,
          pr.presentacion,
          pr.id_lote
        FROM detalle_pedidos dp
        JOIN productos pr ON dp.id_producto = pr.id_producto
        WHERE dp.id_pedido = $1`,
        [id]
      );

    res.status(200).json({
      ok: true,
      data: {
        ...pedido.rows[0],
        productos: detalle.rows
      }
    });

  } catch (error) {
    console.error("Error obteniendo pedido:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "Error interno al obtener el pedido"
    });
  }
};
// GET /api/pedidos/cliente/:id_cliente
export const obtenerPedidosCliente = async (req, res) => {
  const { id_cliente } = req.params

  if (isNaN(id_cliente)) {
    return res.status(400).json({
      ok: false,
      mensaje: "El id del cliente debe ser un número"
    })
  }

  try {
    const resultado = await pool.query(
      `SELECT 
         p.id_pedido,
         p.fecha_pedido,
         p.estado,
         p.metodo_pago,
         p.direccion_envio,
         p.ciudad_envio,
         p.total
       FROM pedidos p
       WHERE p.id_cliente = $1
       ORDER BY p.fecha_pedido DESC`,
      [id_cliente]
    )

    res.status(200).json({
      ok: true,
      data: resultado.rows
    })

  } catch (error) {
    console.error("Error obteniendo pedidos del cliente:", error.message)
    res.status(500).json({
      ok: false,
      mensaje: "Error al obtener los pedidos"
    })
  }
};