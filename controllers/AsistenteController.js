// En desarrollo local usa tu n8n local (localhost:5678). En producción,
// configura N8N_WEBHOOK_URL en las variables de entorno de Railway apuntando
// a la URL pública de tu n8n desplegado (ver README para el paso a paso).
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/granova-chat"

export async function chatConAsistente(req, res) {
    try {
        const { mensaje, idAdmin } = req.body

        if (!mensaje) {
            return res.status(400).json({ error: "El mensaje es obligatorio" })
        }

        const respuestaN8n = await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mensaje, idAdmin }),
        })

        const textoRespuesta = await respuestaN8n.text()
        console.log("Respuesta cruda de n8n:", textoRespuesta)

        if (!respuestaN8n.ok) {
            return res.status(502).json({ error: "El asistente no respondió correctamente" })
        }

        const data = textoRespuesta ? JSON.parse(textoRespuesta) : {}

        res.json(data)

    } catch (error) {
        console.error("Error en chatConAsistente:", error)
        res.status(500).json({ error: "Error al conectar con el asistente" })
    }
}