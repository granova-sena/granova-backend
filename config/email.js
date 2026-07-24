import "dotenv/config";
import nodemailer from "nodemailer"


const transportador = nodemailer.createTransport({

        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }

})


export default transportador;