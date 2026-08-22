import pool from "../config/db.js";

// ─────────────────────────────────────────
// POST /api/pedidos
// ─────────────────────────────────────────
export const crearPedido = async (req, res) => {

  const { id_cliente, metodo_pago, direccion_envio, ciudad_envio, productos, codigo_cupon } = req.body;

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

  // Validar cada producto antes de tocar la BD
  for (const p of productos) {
    if (!p.id_producto || !Number.isInteger(Number(p.cantidad)) || Number(p.cantidad) <= 0) {
      return res.status(400).json({
        ok: false,
        mensaje: `Producto con id ${p.id_producto || '?'} tiene cantidad inválida: ${p.cantidad}`
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que el cliente existe y traer su tipo (define qué precio aplica)
    const clienteExiste = await client.query(
      `SELECT id_cliente, tipo_cliente FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteExiste.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        mensaje: "Cliente no encontrado"
      });
    }

    const esMayorista = clienteExiste.rows[0].tipo_cliente === 'mayorista';

    // Verificar productos, stock y traer el precio real desde la BD.
    // El precio nunca se toma del body: si el cliente lo manda, se ignora.
    // Mayorista usa precio_mayorista (si existe); minorista siempre precio público.
    const productosConPrecio = [];
    for (const p of productos) {
      const productoExiste = await client.query(
        `SELECT id_producto, stock, nombre, precio, precio_mayorista FROM productos WHERE id_producto = $1 AND estado = 'activo'`,
        [p.id_producto]
      );

      if (productoExiste.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          ok: false,
          mensaje: `Producto con id ${p.id_producto} no encontrado o inactivo`
        });
      }

      const { stock: stockDisponible, nombre, precio, precio_mayorista } = productoExiste.rows[0];
      const cantidad = Math.floor(Number(p.cantidad));
      if (stockDisponible < cantidad) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: `Stock insuficiente para "${nombre}". Disponible: ${stockDisponible}`
        });
      }

      const precioAplicable = esMayorista && precio_mayorista != null ? Number(precio_mayorista) : Number(precio);
      productosConPrecio.push({ ...p, precio_unitario: precioAplicable, cantidad });
    }

    // ── Cupón: validar, bloquear, calcular descuento ──
    let cupon = null;
    let descuentoCuponMonto = 0;
    if (codigo_cupon && String(codigo_cupon).trim()) {
      const r = await client.query(
        `SELECT id_cupon, codigo, descuento_pct FROM cupones
         WHERE UPPER(codigo) = UPPER($1) AND id_cliente = $2 AND usado = false
           AND fecha_vencimiento > CURRENT_DATE
         FOR UPDATE`,
        [String(codigo_cupon).trim(), id_cliente]
      );
      if (r.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: "Cupón inválido, vencido o ya utilizado"
        });
      }
      cupon = r.rows[0];
    }

    // Calcular subtotal con precio real (sin cupón — el cupón es adicional)
    const subtotalSinCupon = productosConPrecio.reduce(
      (acc, p) => acc + p.precio_unitario * p.cantidad,
      0
    );

    // Aplicar cupón sobre el subtotal
    if (cupon) {
      descuentoCuponMonto = Math.round(subtotalSinCupon * Number(cupon.descuento_pct) / 100);
    }

    const total = subtotalSinCupon - descuentoCuponMonto;

    // Insertar pedido principal (con código_cupon para auditoría)
    const resultadoPedido = await client.query(
      `INSERT INTO pedidos (id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuento, codigo_cupon)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_pedido`,
      [id_cliente, metodo_pago, direccion_envio, ciudad_envio, total, descuentoCuponMonto, cupon ? cupon.codigo : null]
    );

    const id_pedido = resultadoPedido.rows[0].id_pedido;

    // Insertar detalle y descontar stock
    for (const p of productosConPrecio) {
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

    // Marcar cupón como usado
    if (cupon) {
      await client.query(
        `UPDATE cupones SET usado = true WHERE id_cupon = $1`,
        [cupon.id_cupon]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      data: {
        id_pedido,
        ...(cupon && {
          descuento_aplicado: descuentoCuponMonto,
          descuento_fuente: 'cupon',
          codigo_cupon: cupon.codigo,
        }),
      },
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
  if (Number.isNaN(Number(id))) {
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

    const esAdmin = !!req.usuario?.rol;
    const esDueno = req.usuario?.id === pedido.rows[0].id_cliente;
    if (!esAdmin && !esDueno) {
      return res.status(403).json({
        ok: false,
        mensaje: "No tienes permiso para ver este pedido"
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

  if (Number.isNaN(Number(id_cliente))) {
    return res.status(400).json({
      ok: false,
      mensaje: "El id del cliente debe ser un número"
    })
  }

  const esAdmin = !!req.usuario?.rol;
  const esDueno = req.usuario?.id === Number(id_cliente);
  if (!esAdmin && !esDueno) {
    return res.status(403).json({
      ok: false,
      mensaje: "No tienes permiso para ver estos pedidos"
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