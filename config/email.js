import "dotenv/config";
import nodemailer from "nodemailer"


const transportador = nodemailer.createTransport({

        // Antes usábamos el shorthand "service: gmail", que apunta al puerto 465 (SSL).
        // Railway parece bloquear ese puerto de salida (Connection timeout). Probamos
        // con el puerto 587 (STARTTLS) de forma explícita, que muchos proveedores dejan
        // abierto aunque bloqueen el 465.
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        // Railway (y varios proveedores cloud) no tienen salida a internet por IPv6.
        // Gmail a veces resuelve a una dirección IPv6 primero, y sin esto la conexión
        // fallaba con "ENETUNREACH". Forzamos IPv4 para evitarlo.
        family: 4,
        // Timeouts más cortos que el default (2 min) para no dejar la petición
        // de registro colgada tanto tiempo si el puerto también está bloqueado.
        connectionTimeout: 15000,

})


export default transportador;