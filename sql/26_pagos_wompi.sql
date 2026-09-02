-- ─────────────────────────────────────────
-- SQL 26 · Pagos Wompi (pasarela real, modo TEST)
-- Añade la trazabilidad de la transacción de Wompi al pedido.
-- Ejecutar UNA vez en el SQL Editor de Supabase (es idempotente).
-- ─────────────────────────────────────────

-- Identificador de la transacción de Wompi asociada al pedido
-- (se usa para el webhook y el polling del estado del pago).
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- Índice para localizar el pedido por transacción de Wompi.
CREATE INDEX IF NOT EXISTS idx_pedidos_payment_intent
  ON public.pedidos (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;