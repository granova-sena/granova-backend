-- =============================================================
-- Granova — Alineación del esquema de promociones (Jhon)
-- Aplicar manualmente en Supabase (SQL Editor) o en psql.
-- =============================================================
-- Motivo: el script 07_promociones.sql solo creaba las columnas
-- descuento_pct (numeric) y activo (boolean), pero el backend y el
-- panel admin leen tipo_descuento, valor_descuento y estado.
-- Este script hace el esquema de promociones seguro sin importar
-- en qué estado quedó: idempotente y no borra nada existente.
--
-- El código esperaba:
--   tipo_descuento  varchar  ('porcentaje' | 'monto_fijo')
--   valor_descuento numeric
--   estado          varchar  ('activa' | 'inactiva' | 'finalizada')
-- En 07 se crearon:
--   descuento_pct  numeric
--   activo         boolean
-- =============================================================

ALTER TABLE public.promociones
  ADD COLUMN IF NOT EXISTS tipo_descuento varchar NOT NULL DEFAULT 'porcentaje';

ALTER TABLE public.promociones
  ADD COLUMN IF NOT EXISTS valor_descuento numeric;

ALTER TABLE public.promociones
  ADD COLUMN IF NOT EXISTS estado varchar NOT NULL DEFAULT 'activa';

-- Backfill desde las columnas viejas. Solo corre si la tabla usa el
-- esquema viejo (existe descuento_pct); si ya tiene el esquema nuevo
-- con valor_descuento poblado, no hace nada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'promociones'
       AND column_name = 'descuento_pct'
  ) THEN
    UPDATE public.promociones
       SET valor_descuento = descuento_pct
     WHERE valor_descuento IS NULL;
  END IF;
END $$;

-- Las filas existentes quedaron con 'activa' (default) al crear la columna:
-- sí activo era false (y existe), pásalas a 'inactiva'. No toca estados
-- manuales (finalizada, inactiva) porque esas ya no son el default 'activa'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'promociones'
       AND column_name = 'activo'
  ) THEN
    UPDATE public.promociones
       SET estado = 'inactiva'
     WHERE activo IS FALSE AND estado = 'activa';
  END IF;
END $$;

-- Verificación (debe responder algo como: tipo_descuento, valor_descuento, estado, fecha_fin)
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'promociones' ORDER BY ordinal_position;