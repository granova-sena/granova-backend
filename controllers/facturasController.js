import pool from "../config/db.js";
import {
  buscarPedidoPorId,
  buscarFacturaPorPedido,
  contarFacturas,
  insertarFactura,
  obtenerFacturaCompleta,
  obtenerProductosDePedido,
  obtenerItemsConIva,
  obtenerClienteDelPedido,
} from "../models/facturasModel.js";

async function generarNumeroFactura(prefijo = "FE") {
    const conteoConsulta = await contarFacturas();
    const totalFacturas = Number (conteoConsulta.rows[0].count);
    const añoActual = new Date().getFullYear();
    const consecutivo = String(totalFacturas + 1).padStart(4,"0");

    return `${prefijo}-${añoActual}-${consecutivo}`;
}

// Desglose de IVA POR TASA real (5% café tostado, 19% máquinas, 0% verde),
// en lugar del 19% fijo que se aplicaba a todo el total.
// subtotal = Σ (precio*cant) / (1 + tasa/100); impuestos = bruto − subtotal.
function calcularValoresPorTasa(items) {
    const porTasa = new Map();

    for (const item of items) {
        const bruto = Number(item.precio_unitario) * Number(item.cantidad);
        const tasa = Math.round(Number(item.iva_pct ?? 0));
        const subtotalItem = tasa === 0 ? bruto : bruto / (1 + tasa / 100);
        const impuestoItem = bruto - subtotalItem;

        const acumulado = porTasa.get(tasa) || { tasa, base: 0, impuesto: 0 };
        acumulado.base += subtotalItem;
        acumulado.impuesto += impuestoItem;
        porTasa.set(tasa, acumulado);
    }

    const impuestosPorTasa = [...porTasa.values()]
        .sort((a, b) => a.tasa - b.tasa)
        .map(t => ({ tasa: t.tasa, base: Math.round(t.base * 100) / 100, valor: Math.round(t.impuesto * 100) / 100 }));

    const subtotal = Math.round(impuestosPorTasa.reduce((acc, t) => acc + t.base, 0) * 100) / 100;
    const impuestos = Math.round(impuestosPorTasa.reduce((acc, t) => acc + t.valor, 0) * 100) / 100;

    return { subtotal, impuestos, impuestosPorTasa };
}

export const crearFactura = async (req, res) => {
  const { id_pedido } = req.body;

    if(!id_pedido){
        return res.status(400).json({
            ok:     false,
            mensaje: "El id_pedido es obligatorio"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Buscar el pedido
        const consultaPedido = await buscarPedidoPorId(id_pedido);
        const pedidoEncontrado = consultaPedido.rows[0];

        if (!pedidoEncontrado){
            await client.query("ROLLBACK");
            return res.status(404).json({
                ok:     false,
                mensaje:    "Pedido no encontrado",
            });
        }

        // 2. Verificar que no tenga factura
        const consultaFactura = await buscarFacturaPorPedido(id_pedido);
        const facturasYaExiste = consultaFactura.rows.length > 0;

        if(facturasYaExiste){
            await client.query("ROLLBACK");
            return res.status(400).json({
                ok:     false,
                mensaje: "Este pedido tiene una factura ya generada",
            });
        }

        // 3. Calcular IVA por tasa real sobre los ítems del pedido
        const items = await obtenerItemsConIva(id_pedido);
        const valoresFactura = calcularValoresPorTasa(items.rows);
        const total = Number(pedidoEncontrado.total);

        // 4. Congelar los datos fiscales del cliente en la factura (doc 03)
        const consultaCliente = await obtenerClienteDelPedido(id_pedido);
        const clienteDatos = consultaCliente.rows[0] || {};

        const tipoPersona = clienteDatos.tipo_persona || 'natural';
        const numeroDocumento = clienteDatos.numero_documento
            || (tipoPersona === 'juridica' ? '' : clienteDatos.tipo_documento || '');
        const razonSocial = tipoPersona === 'juridica'
            ? (clienteDatos.razon_social || `${clienteDatos.nombre || ''} ${clienteDatos.apellido || ''}`.trim())
            : `${clienteDatos.nombre || ''} ${clienteDatos.apellido || ''}`.trim();

        // 5. Generar número de factura
        const numeroFactura  = await generarNumeroFactura("FE");

        // 6. Insertar factura
        const consultaInsertadora = await insertarFactura(client,{
            id_pedido,
            numero_factura: numeroFactura,
            subtotal: valoresFactura.subtotal,
            impuestos: valoresFactura.impuestos,
            total,
            tipo_persona_cliente: tipoPersona,
            numero_documento_cliente: numeroDocumento,
            razon_social_cliente: razonSocial || null,
            email_cliente: clienteDatos.email || null,
        });

        const facturaGenerada = consultaInsertadora.rows[0];

        await client.query("COMMIT");

        return res.status(201).json({
            ok:     true,
            data: {
                ...facturaGenerada,
                impuestos_por_tasa: valoresFactura.impuestosPorTasa,
                estado_pago: pedidoEncontrado.estado_pago || null,
            },
            mensaje: "La factura fue creada correctamente"
        })
    }

    catch(error){
        await client.query("ROLLBACK");
        console.error("Error al generar la factura:", error.message);

        return res.status(500).json({
            ok:     false,
            mensaje:"Error interno al generar la factura",
        });

    } finally{
        client.release();
    }
};
export const obtenerFactura = async (req,res) =>{

    const id_pedido = req.params.id_pedido;

    if (Number.isNaN(Number(id_pedido))) {
        return res.status(400).json({
            ok:     false,
            mensaje:"El id debe ser un numero valido",
        });
    }

    try{
        const consultaFactura = await obtenerFacturaCompleta(id_pedido);
        const facturaEncontrada = consultaFactura.rows[0];

        if(!facturaEncontrada){
            return res.status(404).json({
                ok:     false,
                mensaje:"Factura no encontrada para este pedido",
            });
        }

        // Solo el dueño del pedido (o admin/empleado) ve la factura
        const esAdmin = !!req.usuario?.rol;
        const esDueno = Number(req.usuario?.id) === Number(facturaEncontrada.id_cliente);
        if (!esAdmin && !esDueno) {
            return res.status(403).json({
                ok:     false,
                mensaje: "No tienes permiso para ver esta factura",
            });
        }

        const consultaProductos = await obtenerProductosDePedido(id_pedido);
        const productosDelPedido = consultaProductos.rows;

        const itemsIva = await obtenerItemsConIva(id_pedido);
        const valoresFactura = calcularValoresPorTasa(itemsIva.rows);

        // Calcular descuento total: diferencia entre precio original y precio pagado
        const descuentoProductos = productosDelPedido.reduce((acc, p) => {
          const precioOriginal = Number(p.precio_original) || 0;
          const precioPagado = Number(p.precio_unitario) || 0;
          const cantidad = Number(p.cantidad) || 0;
          return acc + (precioOriginal - precioPagado) * cantidad;
        }, 0);
        const descuentoCupon = Number(facturaEncontrada.descuento_pedido) || 0;
        const descuentoTotal = Math.round(descuentoProductos + descuentoCupon);

        return res.status(200).json({
            ok:     true,
            data: {
                ...facturaEncontrada,
                subtotal: valoresFactura.subtotal,
                impuestos: valoresFactura.impuestos,
                impuestos_por_tasa: valoresFactura.impuestosPorTasa,
                descuento: descuentoTotal,
                productos: productosDelPedido,
            },
        });
    }

    catch(error){
        console.error("Error al obtener factura:", error.message);

        return res.status(500).json({
            ok:     false,
            mensaje:"Error interno al obtener la factura",
        });
    }
};