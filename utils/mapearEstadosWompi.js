const MAPA_ESTADOS = {
  PENDING: "pendiente_verificacion",
  APPROVED: "pagado",
  DECLINED: "fallido",
  ERROR: "fallido",
  VOIDED: "fallido",
};

export function mapearEstadoWompi(statusWompi) {
  return MAPA_ESTADOS[statusWompi] ?? "pendiente_verificacion";
}