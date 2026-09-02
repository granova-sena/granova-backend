-- 19) Niveles de lealtad para el canje de puntos por cupones.
-- Los frontends anteriores tenían las recompensas hardcodeadas (500→5%, 1000→10%).
-- A partir de ahora viven en esta tabla para poder ajustarse sin tocar código.
--
--   puntos_min    → puntos acumulados necesarios para "alcanzar" el nivel.
--   canje_puntos  → cuántos puntos se pagan al canjear un cupón de ese nivel.
--   descuento_pct → % de descuento del cupón que se genera.

CREATE TABLE IF NOT EXISTS niveles_lealtad (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL UNIQUE,
  puntos_min    INTEGER NOT NULL DEFAULT 0,
  canje_puntos  INTEGER NOT NULL,
  descuento_pct NUMERIC(5,2) NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO niveles_lealtad (nombre, puntos_min, canje_puntos, descuento_pct)
VALUES
  ('Bronce', 0,     500,  5),
  ('Plata',  1000,  1000, 10),
  ('Oro',    5000,  2500, 20)
ON CONFLICT (nombre) DO NOTHING;