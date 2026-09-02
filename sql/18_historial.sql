-- Granova — Historial de empleados: asegura la columna fecha en procesamientos_lote.
-- El historial del empleado consulta pl.fecha; el INSERT del módulo no la inserta,
-- así que garantizamos que exista (con default) de forma idempotente.
ALTER TABLE public.procesamientos_lote
  ADD COLUMN IF NOT EXISTS fecha timestamptz DEFAULT now();