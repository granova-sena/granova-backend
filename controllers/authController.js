import "dotenv/config"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { OAuth2Client } from "google-auth-library"
import pool from "../config/db.js"
import crypto from "crypto"
import transportador from "../config/email.js"

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback"
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"

// Tiempo que dura válido el token de recuperación (independiente del cooldown de reenvío)
const TOKEN_EXPIRACION_MIN = 60
// Tiempo mínimo que debe esperar el usuario antes de poder pedir otro correo de recuperación
const REENVIO_COOLDOWN_MIN = Number(process.env.REENVIO_COOLDOWN_MIN || 15)
// Tiempo que dura válido el token de verificación de cuenta (24 horas)
const TOKEN_VERIFICACION_EXPIRACION_MIN = 60 * 24
// Cooldown de reenvío del correo de verificación de cuenta
const REENVIO_VERIFICACION_COOLDOWN_MIN = Number(process.env.REENVIO_VERIFICACION_COOLDOWN_MIN || 5)

const googleClient = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
)

export async function verificarEmailDisponible(req, res) {
    try {
        const { email } = req.query

        if (!email) {
            return res.status(400).json({ error: "El correo es obligatorio" })
        }

        // Revisamos las dos tablas donde puede existir un correo: clientes y usuarios (personal admin).
        // UNION combina ambos resultados en una sola consulta en vez de hacer dos viajes a la BD.
        const resultado = await pool.query(
            `SELECT email FROM clientes WHERE email = $1
             UNION
             SELECT email FROM usuarios WHERE email = $1`,
            [email]
        )

        res.json({ disponible: resultado.rows.length === 0 })

    } catch (error) {
        res.status(500).json({ error: "Error al verificar el correo" })
    }
}

export async function register(req, res) {
    try {
        const { nombre, apellido, email, contraseña } = req.body

        if (!nombre || !apellido || !email || !contraseña) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" })
        }

        // Chequeo explícito contra las dos tablas: el UNIQUE constraint de "clientes"
        // solo protege contra duplicados DENTRO de esa misma tabla, no sabe nada de "usuarios".
        const yaExiste = await pool.query(
            `SELECT email FROM clientes WHERE email = $1
             UNION
             SELECT email FROM usuarios WHERE email = $1`,
            [email]
        )

        if (yaExiste.rows.length > 0) {
            return res.status(400).json({ error: "Ese correo ya está registrado" })
        }

        const contraseñaHash = await bcrypt.hash(contraseña, 10)

        // Token de verificación de cuenta: se genera desde el registro para que
        // el cliente quede "verificado = false" hasta que confirme su correo.
        const tokenVerificacion = crypto.randomBytes(32).toString("hex")
        const expiracionVerificacion = new Date(Date.now() + TOKEN_VERIFICACION_EXPIRACION_MIN * 60 * 1000)

        const resultado = await pool.query(
            `INSERT INTO clientes (nombre, apellido, email, contraseña, token_verificacion, token_verificacion_expiracion, ultimo_envio_verificacion)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING id_cliente, nombre, email`,
            [nombre, apellido, email, contraseñaHash, tokenVerificacion, expiracionVerificacion]
        )

        const cliente = resultado.rows[0]
        const enlaceVerificacion = `${FRONTEND_URL}/verificar-cuenta?token=${tokenVerificacion}`

        try {
            await transportador.sendMail({
                from: process.env.EMAIL_USER,
                to: cliente.email,
                subject: "Confirma tu cuenta - Granova",
                html: `
                    <h2>¡Bienvenido a Granova, ${cliente.nombre}! 🏴‍☠️</h2>
                    <p>Confirma tu correo para activar tu cuenta y empezar a comprar. Este enlace expira en 24 horas.</p>
                    <a href="${enlaceVerificacion}">Verificar mi cuenta</a>
                `,
            })
        } catch (errorCorreo) {
            // El cliente ya quedó creado en la BD; si el correo falla, no tumbamos
            // el registro completo, pero sí lo dejamos ver en el log del servidor.
            console.error("No se pudo enviar el correo de verificación:", errorCorreo.message)
        }

        res.status(201).json({
            mensaje: "¡Bienvenido a la tripulación de Granova! Revisa tu correo para verificar tu cuenta antes de iniciar sesión. 🏴‍☠️",
            cliente,
        })

    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ error: "Ese correo ya está registrado" })
        }
        res.status(500).json({ error: "Error al registrar, intenta de nuevo" })
    }
}

export async function login(req, res) {
    try {
        const { email, contraseña } = req.body

        const resultado = await pool.query(
            "SELECT * FROM clientes WHERE email = $1",
            [email]
        )

        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado en el Grand Line 🗺️" })
        }

        const cliente = resultado.rows[0]
        const contraseñaValida = await bcrypt.compare(contraseña, cliente.contraseña)

        if (!contraseñaValida) {
            return res.status(401).json({ error: "Contraseña incorrecta, no eres tú, impostor 🎭" })
        }

        if (!cliente.verificado) {
            return res.status(403).json({
                error: "Todavía no has verificado tu cuenta. Revisa tu correo o solicita un nuevo enlace.",
                requiereVerificacion: true,
            })
        }

        const token = jwt.sign(
            { id: cliente.id_cliente, email: cliente.email },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        )

        res.json({
            mensaje: `¡Bienvenido de vuelta, ${cliente.nombre}! ⚓`,
            token,
            cliente: {
                id: cliente.id_cliente,
                nombre: cliente.nombre,
                apellido: cliente.apellido,
                email: cliente.email,
            },
        })

    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

// GET /auth/verificar-cuenta?token=... - confirma el correo del cliente tras el registro
export async function verificarCuenta(req, res) {
    try {
        const { token } = req.query

        if (!token) {
            return res.status(400).json({ error: "Falta el token de verificación" })
        }

        const resultado = await pool.query(
            "SELECT * FROM clientes WHERE token_verificacion = $1",
            [token]
        )

        if (resultado.rows.length === 0) {
            return res.status(400).json({ error: "Enlace de verificación inválido" })
        }

        const cliente = resultado.rows[0]

        if (cliente.verificado) {
            return res.json({ mensaje: "Tu cuenta ya estaba verificada, ya puedes iniciar sesión" })
        }

        if (!cliente.token_verificacion_expiracion || new Date() > new Date(cliente.token_verificacion_expiracion)) {
            return res.status(400).json({ error: "El enlace de verificación expiró, solicita uno nuevo", expirado: true })
        }

        await pool.query(
            "UPDATE clientes SET verificado = true, token_verificacion = NULL, token_verificacion_expiracion = NULL WHERE id_cliente = $1",
            [cliente.id_cliente]
        )

        res.json({ mensaje: "¡Cuenta verificada! Ya puedes iniciar sesión ⚓" })

    } catch (error) {
        res.status(500).json({ error: "Error al verificar la cuenta" })
    }
}

// POST /auth/reenviar-verificacion - reenvía el correo de verificación con cooldown
export async function reenviarVerificacion(req, res) {
    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({ error: "El correo es obligatorio" })
        }

        const resultado = await pool.query(
            "SELECT * FROM clientes WHERE email = $1",
            [email]
        )

        // Mismo patrón que solicitarRecuperacion: no revelamos si el correo existe o no.
        if (resultado.rows.length === 0) {
            return res.json({ mensaje: "Si el correo existe y no está verificado, te reenviamos el enlace" })
        }

        const cliente = resultado.rows[0]

        if (cliente.verificado) {
            return res.json({ mensaje: "Esa cuenta ya está verificada, puedes iniciar sesión" })
        }

        if (cliente.ultimo_envio_verificacion) {
            const tiempoDesdeUltimoEnvio = new Date() - new Date(cliente.ultimo_envio_verificacion)
            const minutosTranscurridos = Math.floor(tiempoDesdeUltimoEnvio / 1000 / 60)

            if (minutosTranscurridos < REENVIO_VERIFICACION_COOLDOWN_MIN) {
                const minutosEspera = REENVIO_VERIFICACION_COOLDOWN_MIN - minutosTranscurridos
                return res.status(429).json({
                    error: `Ya te enviamos un correo recientemente. Espera ${minutosEspera} minuto${minutosEspera === 1 ? '' : 's'} antes de intentar de nuevo.`
                })
            }
        }

        const tokenVerificacion = crypto.randomBytes(32).toString("hex")
        const expiracionVerificacion = new Date(Date.now() + TOKEN_VERIFICACION_EXPIRACION_MIN * 60 * 1000)
        const ahora = new Date()

        await pool.query(
            "UPDATE clientes SET token_verificacion = $1, token_verificacion_expiracion = $2, ultimo_envio_verificacion = $3 WHERE id_cliente = $4",
            [tokenVerificacion, expiracionVerificacion, ahora, cliente.id_cliente]
        )

        const enlaceVerificacion = `${FRONTEND_URL}/verificar-cuenta?token=${tokenVerificacion}`

        await transportador.sendMail({
            from: process.env.EMAIL_USER,
            to: cliente.email,
            subject: "Confirma tu cuenta - Granova",
            html: `
                <h2>Confirma tu cuenta</h2>
                <p>Hola ${cliente.nombre},</p>
                <p>Haz clic en el siguiente enlace para verificar tu cuenta. Este enlace expira en 24 horas.</p>
                <a href="${enlaceVerificacion}">Verificar mi cuenta</a>
            `,
        })

        res.json({ mensaje: "Si el correo existe y no está verificado, te reenviamos el enlace" })

    } catch (error) {
        res.status(500).json({ error: "Error al reenviar la verificación" })
    }
}

export function googleAuth(req, res) {
    const url = googleClient.generateAuthUrl({
        access_type: "offline",
        scope: ["profile", "email"]
    })
    res.redirect(url)
}

export async function googleCallback(req, res) {
    try {
        const { code } = req.query
        const { tokens } = await googleClient.getToken(code)
        googleClient.setCredentials(tokens)

        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        })

        const payload = ticket.getPayload()

        // Nota: un correo puede existir a la vez en "usuarios" (admin/empleado/gerente)
        // y en "clientes" como identidades independientes. Los tokens de cliente nunca
        // llevan "rol", así que verificarAdmin los rechaza igual — no hay forma de que
        // esto le dé a alguien acceso al panel de admin por esta vía.
        let resultado = await pool.query(
            "SELECT * FROM clientes WHERE email = $1",
            [payload.email]
        )

        let cliente

        if (resultado.rows.length === 0) {
            // Contraseña aleatoria criptográficamente segura (no Math.random)
            const contraseñaAleatoria = await bcrypt.hash(
                crypto.randomBytes(32).toString("hex"), 10
            )

            // verificado = true: Google ya confirmó la titularidad del correo,
            // así que no tiene sentido pedirle otra verificación por link.
            const nuevoCliente = await pool.query(
                "INSERT INTO clientes (nombre, apellido, email, contraseña, verificado) VALUES ($1, $2, $3, $4, true) RETURNING *",
                [payload.given_name, payload.family_name, payload.email, contraseñaAleatoria]
            )

            cliente = nuevoCliente.rows[0]
        } else {
            cliente = resultado.rows[0]
        }

        const token = jwt.sign(
            { id: cliente.id_cliente, email: cliente.email },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        )

        const clienteData = encodeURIComponent(JSON.stringify({
            id: cliente.id_cliente,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            email: cliente.email,
            foto: payload.picture,
        }))

        // El token va en la URL (no en cookie httpOnly): AuthCallback corre en el
        // popup y necesita leerlo con JS para pasárselo a la ventana principal
        // vía postMessage. Una cookie httpOnly nunca sería legible desde ahí.
        res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}&cliente=${clienteData}`)

    } catch (error) {
        const errorMsg = encodeURIComponent("No se pudo iniciar sesión con Google")
        res.redirect(`${FRONTEND_URL}/auth/callback?error=${errorMsg}`)
    }
}

export async function loginAdmin(req, res) {
    try {
        const { email, contraseña } = req.body

        const resultado = await pool.query(
            "SELECT * FROM usuarios WHERE email = $1",
            [email]
        )

        if (resultado.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" })
        }

        const usuario = resultado.rows[0]
        const contraseñaValida = await bcrypt.compare(contraseña, usuario.contraseña)

        if (!contraseñaValida) {
            return res.status(401).json({ error: "Contraseña incorrecta" })
        }

        if (usuario.rol !== "admin") {
            return res.status(403).json({ error: "No tienes permisos de administrador" })
        }

        const token = jwt.sign(
            { id: usuario.id_usuario, email: usuario.email, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        )

        res.json({
            mensaje: `¡Bienvenido de vuelta, ${usuario.nombre}!`,
            token,
            usuario: {
                id: usuario.id_usuario,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                email: usuario.email,
                rol: usuario.rol,
            },
        })

    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export async function solicitarRecuperacion(req, res) {
    try {
        const { email } = req.body // <- faltaba esta línea (bug: ReferenceError)

        if (!email) {
            return res.status(400).json({ error: "El correo es obligatorio" })
        }

        // Blindaje cruzado (mismo patrón que googleCallback): si ese correo
        // pertenece a un admin, este flujo de cliente no debe tocarlo ni
        // enviar nada. Se corta acá antes de consultar la tabla clientes.
        const esAdmin = await pool.query(
            "SELECT email FROM usuarios WHERE email = $1",
            [email]
        )

        if (esAdmin.rows.length > 0) {
            return res.json({ mensaje: "Si el correo existe, recibirás un enlace de recuperación" })
        }

        const resultado = await pool.query(
            "SELECT * FROM clientes WHERE email = $1",
            [email]
        )

        if (resultado.rows.length === 0) {
            return res.json({ mensaje: "Si el correo existe, recibirás un enlace de recuperación" })
        }

        const cliente = resultado.rows[0]

        // Cooldown de reenvío: usa un campo independiente (ultimo_envio_recuperacion),
        // no el token_expiracion (que rige cuánto dura válido el enlace).
        if (cliente.ultimo_envio_recuperacion) {
            const tiempoDesdeUltimoEnvio = new Date() - new Date(cliente.ultimo_envio_recuperacion)
            const minutosTranscurridos = Math.floor(tiempoDesdeUltimoEnvio / 1000 / 60)

            if (minutosTranscurridos < REENVIO_COOLDOWN_MIN) {
                const minutosEspera = REENVIO_COOLDOWN_MIN - minutosTranscurridos
                return res.status(429).json({
                    error: `Ya enviamos un correo recientemente. Espera ${minutosEspera} minuto${minutosEspera === 1 ? '' : 's'} antes de intentar de nuevo.`
                })
            }
        }

        const token = crypto.randomBytes(32).toString("hex")
        const expiracion = new Date(Date.now() + TOKEN_EXPIRACION_MIN * 60 * 1000)
        const ahora = new Date()

        await pool.query(
            "UPDATE clientes SET token_recuperacion = $1, token_expiracion = $2, ultimo_envio_recuperacion = $3 WHERE id_cliente = $4",
            [token, expiracion, ahora, cliente.id_cliente]
        )

        const enlace = `${FRONTEND_URL}/reset-password?token=${token}`

        await transportador.sendMail({
            from: process.env.EMAIL_USER,
            to: cliente.email,
            subject: "Recupera tu contraseña - Granova",
            html: `
                <h2>Recuperación de contraseña</h2>
                <p>Hola ${cliente.nombre},</p>
                <p>Haz clic en el siguiente enlace para crear una nueva contraseña. Este enlace expira en 1 hora.</p>
                <a href="${enlace}">Restablecer contraseña</a>
            `,
        })

        // Se elimina el res.json() duplicado que había al final
        res.json({ mensaje: "Si el correo existe, recibirás un enlace de recuperación" })

    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export async function resetearContraseña(req, res) {
    try {
        const { token, nuevaContraseña } = req.body

        let resultado = await pool.query(
            "SELECT * FROM clientes WHERE token_recuperacion = $1",
            [token]
        )

        let tabla = "clientes"
        let idColumna = "id_cliente"

        if (resultado.rows.length === 0) {
            resultado = await pool.query(
                "SELECT * FROM usuarios WHERE token_recuperacion = $1",
                [token]
            )
            tabla = "usuarios"
            idColumna = "id_usuario"
        }

        if (resultado.rows.length === 0) {
            return res.status(400).json({ error: "Token inválido o expirado" })
        }

        const persona = resultado.rows[0]

        if (!persona.token_expiracion || new Date() > new Date(persona.token_expiracion)) {
            return res.status(400).json({ error: "El enlace ha expirado, solicita uno nuevo" })
        }

        const nuevaContraseñaHash = await bcrypt.hash(nuevaContraseña, 10)

        // Nota: tabla/idColumna vienen de valores fijos internos ("clientes"/"usuarios"),
        // no de input del usuario, así que no hay inyección SQL aquí — pero se deja explícito.
        await pool.query(
            `UPDATE ${tabla} SET contraseña = $1, token_recuperacion = NULL, token_expiracion = NULL WHERE ${idColumna} = $2`,
            [nuevaContraseñaHash, persona[idColumna]]
        )

        res.json({ mensaje: "Contraseña restablecida con éxito" })

    } catch (error) {
        res.status(500).json({ error: "Error al restablecer la contraseña" })
    }
}

export async function googleOneTap(req, res) {
    try {
        const { credential } = req.body

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        })

        const payload = ticket.getPayload()

        // Nota: mismo comentario que en googleCallback — un correo puede tener
        // cuenta de cliente y de admin en paralelo sin riesgo, porque los tokens
        // de cliente nunca llevan "rol" y verificarAdmin los rechaza igual.
        let resultado = await pool.query(
            "SELECT * FROM clientes WHERE email = $1",
            [payload.email]
        )

        let cliente

        if (resultado.rows.length === 0) {
            const contraseñaAleatoria = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10)

            // verificado = true por la misma razón que en googleCallback
            const nuevoCliente = await pool.query(
                "INSERT INTO clientes (nombre, apellido, email, contraseña, verificado) VALUES ($1, $2, $3, $4, true) RETURNING *",
                [payload.given_name, payload.family_name, payload.email, contraseñaAleatoria]
            )

            cliente = nuevoCliente.rows[0]
        } else {
            cliente = resultado.rows[0]
        }

        const token = jwt.sign(
            { id: cliente.id_cliente, email: cliente.email },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        )

        res.json({
            mensaje: `¡Bienvenido, ${cliente.nombre}! ⚓`,
            token,
            cliente: {
                id: cliente.id_cliente,
                nombre: cliente.nombre,
                apellido: cliente.apellido,
                email: cliente.email,
            },
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export async function solicitarRecuperacionAdmin(req, res) {
    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({ error: "El correo es obligatorio" })
        }

        const resultado = await pool.query(
            "SELECT * FROM usuarios WHERE email = $1",
            [email]
        )

        if (resultado.rows.length === 0) {
            return res.json({ mensaje: "Si el correo existe, recibirás un enlace de recuperación" })
        }

        const usuario = resultado.rows[0]

        // Cooldown de reenvío independiente del token_expiracion (igual que en solicitarRecuperacion)
        if (usuario.ultimo_envio_recuperacion) {
            const tiempoDesdeUltimoEnvio = new Date() - new Date(usuario.ultimo_envio_recuperacion)
            const minutosTranscurridos = Math.floor(tiempoDesdeUltimoEnvio / 1000 / 60)

            if (minutosTranscurridos < REENVIO_COOLDOWN_MIN) {
                const minutosEspera = REENVIO_COOLDOWN_MIN - minutosTranscurridos
                return res.status(429).json({
                    error: `Ya enviamos un correo recientemente. Espera ${minutosEspera} minuto${minutosEspera === 1 ? '' : 's'} antes de intentar de nuevo.`
                })
            }
        }

        const token = crypto.randomBytes(32).toString("hex")
        const expiracion = new Date(Date.now() + TOKEN_EXPIRACION_MIN * 60 * 1000)
        const ahora = new Date()

        await pool.query(
            "UPDATE usuarios SET token_recuperacion = $1, token_expiracion = $2, ultimo_envio_recuperacion = $3 WHERE id_usuario = $4",
            [token, expiracion, ahora, usuario.id_usuario]
        )

        const enlace = `${FRONTEND_URL}/reset-password-admin?token=${token}`

        await transportador.sendMail({
            from: process.env.EMAIL_USER,
            to: usuario.email,
            subject: "Recupera tu contraseña - Granova Admin",
            html: `
                <h2>Recuperación de contraseña</h2>
                <p>Hola ${usuario.nombre},</p>
                <p>Haz clic en el siguiente enlace para crear una nueva contraseña. Este enlace expira en 1 hora.</p>
                <a href="${enlace}">Restablecer contraseña</a>
            `,
        })

        res.json({ mensaje: "Si el correo existe, recibirás un enlace de recuperación" })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export async function resetearContraseñaAdmin(req, res) {
    try {
        const { token, nuevaContraseña } = req.body

        const resultado = await pool.query(
            "SELECT * FROM usuarios WHERE token_recuperacion = $1",
            [token]
        )

        if (resultado.rows.length === 0) {
            return res.status(400).json({ error: "Enlace inválido o expirado" })
        }

        const usuario = resultado.rows[0]

        if (new Date() > new Date(usuario.token_expiracion)) {
            return res.status(400).json({ error: "El enlace ha expirado, solicita uno nuevo" })
        }

        const contraseñaHash = await bcrypt.hash(nuevaContraseña, 10)

        await pool.query(
            "UPDATE usuarios SET contraseña = $1, token_recuperacion = NULL, token_expiracion = NULL WHERE id_usuario = $2",
            [contraseñaHash, usuario.id_usuario]
        )

        res.json({ mensaje: "Contraseña actualizada correctamente" })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}