// Limitar peticiones por IP (rate limit simple en memoria, sin dependencias).
// Suficiente para frenar abuso del asistente; un Redis/limpiador se añade después.

const registro = new Map();

export function limitarPeticiones({ max = 20, ventanaMs = 60_000, mensaje = "Demasiadas peticiones. Espera un momento." } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "desconocida";
    const ahora = Date.now();

    const actual = registro.get(ip);

    if (!actual || actual.hasta < ahora) {
      registro.set(ip, { hasta: ahora + ventanaMs, n: 1 });
      return next();
    }

    if (actual.n >= max) {
      return res.status(429).json({ ok: false, mensaje });
    }

    actual.n += 1;
    return next();
  };
}