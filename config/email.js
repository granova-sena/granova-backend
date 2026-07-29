import "dotenv/config";

// Railway bloquea las conexiones SMTP salientes (probamos puerto 465 y 587,
// ambos fallan con "Connection timeout"). En vez de pelear contra ese
// bloqueo, mandamos los correos por la API HTTPS de Brevo, que sí funciona
// sin problema desde Railway (HTTPS normal, no es un puerto de correo).
//
// Requiere en las variables de entorno:
//   BREVO_API_KEY     -> la API key generada en Brevo
//   EMAIL_USER        -> el correo verificado como remitente en Brevo
//                        (ya existe esta variable, se reutiliza)

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

async function sendMail({ to, subject, html }) {
    const respuesta = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": process.env.BREVO_API_KEY,
        },
        body: JSON.stringify({
            sender: { email: process.env.EMAIL_USER, name: "Granova" },
            to: [{ email: to }],
            subject,
            htmlContent: html,
        }),
    });

    if (!respuesta.ok) {
        const detalle = await respuesta.text().catch(() => "");
        throw new Error(`Brevo respondió ${respuesta.status}: ${detalle}`);
    }

    return respuesta.json();
}

const transportador = { sendMail };

export default transportador;