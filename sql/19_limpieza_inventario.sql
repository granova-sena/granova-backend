-- 19_limpieza_inventario.sql
-- Limpieza/coherencia de datos de demo: fincas, lotes, productos y formatos.
-- Idempotente: puede reejecutarse sin duplicar ni romper nada.
BEGIN;

-- =============================================================
-- 1) LOTES: eliminar saldos fantasma de kg_en_proceso que quedaron
--    de corridas antiguas (imposibles: > que la capacidad del lote).
-- =============================================================
UPDATE lotes SET kg_en_proceso = 0 WHERE id_lote IN (3, 7, 9) AND kg_en_proceso > 0;

-- =============================================================
-- 2) LOTES de prueba sin ninguna referencia (productos, entregas,
--    cosechas, procesamientos, eventos, etapas): se eliminan.
--    finca 14 "Finca" solo la usa el lote 17.
-- =============================================================
DELETE FROM lotes WHERE id_lote IN (11, 17);
DELETE FROM fincas WHERE id = 14;

-- =============================================================
-- 3) Estado de cada lote coherente con su capacidad real:
--    disponible = cantidad_kg - kg_perdido - kg_en_proceso
-- =============================================================
UPDATE lotes l
SET estado = CASE
  WHEN (l.cantidad_kg - COALESCE(l.kg_perdido, 0) - COALESCE(l.kg_en_proceso, 0)) <= 0
    THEN 'agotado'
  ELSE 'disponible'
END;

-- =============================================================
-- 4) PRODUCTOS: inactivar café viejo / de prueba (no se borran para
--    conservar historial de pedidos, reseñas y formatos).
--    NO se tocan las máquinas (70-77).
-- =============================================================
UPDATE productos SET estado = 'inactivo'
WHERE id_producto IN (38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
                      50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
                      62, 63, 64, 65, 66, 67, 68, 69, 78, 79, 88)
  AND categoria_producto = 'cafe';

-- =============================================================
-- 5) Productos canónicos existentes con precio 0 (se crearon de un
--    lote sin costo base): fijar precio por variedad.
--    lote 4 Caturra -> 28.000 | lote 9 Castillo -> 30.000
-- =============================================================
UPDATE productos SET
  precio           = 28000,
  precio_mayorista = round(28000 / 1.3),
  costo_unitario   = round(28000 / 1.56)
WHERE id_producto IN (86, 87) AND precio = 0;

UPDATE productos SET
  precio           = 30000,
  precio_mayorista = round(30000 / 1.3),
  costo_unitario   = round(30000 / 1.56)
WHERE id_producto IN (89, 90, 91) AND precio = 0;

-- =============================================================
-- 6) CREAR catálogo canónico de café: por cada lote con finca las 3
--    presentaciones del sistema (250 g / 500 g / 1 kg), coherentes
--    con confirmarCosecha (id_presentacion 1, 2, 3 y mismo formato de
--    nombre). Guard NOT EXISTS por (id_lote, id_presentacion) activo
--    para no duplicar al reejecutar. Lote 4 ya tiene 250g(86) y 1kg(87)
--    por lo que solo se crea el 500g.
-- =============================================================
INSERT INTO productos (nombre, presentacion, precio, precio_mayorista, costo_unitario,
                       stock, estado, tipo_cafe, id_presentacion, id_lote, categoria_producto, creado_por)
SELECT concat(lv.variedad, ' · ', pc.nombre, ' · ', lv.finca),
       pc.nombre,
       lv.precio, round(lv.precio / 1.3), round(lv.precio / 1.56),
       CASE pc.id_presentacion WHEN 1 THEN 100 WHEN 2 THEN 60 ELSE 40 END,
       'activo', 'grano',
       pc.id_presentacion, lv.id_lote, 'cafe', 3
FROM (VALUES
  (3,  'Bourbon Rosado', 'Finca El Vergel',   52000),
  (4,  'Caturra',        'Finca El Vergel',   28000),
  (5,  'Geisha',         'Finca La Rivera',   85000),
  (6,  'Castillo',       'Finca La Rivera',   30000),
  (7,  'Tabi',           'Finca El Mirador',  48000),
  (8,  'Colombia',       'Finca El Mirador',  34000),
  (10, 'Caturra',        'Finca La Grecia',   28000)
) AS lv(id_lote, variedad, finca, precio)
JOIN presentaciones_catalogo pc ON true
WHERE NOT EXISTS (
  SELECT 1 FROM productos p
  WHERE p.id_lote = lv.id_lote
    AND p.id_presentacion = pc.id_presentacion
    AND p.estado = 'activo'
    AND p.categoria_producto = 'cafe'
);

-- =============================================================
-- 7) FORMATOS: garantizar que cada producto canónico activo tenga su
--    formato por presentación (con peso, precio y stock coherentes).
-- =============================================================
INSERT INTO formatos_producto (etiqueta, peso_kg, precio,
                               stock, activo, id_presentacion, id_producto)
SELECT pc.nombre, pc.kg_equivalente,
       p.precio,
       p.stock, true, pc.id_presentacion, p.id_producto
FROM productos p
JOIN presentaciones_catalogo pc ON p.id_presentacion = pc.id_presentacion
WHERE p.categoria_producto = 'cafe' AND p.estado = 'activo'
  AND NOT EXISTS (
    SELECT 1 FROM formatos_producto f
    WHERE f.id_producto = p.id_producto AND f.id_presentacion = pc.id_presentacion
  );

-- Sincronizar el precio de formatos ya existentes de los canónicos
-- (quedaron en 0 al crearse con confirmarCosecha).
UPDATE formatos_producto f
SET precio = p.precio
FROM productos p
WHERE f.id_producto = p.id_producto AND p.id_producto IN (86, 87, 89, 90, 91);

-- =============================================================
-- 8) ENTREGA del lote 7 (Tabi) con kg_netos NULL: aplicar el mismo
--    factor de merma que produce el sistema (×0.82  observado: solo
--    merma de tostado → 190 × 0.82 = 155.8).
-- =============================================================
UPDATE entregas_finca SET kg_netos = 155.8
WHERE id_lote = 7 AND kg_netos IS NULL;

COMMIT;

-- Resumen para verificación
SELECT 'lotes' AS tabla, count(*) AS total FROM lotes
UNION ALL SELECT 'productos activos', count(*) FROM productos WHERE estado = 'activo' AND categoria_producto = 'cafe'
UNION ALL SELECT 'formatos activos', count(*) FROM formatos_producto WHERE activo = true;