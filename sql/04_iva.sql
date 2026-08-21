-- =============================================================
-- Granova — IVA (Jhon): precios con IVA incluido
-- Aplicar manualmente en Supabase (SQL Editor) o en psql
-- =============================================================
-- Los precios de productos YA traen el IVA adentro (precio final al cliente).
-- Esta columna registra la tasa de cada producto para que Daniel pueda
-- extraer el IVA al emitir la factura DIAN:
--   - Café tostado/molido: 5%  (default)
--   - Máquinas:            19% (el equipo actualiza cada máquina)
--   - Café verde/sin tostar: 0% (excluido)
-- Idempotente: se puede ejecutar cuantas veces se quiera. 🗺️

ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS iva_pct numeric NOT NULL DEFAULT 5;

-- Ejemplos para actualizar máquinas y café verde (ejecutar según aplique):
-- UPDATE public.productos SET iva_pct = 19 WHERE categoria_producto = 'maquina';
-- UPDATE public.productos SET iva_pct = 0  WHERE ... (café verde/sin tostar)
