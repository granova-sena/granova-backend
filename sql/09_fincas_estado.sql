-- Granova — Agregar columna estado a fincas
-- Permite activar/desactivar fincas sin borrarlas
-- Idempotente: se puede ejecutar varias veces sin error

ALTER TABLE public.fincas
  ADD COLUMN IF NOT EXISTS estado varchar NOT NULL DEFAULT 'activa';

-- Asegurar que todas las fincas existentes queden activas
UPDATE public.fincas SET estado = 'activa' WHERE estado IS NULL;
