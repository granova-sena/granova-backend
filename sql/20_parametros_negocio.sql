-- 20) Parámetros de negocio configurables desde el panel (vista "Parámetros").
-- El % de descuento de empresa pasó de estar hardcodeado (10%) a leerse desde
-- parametros_cafe (default 15%). Si la tabla no existe aún, se crea.

CREATE TABLE IF NOT EXISTS parametros_cafe (
  clave       TEXT PRIMARY KEY,
  valor       NUMERIC NOT NULL DEFAULT 0,
  descripcion TEXT
);

INSERT INTO parametros_cafe (clave, valor, descripcion)
VALUES ('descuento_empresa_pct', 15, 'Descuento automático para cuentas empresariales (personas jurídicas, en %)')
ON CONFLICT (clave) DO NOTHING;