import "dotenv/config";
import nodemailer from "nodemailer"


const transportador = nodemailer.createTransport({

        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        // Railway (y varios proveedores cloud) no tienen salida a internet por IPv6.
        // Gmail a veces resuelve a una dirección IPv6 primero, y sin esto la conexión
        // fallaba con "ENETUNREACH". Forzamos IPv4 para evitarlo.
        family: 4

})


export default transportador;