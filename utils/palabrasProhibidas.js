// Lista de palabras prohibidas para el filtro de reseñas.
// No es infalible (evadible con espacios, números, variaciones), es una
// primera barrera automática. El respaldo real es la moderación manual
// vía la columna `visible` de la tabla `resenas`.
//
// Nota: a propósito NO incluye palabras como "estafa" o "ladrón" —
// esas pueden ser una queja legítima de un cliente, no una grosería,
// y bloquearlas censuraría feedback real.
export const PALABRAS_PROHIBIDAS = [
  "mierda",
  "puta",
  "puto",
  "putas",
  "putos",
  "hijueputa",
  "hijoeputa",
  "hp",
  "gonorrea",
  "malparido",
  "malparida",
  "marica",
  "maricon",
  "maricón",
  "pendejo",
  "pendeja",
  "imbecil",
  "imbécil",
  "estupido",
  "estúpido",
  "estupida",
  "estúpida",
  "idiota",
  "cabron",
  "cabrón",
  "cabrona",
  "verga",
  "carajo",
  "coño",
  "chingar",
  "chingada",
  "chingado",
  "culero",
  "culera",
  "pinche",
  "zorra",
  "perra",
]