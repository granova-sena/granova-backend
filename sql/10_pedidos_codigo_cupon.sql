-- =============================================================
-- Granova — Agregar descuento + codigo_cupon a la tabla pedidos
-- Aplicar en Supabase (SQL Editor): pegar TODO y Run
-- =============================================================
-- Estas columnas son necesarias para que crearPedido funcione.
-- Si la tabla ya tiene estas columnas, ADD COLUMN IF NOT EXISTS
-- no hará nada (idempotente).

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS descuento numeric NOT NULL DEFAULT 0;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS codigo_cupon varchar(50);
