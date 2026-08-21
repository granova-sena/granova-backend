-- =============================================================
-- Granova — Promociones reales (Jhon)
-- Aplicar manualmente en Supabase (SQL Editor) o en psql
-- =============================================================
-- El equipo crea campañas con fechas y descuentos. El catálogo,
-- la ficha y el backend las leen solos. Nada hardcodeado.
-- La promo entra al "mayor gana": nunca suma con otras fuentes.
-- Idempotente: se puede ejecutar cuantas veces se quiera. 🗺️

CREATE TABLE IF NOT EXISTS public.promociones (
  id_promocion  serial PRIMARY KEY,
  nombre        varchar NOT NULL,
  descuento_pct numeric NOT NULL,
  fecha_inicio  timestamp NOT NULL DEFAULT NOW(),
  fecha_fin     timestamp NOT NULL,
  activo        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.promocion_productos (
  id_promocion integer NOT NULL REFERENCES promociones(id_promocion) ON DELETE CASCADE,
  id_producto  integer NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
  PRIMARY KEY (id_promocion, id_producto)
);

-- Ejemplos de campañas (ajusta ids de productos y fechas a tu gusto):
-- 
-- INSERT INTO public.promociones (nombre, descuento_pct, fecha_fin) VALUES
--   ('Semana del café colombiano', 15, NOW() + INTERVAL '7 days');
-- 
-- -- Relaciona productos con la promo (usa el id_promocion devuelto):
-- INSERT INTO public.promocion_productos (id_promocion, id_producto) VALUES
--   (1, 38), (1, 39);
--
-- Para una promo de UN día (producto del día manual):
-- INSERT INTO public.promociones (nombre, descuento_pct, fecha_fin) VALUES
--   ('Producto del día', 20, NOW() + INTERVAL '1 day');
