-- =============================================================
-- Granova — Agregar codigo_cupon a la tabla pedidos
-- Aplicar en Supabase (SQL Editor): pegar TODO y Run
-- =============================================================
-- La columna permite registrar qué cupón se usó en cada pedido
-- para auditoría y para que confirmarPedido pueda marcarlo como usado.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS codigo_cupon varchar(50) NULL;
