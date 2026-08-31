-- Granova — Diagnóstico y reparación de fincas duplicadas + lotes sin id_finca
-- Ejecutarlo en el SQL Editor de Supabase (o psql con el owner).
-- ORDEN RECOMENDADO:
--   A) DIAGNÓSTICO (solo lectura, para ver qué hay mal)
--   B) REPARAR (ejecutar en orden: 1 → 2 → 3 → 4 → 5)
--
-- IMPORTANTE: las queries de DIAGNÓSTICO A2 y A3 consultan la columna
-- l.id_finca. Si aún NO existe esa columna (error "column l.id_finca does
-- not exist"), Ejecuta PRIMERO el punto B1 (ALTER TABLE que crea la
-- columna) y luego ejecuta A2/A3. B1 es idempotente y NO borra nada.

-- ============================================================
-- A) DIAGNÓSTICO (solo lectura)
-- ============================================================

-- A1) Fincas duplicadas (mismo nombre ignorando mayúsculas)
SELECT LOWER(nombre) AS nombre_normalizado,
       COUNT(*)      AS total,
       array_agg(id ORDER BY id) AS ids
FROM fincas
GROUP BY LOWER(nombre)
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- A2) Lotes que NO tienen id_finca (falta asociarlos a su finca)
SELECT l.id_lote,
       l.codigo_lote,
       l.finca  AS nombre_finca_por_texto,
       l.id_finca
FROM lotes l
WHERE l.id_finca IS NULL
ORDER BY l.codigo_lote;

-- A3) Lotes cuyo id_finca NO coincide con su finca por texto (desincronizados)
SELECT l.id_lote,
       l.codigo_lote,
       l.finca AS nombre_finca_por_texto,
       l.id_finca,
       f.nombre AS nombre_finca_por_id
FROM lotes l
LEFT JOIN fincas f ON f.id = l.id_finca
WHERE l.finca IS NOT NULL
  AND (
        l.id_finca IS NULL
        OR LOWER(f.nombre) IS DISTINCT FROM LOWER(l.finca)
      )
ORDER BY l.codigo_lote;

-- A4) Fincas visibles/ocultas para el cliente (listarFincas filtra estado = 'activa')
SELECT id, nombre, estado, region, altitud
FROM fincas
ORDER BY estado, nombre;

-- A5) Fincas que creaste pero NO se muestran (probable causa: estado NO es 'activa' o quedó duplicada)
SELECT id, nombre, estado, LOWER(nombre) AS nombre_normalizado
FROM fincas
WHERE estado <> 'activa'
   OR LOWER(nombre) IN (
        SELECT LOWER(nombre) FROM fincas GROUP BY LOWER(nombre) HAVING COUNT(*) > 1
   )
ORDER BY nombre, id;

-- ============================================================
-- B) REPARAR (ejecutar UNA sola vez, en este orden)
-- ============================================================

-- 1) Columna id_finca en lotes (idempotente)
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS id_finca integer;

-- 2) Backfill: asocia cada lote a SU finca por nombre usando MIN(id)
--    (conserva la finca de menor id cuando hay duplicados).
UPDATE public.lotes l
SET id_finca = (
    SELECT MIN(f.id)
    FROM public.fincas f
    WHERE LOWER(f.nombre) = LOWER(l.finca)
)
WHERE l.finca IS NOT NULL
  AND (
        l.id_finca IS NULL
        OR NOT EXISTS (SELECT 1 FROM public.fincas fc WHERE fc.id = l.id_finca)
      );

-- 3) Redirige filas con FK hacia fincas(id) a la finca conservada,
--    para que el DELETE del punto 4 no falle ni deje huérfanos.
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT
      kcu.table_name  AS tab,
      kcu.column_name AS col
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name
      AND kcu.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = rc.constraint_name
      AND ccu.constraint_schema = rc.constraint_schema
    WHERE rc.constraint_schema = 'public'
      AND ccu.table_name = 'fincas'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format(
      'UPDATE %I AS t SET %I = keep.id
       FROM public.fincas AS dup
       JOIN public.fincas AS keep ON LOWER(keep.nombre) = LOWER(dup.nombre)
       WHERE t.%I = dup.id AND dup.id > keep.id',
      fk.tab, fk.col, fk.col
    );
  END LOOP;
END $$;

-- 4) Elimina fincas DUPLICADAS (conserva la de menor id).
--    OJO: si la finca "que no se muestra" es un duplicado, al ejecutar este
--    borrado desaparecerá y sus lotes quedarán apuntando a la finca buena.
DELETE FROM public.fincas a
USING public.fincas b
WHERE a.id > b.id
  AND LOWER(a.nombre) = LOWER(b.nombre);

-- 5) Llave foránea: lotes.id_finca -> fincas.id (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lotes_id_finca_fkey') THEN
    ALTER TABLE public.lotes
      ADD CONSTRAINT lotes_id_finca_fkey
      FOREIGN KEY (id_finca) REFERENCES public.fincas(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 6) Evita fincas duplicadas en el futuro (insensible a mayúsculas)
CREATE UNIQUE INDEX IF NOT EXISTS fincas_nombre_lower_uq
  ON public.fincas (LOWER(nombre));

-- ============================================================
-- C) VERIFICACIÓN (después de reparar)
-- ============================================================

-- C1) Ya no debería haber duplicados
SELECT LOWER(nombre) AS nombre_normalizado, COUNT(*) AS total
FROM fincas GROUP BY LOWER(nombre) HAVING COUNT(*) > 1;

-- C2) Ya no debería haber lotes sin id_finca (salvo lotes sin nombre de finca)
SELECT id_lote, codigo_lote, finca, id_finca
FROM lotes WHERE id_finca IS NULL;

-- C3) Vista final: lotes con su finca (para el panel de Control de lotes)
SELECT l.id_lote,
       l.codigo_lote,
       f.id   AS id_finca,
       f.nombre AS finca_nombre,
       l.variedad,
       l.cantidad_kg,
       l.kg_perdido,
       l.kg_en_proceso,
       l.estado
FROM lotes l
LEFT JOIN fincas f ON f.id = l.id_finca
ORDER BY f.nombre, l.codigo_lote;

-- C4) Vista final: fincas activas que verá el cliente en el mapa
SELECT id, nombre, lat, lng, altitud, region
FROM fincas
WHERE estado = 'activa'
ORDER BY nombre;
