import rateLimit from "express-rate-limit"

// Límite general para rutas públicas de lectura (fincas, productos, etc.)
// 100 peticiones por IP cada 15 minutos es generoso para uso normal,
// pero corta en seco cualquier script que intente hacer spam.
export const limitadorPublico = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: { error: "Demasiadas peticiones, intenta de nuevo en unos minutos" },
    standardHeaders: true,
    legacyHeaders: false,
})

// Límite estricto para login: protege contra fuerza bruta de contraseñas.
// 5 intentos cada 15 minutos deja margen para errores humanos normales,
// pero corta cualquier intento de adivinar una contraseña por fuerza bruta.
export const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: "Demasiados intentos de inicio de sesión, intenta más tarde" },
    standardHeaders: true,
    legacyHeaders: false,
})