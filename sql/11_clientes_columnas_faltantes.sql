-- =============================================================
-- Granova — Columnas faltantes en clientes
-- Aplicar en Supabase SQL Editor: pegar TODO y Run
-- =============================================================
-- La tabla clientes no tiene estas columnas en producción.
-- Las migraciones anteriores (01) nunca se aplicaron para estas columnas.
-- Idempotente: se puede ejecutar cuantas veces se quiera.

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS fecha_creacion timestamp NOT NULL DEFAULT NOW();

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS tipo_cliente varchar NOT NULL DEFAULT 'minorista'
        CHECK (tipo_cliente IN ('minorista','mayorista'));
