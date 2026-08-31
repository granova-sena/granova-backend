-- 20_imagenes_promos.sql
-- Corrige el impacto colateral de la limpieza (19): los productos canónicos
-- nacieron sin imagen y las ofertas apuntaban a productos viejos inactivos.
-- Idempotente.
BEGIN;

-- =============================================================
-- 1) IMÁGENES: copiar la imagen del producto viejo (inactivo) del
--    MISMO lote a su canónico activo, eligiendo la presentación más
--    cercana en peso (250g/500g/1kg), con fallback por lote.
-- =============================================================
UPDATE productos c
SET imagen_url = (
  SELECT v.imagen_url
  FROM productos v
  WHERE v.categoria_producto = 'cafe'
    AND v.estado = 'inactivo'
    AND v.id_lote = c.id_lote
    AND v.imagen_url IS NOT NULL
  ORDER BY abs(
    COALESCE(
      CASE WHEN v.presentacion LIKE '%1kg%'  THEN 1
           WHEN v.presentacion LIKE '%500%'  THEN 0.5
           WHEN v.presentacion LIKE '%340%'  THEN 0.34
           WHEN v.presentacion LIKE '%250%'  THEN 0.25
      END, 999999) -
    CASE c.id_presentacion WHEN 1 THEN 0.25 WHEN 2 THEN 0.5 WHEN 3 THEN 1 ELSE 999999 END
  ),
  v.id_producto
  LIMIT 1
)
WHERE c.categoria_producto = 'cafe'
  AND c.estado = 'activo'
  AND c.imagen_url IS NULL;

-- =============================================================
-- 2) OFERTAS: re-apuntar promocion_productos de los productos viejos
--    (inactivos) a los canónicos activos del mismo lote.
--    6  Bourbon Rosado   -> lotes 3
--    7  Café Geisha      -> lote 5
--    8  Línea Caturra    -> lote 4
--    10 oferta "30%"     -> la 500g canónica del lote 4 (antes "Cafe AAA")
-- =============================================================
DELETE FROM promocion_productos WHERE id_promocion IN (6, 7, 8);

INSERT INTO promocion_productos (id_promocion, id_producto)
SELECT 6, id_producto FROM productos WHERE id_lote = 3  AND categoria_producto = 'cafe' AND estado = 'activo';

INSERT INTO promocion_productos (id_promocion, id_producto)
SELECT 7, id_producto FROM productos WHERE id_lote = 5  AND categoria_producto = 'cafe' AND estado = 'activo';

INSERT INTO promocion_productos (id_promocion, id_producto)
SELECT 8, id_producto FROM productos WHERE id_lote = 4  AND categoria_producto = 'cafe' AND estado = 'activo';

UPDATE promocion_productos
SET id_producto = 137
WHERE id_promocion = 10 AND id_producto = 79;

-- =============================================================
-- 3) Resumen: verificación
-- =============================================================
SELECT 'cafes con imagen' AS concepto, count(*) AS total FROM productos
 WHERE categoria_producto = 'cafe' AND estado = 'activo' AND imagen_url IS NOT NULL
UNION ALL
SELECT 'renglones promo activos', count(*) FROM promocion_productos pp
 JOIN productos p ON p.id_producto = pp.id_producto
 WHERE p.estado = 'activo';

COMMIT;