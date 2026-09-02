-- =============================================================
-- Granova — Alineación de columnas de clientes (Jhon)
-- Aplicar en Supabase (SQL Editor): pegar TODO y Run
-- =============================================================
-- Dotar a clientes de fecha_registro y estado, usadas por el
-- dashboard/reportes (clientes nuevos del mes y clientes activos).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS fecha_registro timestamp,
  ADD COLUMN IF NOT EXISTS estado varchar NOT NULL DEFAULT 'activo';

-- Respaldar la fecha existente si la columna estaba vacía.
UPDATE public.clientes
SET fecha_registro = COALESCE(fecha_registro, fecha_creacion)
WHERE fecha_registro IS NULL;

-- Verificación: fecha_registro y estado deben existir.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'clientes' AND column_name IN ('fecha_registro', 'estado')
ORDER BY column_name;