-- =============================================================
-- Granova — Stock por formato (bolsas) conectado a la distribución del empleado
-- Aplicar en Supabase (SQL Editor) antes del deploy
-- =============================================================
-- 1) Cada formato (bolsa 250g, paquete 1kg...) ahora lleva su propio stock en unidades
ALTER TABLE public.formatos_producto
  ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0;

-- 2) Enlaza el formato con la presentación que reparte el empleado en Procesar/Cosechas
ALTER TABLE public.formatos_producto
  ADD COLUMN IF NOT EXISTS id_presentacion integer
  REFERENCES public.presentaciones_catalogo(id_presentacion) ON DELETE SET NULL;

-- 3) Migración de legado (mejor esfuerzo): el stock viejo del producto (que en realidad
--    eran unidades) se asigna al formato MÁS BARATO del producto, que es el que la card
--    del catálogo muestra como "Desde". Los demás formatos arrancan en 0 y se llenan
--    con las próximas distribuciones del empleado.
UPDATE public.formatos_producto f
SET stock = p.stock
FROM public.productos p
WHERE p.id_producto = f.id_producto
  AND f.stock = 0
  AND f.id_formato = (
    SELECT f2.id_formato
    FROM public.formatos_producto f2
    WHERE f2.id_producto = p.id_producto AND f2.activo = true
    ORDER BY f2.precio ASC
    LIMIT 1
  );
