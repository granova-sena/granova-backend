-- =============================================================
-- Granova — Frente D (Jhon): Programa de Lealtad
-- Aplicar manualmente en Supabase (SQL Editor) o en psql
-- =============================================================
-- Reglas:
--   - 1 punto por cada $1.000 pagados (total final del pedido).
--   - Canje: 500 puntos → cupón 5% | 1.000 puntos → cupón 10%.
--   - El cupón dura 30 días, es de un solo uso y respeta "el mayor gana".
-- Idempotente: se puede ejecutar cuantas veces se quiera. 🗺️

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS puntos integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.cupones (
  id_cupon            serial PRIMARY KEY,
  id_cliente          integer NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  codigo              varchar NOT NULL UNIQUE,
  descuento_pct       numeric NOT NULL,
  usado               boolean NOT NULL DEFAULT false,
  fecha_creacion      timestamp NOT NULL DEFAULT NOW(),
  fecha_vencimiento   timestamp NOT NULL
);
