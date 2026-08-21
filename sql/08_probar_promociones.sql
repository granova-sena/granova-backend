-- =============================================================
-- GRANOVA — SCRIPT DE PRUEBA: PROMOCIONES REALES
-- =============================================================
-- Tablas REALES del proyecto:
--   - promociones (con valor_descuento, estado)
--   - promocion_productos (con id_promocion + id_producto)
-- =============================================================


-- ════════════════════════════════════════════════════════════
-- PASO 1: VERIFICAR QUE LAS PROMOS EXISTEN
-- ════════════════════════════════════════════════════════════
SELECT id_promocion, nombre, tipo_descuento, valor_descuento, estado, fecha_fin
FROM promociones
ORDER BY id_promocion;


-- ════════════════════════════════════════════════════════════
-- PASO 2: ASOCIAR PRODUCTOS A LAS PROMOS
-- ════════════════════════════════════════════════════════════
-- Promos creadas: 6 (15%), 7 (20%), 8 (10%)

-- Promo 6 (15%): Café Bourbon Rosado
INSERT INTO public.promocion_productos (id_promocion, id_producto) VALUES
  (6, 38), (6, 40), (6, 41);

-- Promo 7 (20%): Café Geisha
INSERT INTO public.promocion_productos (id_promocion, id_producto) VALUES
  (7, 46), (7, 47), (7, 48);

-- Promo 8 (10%): Café Caturra
INSERT INTO public.promocion_productos (id_promocion, id_producto) VALUES
  (8, 42), (8, 43), (8, 44), (8, 45);


-- ════════════════════════════════════════════════════════════
-- PASO 3: VERIFICAR QUE TODO QUEDÓ BIEN
-- ════════════════════════════════════════════════════════════
SELECT
  p.id_promocion,
  p.nombre AS promocion,
  p.valor_descuento || '%' AS descuento,
  TO_CHAR(p.fecha_fin, 'DD/MM/YYYY') AS vence,
  STRING_AGG(pr.nombre, ' | ') AS productos
FROM promociones p
JOIN promocion_productos pp ON pp.id_promocion = p.id_promocion
JOIN productos pr ON pr.id_producto = pp.id_producto
WHERE p.estado = 'activa'
GROUP BY p.id_promocion
ORDER BY p.fecha_fin;


-- ════════════════════════════════════════════════════════════
-- PASO 4: VER PRECIOS CON DESCUENTO
-- ════════════════════════════════════════════════════════════
SELECT
  p.id_producto,
  p.nombre,
  p.precio AS precio_original,
  pr.valor_descuento AS descuento_pct,
  ROUND(p.precio * (1 - pr.valor_descuento / 100)) AS precio_con_descuento,
  pr.nombre AS nombre_promocion
FROM productos p
JOIN promocion_productos pp ON pp.id_producto = p.id_producto
JOIN promociones pr ON pr.id_promocion = pp.id_promocion
WHERE pr.estado = 'activa'
  AND CURRENT_DATE BETWEEN pr.fecha_inicio AND pr.fecha_fin
ORDER BY p.nombre;
