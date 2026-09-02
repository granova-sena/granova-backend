-- =============================================================
-- Granova — Los pedidos ya NO nacen 'pendiente': nacen 'confirmado'.
-- Aplicar en Supabase (SQL Editor) ANTES del redeploy.
-- =============================================================

-- 1) Cambiar el valor por defecto de la columna estado
ALTER TABLE public.pedidos
  ALTER COLUMN estado SET DEFAULT 'confirmado';

-- 2) Migrar los pedidos actuales que estén 'pendiente' a 'confirmado'
--    (no toca rechazados ni cancelados)
UPDATE public.pedidos
SET estado = 'confirmado'
WHERE estado = 'pendiente';

-- 3) (Opcional) Verificar el resultado
SELECT estado, COUNT(*) AS total
FROM public.pedidos
GROUP BY estado
ORDER BY estado;

SELECT metodo_pago, estado_pago, estado, COUNT(*) AS total
FROM public.pedidos
GROUP BY metodo_pago, estado_pago, estado
ORDER BY metodo_pago, estado_pago, estado;