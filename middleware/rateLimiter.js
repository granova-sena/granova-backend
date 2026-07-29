import rateLimit, { ipKeyGenerator } from "express-rate-limit"

export const limitadorPublico = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Demasiadas peticiones, intenta de nuevo en unos minutos" },
    standardHeaders: true,
    legacyHeaders: false,
})

export const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const email = String(req.body?.email || "").trim().toLowerCase()
        return email || ipKeyGenerator(req.ip)
    },
    skipSuccessfulRequests: true,
    message: { error: "Demasiados intentos de inicio de sesión, intenta más tarde" },
    standardHeaders: true,
    legacyHeaders: false,
})