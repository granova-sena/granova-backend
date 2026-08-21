-- =============================================================
-- Granova — Premio acumulativo (Jhon)
-- Aplicar manualmente en Supabase (SQL Editor) o en psql
-- =============================================================
-- Regla nueva: cada compra SUMA unidades al contador del cliente.
-- Al llegar a 5 (comprando por partes o de una vez) gana el 10%
-- para su próxima compra y el contador se reinicia a 0.
-- Idempotente: se puede ejecutar cuantas veces se quiera. 🗺️

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS unidades_acumuladas integer NOT NULL DEFAULT 0;
