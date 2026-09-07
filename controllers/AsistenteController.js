// Webhooks de n8n del asistente. Vienen de las variables de entorno
// (N8N_WEBHOOK_URL y N8N_WEBHOOK_URL_CLIENTE en Railway/.env) para no
// pisar dominios hardcodeados cuando cambie el despliegue.
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://n8n-production-aacb.up.railway.app/webhook/granova-chat"

const N8N_WEBHOOK_URL_CLIENTE = process.env.N8N_WEBHOOK_URL_CLIENTE || "https://n8n-production-aacb.up.railway.app/webhook/Chat-Cliente"


// Extrae el texto legible de lo que devuelva n8n, sin depender de un único
// campo: puede venir como {respuesta}, {mensaje}, {message}, {output}, un
// string suelto o un array (varios turnos de chat).
function extraerTextoRespuesta(entrada) {
    if (entrada == null) return "";
    if (typeof entrada === "string") return entrada.trim();
    if (Array.isArray(entrada)) {
        return entrada.map((e) => extraerTextoRespuesta(e)).filter(Boolean).join("\n").trim();
    }
    if (typeof entrada === "object") {
        for (const clave of ["respuesta", "mensaje", "message", "text", "output", "content", "reply", "contenido"]) {
            const valor = entrada[clave];
            if (valor != null && String(valor).trim()) return String(valor).trim();
        }
        if (Array.isArray(entrada.choices) && entrada.choices[0]?.message?.content) {
            return String(entrada.choices[0].message.content).trim();
        }
        if (entrada.result != null || entrada.data != null) {
            return extraerTextoRespuesta(entrada.result ?? entrada.data);
        }
    }
    return "";
}

// Normaliza cualquier respuesta de n8n al contrato del frontend:
// { respuesta, accion, parametros }. La accion/parametros pasan tal cual
// cuando n8n las manda (p.ej. agregar_carrito).
function normalizarRespuestaAsistente(parseado) {
    const objeto = Array.isArray(parseado) ? {} : (parseado || {});
    const respuesta = extraerTextoRespuesta(parseado);
    return {
        respuesta: respuesta || "No obtuve una respuesta del asistente. Intenta reformular tu pregunta la próxima vez.",
        accion: objeto.accion ?? null,
        parametros: objeto.parametros ?? {},
    };
}


export async function chatConAsistente(req, res) {
    try {
        const { mensaje, idAdmin } = req.body

        if (!mensaje) {
            return res.status(400).json({ error: "El mensaje es obligatorio" })
        }
        if (String(mensaje).length > 2000) {
            return res.status(400).json({ error: "El mensaje no puede superar los 2000 caracteres" })
        }

        const respuestaN8n = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

        let data = {};
        if (textoRespuesta) {
            try {
                data = JSON.parse(textoRespuesta);
            } catch {
                // n8n devolvió un texto plano (no JSON): se usa como respuesta.
                data = textoRespuesta;
            }
        }
        res.json(normalizarRespuestaAsistente(data));

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
        if (String(mensaje).length > 2000) {
            return res.status(400).json({ error: "El mensaje no puede superar los 2000 caracteres" })
        }

        const respuestaN8n = await fetch(N8N_WEBHOOK_URL_CLIENTE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

        let data = {};
        if (textoRespuesta) {
            try {
                data = JSON.parse(textoRespuesta);
            } catch {
                // n8n devolvió un texto plano (no JSON): se usa como respuesta.
                data = textoRespuesta;
            }
        }
        res.json(normalizarRespuestaAsistente(data));

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