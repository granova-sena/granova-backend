import { headersWompi, WOMPI_BASE_URL, obtenerAcceptanceToken, generarFirmaIntegridad} from "../config/wompi.js";
import{
    buscarPedidoPorId,
    actualizarEstadoPedido,
    guardarPaymentIntent,
    actualizarEstadoPago
}from "../models/pedidosModel.js"
import{
    guardarTransaccionWompi
}from "../models/wompiPagosModel.js"
import crypto from "crypto"


export const pagarConNequi = async(req,res)=>{
    const {id_pedido,numero_celular}= req.body;

    if(!id_pedido || !numero_celular){
        return res.status(400).json({
            ok:     false,
            mensaje:"el id pedido y el celular es obligatorio"
        })
    }
    if (!/^3\d{9}$/.test(numero_celular)) {
    return res.status(400).json({
      ok:      false,
      mensaje: "El número de celular debe tener 10 dígitos y empezar por 3"
    })
  }
    try{
        const consultaPedido = await buscarPedidoPorId(id_pedido)
        const pedidoEncontrado = consultaPedido.rows[0]

        if(!pedidoEncontrado){
            return res.status(404).json({
                ok:     false,
                mensaje:"pedido no encontrado"
            })
        }

        const acceptanceToken = await obtenerAcceptanceToken()
        const montoCentavos = Math.round(Number(pedidoEncontrado.total)*100)
        const referencia = `GRANOVA-${id_pedido}-${Date.now()}`
        const firmaIntegridad = generarFirmaIntegridad(referencia, montoCentavos)

        const respuestaWompi = await fetch(`${WOMPI_BASE_URL}/transactions`,{
            method: "POST",
            headers: headersWompi(),
            body: JSON.stringify({
                amount_in_cents:   montoCentavos,
                currency:          "COP",
                customer_email:    req.usuario.email,
                reference:         referencia,
                acceptance_token: acceptanceToken,
                signature:         firmaIntegridad,
                payment_method: {
                type:             "NEQUI",
                phone_number:     numero_celular
            }
            })
            
        })
        const datos = await respuestaWompi.json()
        console.log("Respuesta Wompi completa:", JSON.stringify(datos, null, 2))


        if (!respuestaWompi.ok) {
            console.error("Error Wompi:", datos)
            return res.status(400).json({
                ok:      false,
                mensaje: datos?.error?.messages?.join(", ") || "Error al procesar el pago con Nequi"
            })
        }

        const transaccion = datos.data

        await guardarTransaccionWompi(id_pedido, transaccion.id)
        return res.status(200).json({
            ok:     true,
            id_transaccion: transaccion.id,
            estado:     transaccion.status,
            mensaje: "Notificación enviada a NEQUI. Aprueba el pago en tu app."

        })

    }
    catch(error){
        console.error("Error pagando con nequi:", error.message)
        return res.status(500).json({
            ok:     false,
            mensaje: "Error al crear el pago"
        })
    }
}
export const consultarTransaccion = async (req,res)=> {
    const {id} = req.params
    
    if(!id){
        return res.status(400).json({
            ok: false,
            mensaje: "El id de la transacción es obligatorio"

        })
    }

    try{
        const respuestaWompi = await fetch(`${WOMPI_BASE_URL}/transactions/${id}`,{
            headers: headersWompi()
        })

        const datos = await respuestaWompi.json()

        if(!respuestaWompi.ok){
            return res.status(400).json({
                ok: false,
                mensaje: "No se pudo consultar la transacción"
            })
        }

        return res.status(200).json({
            ok:     true,
            data: datos.data
        })
    }
    catch(error){
        consola.error("Error consultando transaccion:", error.message)
        return res.status(500).json({
            ok:     false,
            mensaje: "Error interno al consultar el pago"
        })

    }
}

export const webhookWompi = async (req,res) =>{
    try{
        const{event,data, sent_at,signature}=req.body

        const cadena = `${sent_at}${event}${data?.transaction?.id || ""}${process.env.WOMPI_EVENTS_SECRET}`

        const firmaEsperada = crypto
        .createHash("sha256")
        .update(cadena)
        .digest("hex")

        // if (firmaEsperada !== signature?.checksum) {
//   console.error("Firma de webhook Wompi inválida")
//   return res.status(401).json({ mensaje: "Firma inválida" })
// }
        if(event !== "transaction.updated"){
            return res.status(200).json({
                recibido: true
            })
        }
        const transaccion = data?.transaction
        if(!transaccion){
            return res.status(200).json({recibido: true})
        }

        const partes = transaccion.reference?.split("-")
        const id_pedido = Number(partes?.[1])
        console.log("Referencia:", transaccion.reference)
console.log("Partes:", partes)
console.log("id_pedido:", id_pedido)

        if (!id_pedido) {
            return res.status(200).json({ recibido: true })
        }
        if (transaccion.status === "APPROVED") {
        console.log("Actualizando estado pedido...")
await actualizarEstadoPedido(id_pedido, "confirmado")
console.log("Actualizando estado pago...")
await actualizarEstadoPago(id_pedido, "pagado")
        console.log(`✅ Pedido ${id_pedido} pagado con Nequi`)

        } else if (transaccion.status === "DECLINED" || transaccion.status === "ERROR") {
        await actualizarEstadoPedido(id_pedido, "cancelado")
        await actualizarEstadoPago(id_pedido,   "fallido")
        console.log(`❌ Pedido ${id_pedido} fallido con Nequi`)
        }

        return res.status(200).json({ recibido: true })
    }

    catch (error) {
    console.error("Error procesando webhook Wompi:", error.message)
    return res.status(500).json({ mensaje: "Error procesando el evento" })
  }
}
  
    
