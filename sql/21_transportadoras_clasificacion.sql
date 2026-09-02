-- =============================================================
-- Granova — Transportadoras: solo se clasifican como Acarreo o Reparto
-- (se elimina el flujo visible de Activo/Inactivo).
-- Aplicar en Supabase (SQL Editor) — idempotente.
-- =============================================================

-- 1) Unificar casos ("Domiciliario" -> Reparto)
UPDATE public.transportadoras
SET tipo = 'Reparto'
WHERE tipo = 'Domiciliario';

-- 2) Garantizar que solo existan Acarreo o Reparto
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'c'
      AND conname LIKE 'transportadoras%check%'
      AND conrelid = 'public.transportadoras'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.transportadoras DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.transportadoras
  ADD CONSTRAINT transportadoras_tipo_check
  CHECK (tipo IN ('Acarreo', 'Reparto'));

-- 3) Como ya no se gestiona Activo/Inactivo, todo queda operativo
UPDATE public.transportadoras SET estado = 'Activo' WHERE estado IS NULL;