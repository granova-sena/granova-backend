const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL
const N8N_WEBHOOK_URL_CLIENTE = process.env.N8N_WEBHOOK_URL_CLIENTE
const N8N_WEBHOOK_CLIENTE_TOKEN = process.env.N8N_WEBHOOK_CLIENTE_TOKEN
const N8N_WEBHOOK_CLIENTE_TOKEN_NAME = process.env.N8N_WEBHOOK_CLIENTE_TOKEN_NAME || "X-N8N-Webhook-Token"

function parsearRespuestaN8n(textoRespuesta) {
    if (!textoRespuesta) return {}

    try {
        return JSON.parse(textoRespuesta)
    } catch (error) {
        console.error("n8n devolvió una respuesta no JSON:", textoRespuesta)
        return { respuesta: textoRespuesta }
    }
}

function validarWebhookConfigurado(webhookUrl, nombre) {
    if (!webhookUrl) {
        console.error(`Falta la variable de entorno para ${nombre}`)
        return false
    }

    return true
}

export async function chatConAsistente(req, res) {
    try {
        const { mensaje, idAdmin } = req.body

        if (!mensaje) {
            return res.status(400).json({ error: "El mensaje es obligatorio" })
        }

        if (!validarWebhookConfigurado(N8N_WEBHOOK_URL, "N8N_WEBHOOK_URL")) {
            return res.status(500).json({
                respuesta: "La IA no está configurada correctamente. Revisa la variable N8N_WEBHOOK_URL.",
                accion: null,
                parametros: {},
            })
        }

        const respuestaN8n = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({ mensaje, idAdmin }),
            signal: AbortSignal.timeout(20000),
        })

        const textoRespuesta = await respuestaN8n.text()

        if (!respuestaN8n.ok) {
            console.error("n8n respondió con error:", respuestaN8n.status, textoRespuesta)
            return res.status(502).json({
                respuesta: "El asistente tuvo un problema al procesar tu consulta. Intenta de nuevo en un momento.",
                accion: null,
                parametros: {},
            })
        }

        const data = parsearRespuestaN8n(textoRespuesta)
        res.json(data)

    } catch (error) {
        console.error("Error en chatConAsistente:", error.name, error.message)

        // Distinguimos el tipo de fallo para dar un mensaje más útil
        let mensajeError = "No pude conectarme con el asistente. Intenta de nuevo en un momento."

        if (error.name === "TimeoutError") {
            mensajeError = "El asistente está tardando más de lo normal en responder. Intenta de nuevo."
        } else if (error.cause?.code === "ECONNREFUSED") {
            mensajeError = "El asistente no está disponible en este momento."
        }

        res.status(500).json({
            respuesta: mensajeError,
            accion: null,
            parametros: {},
        })
    }
}

// Igual que chatConAsistente, pero para el asistente del lado cliente
// (usa un webhook de n8n distinto, con otro flujo/otra key).
export async function chatConAsistenteCliente(req, res) {
    try {
        const { mensaje, idCliente } = req.body

        if (!mensaje) {
            return res.status(400).json({ error: "El mensaje es obligatorio" })
        }

        if (!validarWebhookConfigurado(N8N_WEBHOOK_URL_CLIENTE, "N8N_WEBHOOK_URL_CLIENTE")) {
            return res.status(500).json({
                respuesta: "La IA del cliente no está configurada correctamente. Revisa la variable N8N_WEBHOOK_URL_CLIENTE.",
                accion: null,
                parametros: {},
            })
        }

        if (!N8N_WEBHOOK_CLIENTE_TOKEN) {
            console.error("Falta el token del webhook de cliente. Revisa N8N_WEBHOOK_CLIENTE_TOKEN.")
            return res.status(500).json({
                respuesta: "La IA del cliente no está autenticada. Revisa el token del webhook en el entorno.",
                accion: null,
                parametros: {},
            })
        }

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if (N8N_WEBHOOK_CLIENTE_TOKEN) {
            headers[N8N_WEBHOOK_CLIENTE_TOKEN_NAME] = N8N_WEBHOOK_CLIENTE_TOKEN
            headers["Authorization"] = `Bearer ${N8N_WEBHOOK_CLIENTE_TOKEN}`
        }

        const respuestaN8n = await fetch(N8N_WEBHOOK_URL_CLIENTE, {
            method: "POST",
            headers,
            body: JSON.stringify({ mensaje, idCliente }),
            signal: AbortSignal.timeout(20000),
        })

        const textoRespuesta = await respuestaN8n.text()

        if (!respuestaN8n.ok) {
            console.error("n8n (cliente) respondió con error:", respuestaN8n.status, textoRespuesta)
            return res.status(502).json({
                respuesta: "El asistente tuvo un problema al procesar tu consulta. Intenta de nuevo en un momento.",
                accion: null,
                parametros: {},
            })
        }

        const data = parsearRespuestaN8n(textoRespuesta)
        res.json(data)

    } catch (error) {
        console.error("Error en chatConAsistenteCliente:", error.name, error.message)

        let mensajeError = "No pude conectarme con el asistente. Intenta de nuevo en un momento."

        if (error.name === "TimeoutError") {
            mensajeError = "El asistente está tardando más de lo normal en responder. Intenta de nuevo."
        } else if (error.cause?.code === "ECONNREFUSED") {
            mensajeError = "El asistente no está disponible en este momento."
        }

        res.status(500).json({
            respuesta: mensajeError,
            accion: null,
            parametros: {},
        })
    }
}