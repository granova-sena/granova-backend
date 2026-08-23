import pool from "../config/db.js";
import {
  buscarPedidoPorId,
  buscarFacturaPorPedido,
  contarFacturas,
  insertarFactura,
  obtenerFacturaCompleta,
  obtenerProductosDePedido,
} from "../models/facturasModel.js";

async function generarNumeroFactura() {

    const conteoConsulta = await contarFacturas();
    const totalFacturas = Number (conteoConsulta.rows[0].count);
    const añoActual = new Date().getFullYear();
    const consecutivo = String(totalFacturas + 1).padStart(4,"0");


    return `FACTURA-${añoActual}-${consecutivo}`;
}
function calcularValoresFacturas(totalConIva){
    const porcentaje_iva = 1.19;
    const subtotal = totalConIva / porcentaje_iva;  
    const impuestos = totalConIva - subtotal;

    return{
        subtotal: subtotal.toFixed(2),
        impuestos: impuestos.toFixed(2),
        total: totalConIva,
    };
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

        // 3. Calcular valores
        const totalPedido    = Number(pedidoEncontrado.total);

        const valoresFactura = calcularValoresFacturas(totalPedido);

        // 4. Generar número de factura
        const numeroFactura  = await generarNumeroFactura();

        // 5. Insertar factura
        const consultaInsertadora = await insertarFactura(client,{
            id_pedido,
            numero_factura: numeroFactura,
            subtotal: valoresFactura.subtotal,
            impuestos: valoresFactura.impuestos,
            total: valoresFactura.total,
        });
        
        const facturaGenerada = consultaInsertadora.rows[0];

        await client.query("COMMIT");

        return res.status(201).json({
            ok:     true,
            data: facturaGenerada,
            mensaje: "la factura fue creada correctamente"
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

        const consultaProductos = await obtenerProductosDePedido(id_pedido);
        const productosDelPedido = consultaProductos.rows;

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