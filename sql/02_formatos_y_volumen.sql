-- =============================================================
-- Granova — Frente A+B (Jhon): Formatos de venta + Descuentos por volumen
-- Aplicar manualmente en Supabase (SQL Editor) o en psql
-- =============================================================
-- Este script es idempotente: se puede ejecutar cuantas veces se
-- quiera sin error. Como un mapa con la X grabada en piedra. 🗺️

-- 1) Formatos de venta por producto (bolsa 250g, 1kg, bulto, etc.)
--    El precio de cada formato lo define el equipo (manual, decisión de negocio).
CREATE TABLE IF NOT EXISTS public.formatos_producto (
  id_formato   serial PRIMARY KEY,
  id_producto  integer NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
  etiqueta     varchar NOT NULL,
  peso_kg      numeric NOT NULL,
  precio       numeric NOT NULL,
  imagen_url   varchar,
  activo       boolean NOT NULL DEFAULT true
);

-- 2) Escalones globales de descuento por volumen de café (kg totales del pedido)
CREATE TABLE IF NOT EXISTS public.descuentos_volumen (
  id_descuento  serial PRIMARY KEY,
  kg_min        numeric NOT NULL,
  kg_max        numeric,
  descuento_pct numeric NOT NULL,
  activo        boolean NOT NULL DEFAULT true
);

-- 3) Semilla de escalones (los mismos que ya mostraba el modal del catálogo)
INSERT INTO public.descuentos_volumen (kg_min, kg_max, descuento_pct)
SELECT 6, 20, 9
WHERE NOT EXISTS (SELECT 1 FROM public.descuentos_volumen WHERE kg_min = 6 AND kg_max = 20);

INSERT INTO public.descuentos_volumen (kg_min, kg_max, descuento_pct)
SELECT 21, NULL, 16
WHERE NOT EXISTS (SELECT 1 FROM public.descuentos_volumen WHERE kg_min = 21 AND kg_max IS NULL);

-- 4) EJEMPLO de formatos para un producto (cambia el id_producto por uno real
--    y ajusta precios a tu gusto). Descomentar y ejecutar por producto:
--
-- INSERT INTO public.formatos_producto (id_producto, etiqueta, peso_kg, precio) VALUES
--   (1, 'Bolsa 250g',  0.25, 8000),
--   (1, 'Bolsa 500g',  0.50, 15000),
--   (1, 'Paquete 1kg', 1.00, 28000),
--   (1, 'Paquete 5kg', 5.00, 125000),
--   (1, 'Bulto 50kg',  50.0, 1100000);
