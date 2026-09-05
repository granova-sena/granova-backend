-- =============================================================================
-- 32. Alinear productos.stock con formatos_producto.stock (conteo físico real)
-- -----------------------------------------------------------------------------
-- El stock real (conteo de bodega / lo que ve el cliente en "quedan N") vive en
-- formatos_producto.stock. productos.stock estaba desfasado porque algunos
-- caminos históricos solo decrementaban productos.stock.
--
-- Regla de esta migración (aprobada): para los productos listados, fijar
-- productos.stock = formatos_producto.stock. Quedan EXCLUIDOS (limpieza aparte):
--   - Café Bourbon Rosado - Finca El Vergel  (multi-formato, f=1840/0/0/0/0)
--   - Bourbon Rosado · 1 kg · Finca El Vergel (f = 0)
--   - Cafe AAA                                (p=1596 vs f=1000)
--   - Caturra · 500 g · Finca La Grecia       (p=300 vs f=60)
--
-- Ejecutar UNA sola vez, DESPUÉS de desplegar el backend (el fix de
-- restablecerProducto evita que el panel vuelva a desfasarla).
-- =============================================================================

BEGIN;

UPDATE productos SET stock = 100 WHERE id_producto = 145; -- Castillo 1kg La Rivera      (99 → 100)
UPDATE productos SET stock = 200 WHERE id_producto = 132; -- Castillo 250g La Rivera     (197 → 200)
UPDATE productos SET stock = 49  WHERE id_producto = 91;  -- Castillo 1kg La Grecia      (45 → 49)
UPDATE productos SET stock = 120 WHERE id_producto = 89;  -- Castillo 250g La Grecia     (118 → 120)
UPDATE productos SET stock = 222 WHERE id_producto = 87;  -- Caturra 1kg El Vergel       (216 → 222)
UPDATE productos SET stock = 100 WHERE id_producto = 86;  -- Caturra 250g El Vergel      (97 → 100)
UPDATE productos SET stock = 60  WHERE id_producto = 137; -- Caturra 500g El Vergel      (55 → 60)
UPDATE productos SET stock = 260 WHERE id_producto = 140; -- Tabi 500g El Mirador        (258 → 260)
UPDATE productos SET stock = 100 WHERE id_producto = 130; -- Bourbon 250g El Vergel      (43 → 100)
UPDATE productos SET stock = 60  WHERE id_producto = 136; -- Bourbon 500g El Vergel      (48 → 60)

-- -----------------------------------------------------------------------------
-- Verificación: debe devolver 0 filas (ningún desfase en productos con formato).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  desfases INT;
BEGIN
  SELECT COUNT(*) INTO desfases
  FROM productos p
  JOIN formatos_producto f ON f.id_producto = p.id_producto AND f.activo = true
  WHERE p.stock <> f.stock
    -- Outliers que se limpian aparte (por definición quedan desfasados aquí):
    -- 38 Café Bourbon Rosado - El Vergel (multi-formato), 79 Cafe AAA,
    -- 142 Caturra 500g La Grecia, 143 Bourbon Rosado 1kg El Vergel (f=0).
    AND p.id_producto NOT IN (38, 79, 142, 143);

  IF desfases > 0 THEN
    RAISE EXCEPTION 'Quedan % producto(s) desfasado(s) tras la alineación', desfases;
  END IF;
END $$;

COMMIT;