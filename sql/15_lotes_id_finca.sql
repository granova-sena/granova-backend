-- Granova — Relacionar lotes con fincas por ID (columna id_finca)
-- Ejecutarlo UNA sola vez en el SQL Editor de Supabase (o psql con el owner).
-- IMPORTANTE: ejecutar ESTE script ANTES de desplegar el código que usa id_finca.
-- Paso 4 es destructivo: elimina fincas duplicadas conservando la de menor id
-- (los lotes se conservan porque se vuelven a apuntar a la finca que queda).

-- 1) Columna id_finca en lotes
ALTER TABLE public.lotes
  ADD COLUMN IF NOT EXISTS id_finca integer;

-- 2) Backfill: asocia cada lote a su finca usando el nombre.
--    Se usa MIN(id) para que sea determinista aunque aún existan duplicados.
UPDATE public.lotes l
SET id_finca = (SELECT MIN(f.id) FROM public.fincas f WHERE f.nombre = l.finca)
WHERE l.id_finca IS NULL AND l.finca IS NOT NULL;

-- 3) Redirige filas de cualquier tabla con FK hacia fincas(id) a la finca
--    conservada, para que el DELETE del punto 4 no falle ni deje huérfanos.
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

-- 4) Elimina fincas duplicadas (conserva la de menor id)
DELETE FROM public.fincas a
USING public.fincas b
WHERE a.id > b.id
  AND LOWER(a.nombre) = LOWER(b.nombre);

-- 5) Llave foránea: lotes.id_finca -> fincas.id
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