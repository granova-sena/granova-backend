-- =============================================================
-- Granova — Reparación de la tabla cupones (Jhon)
-- Aplicar en Supabase (SQL Editor): pegar TODO y Run
-- =============================================================
-- Problema: la tabla "cupones" fue creada por el asistente de IA de
-- Supabase con columnas distintas y le falta "id_cliente".
-- Como nunca se pudo crear un cupón (la tabla está vacía), lo más
-- limpio es borrarla y recrearla con las columnas correctas. 🗺️

-- 1) Diagnóstico ANTES de reparar (opcional pero recomendado):
--    mira qué columnas tienen las tablas nuevas
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('cupones', 'formatos_producto', 'descuentos_volumen')
ORDER BY table_name, ordinal_position;

-- 2) Reparar cupones: borrar la tabla incompleta (está vacía, sin riesgo)
DROP TABLE IF EXISTS public.cupones;

-- 3) Recrear con las columnas que espera el backend
CREATE TABLE IF NOT EXISTS public.cupones (
  id_cupon            serial PRIMARY KEY,
  id_cliente          integer NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  codigo              varchar NOT NULL UNIQUE,
  descuento_pct       numeric NOT NULL,
  usado               boolean NOT NULL DEFAULT false,
  fecha_creacion      timestamp NOT NULL DEFAULT NOW(),
  fecha_vencimiento   timestamp NOT NULL
);

-- 4) Verificación DESPUÉS de reparar: debe salir:
--    cupones con 7 columnas: id_cupon, id_cliente, codigo, descuento_pct,
--    usado, fecha_creacion, fecha_vencimiento
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name = 'cupones'
ORDER BY ordinal_position;

-- 5) OJO con las otras tablas: si en el paso 1 viste que
--    formatos_producto o descuentos_volumen tienen columnas raras,
--    NO las borres a lo loco (formatos_producto YA tiene datos reales
--    como los formatos del producto 38). Cuéntame qué salió en el
--    diagnóstico y te paso el ALTER exacto para corregirlas sin perder datos.
