-- =============================================================
-- Granova — Transportadoras ficticias de Ibagué (seed)
-- Llena la vista de Transportadoras (admin/empleado/logistica) con
-- datos inventados para pruebas/entrega, cubriendo TODOS los tipos:
--   tipo        -> 'Acarreo' | 'Reparto'
--   tipo_vehiculo -> Moto, Carro, Camioneta, Camión
-- Cada transportadora tiene la imagen de referencia de SU tipo de
-- vehículo (no una imagen estática).
-- Aplicar en Supabase (SQL Editor). Se puede correr varias veces
-- sin duplicar: los INSERT se guardan por placa o NIT.
-- =============================================================

-- 1) Columna de imagen (si no existe)
ALTER TABLE public.transportadoras
  ADD COLUMN IF NOT EXISTS imagen_url text;

-- 2) Normalizar 'tipo': 'Domiciliario' pasa a llamarse 'Reparto'
--    y se asegura que el CHECK permita Acarreo/Reparto.
UPDATE public.transportadoras SET tipo = 'Reparto' WHERE tipo = 'Domiciliario';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'transportadoras'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.transportadoras DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.transportadoras
  ADD CONSTRAINT transportadoras_tipo_check
  CHECK (tipo IN ('Acarreo','Reparto'));

-- 3) Estado por defecto 'Activo'
UPDATE public.transportadoras SET estado = 'Activo' WHERE estado IS NULL;

-- =============================================================
-- Imágenes de referencia (foto del vehículo del tipo que es)
-- =============================================================
-- Moto      : https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=60
-- Carro     : https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=400&q=60
-- Camioneta : https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60
-- Camión    : https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_juridica', 'Transportes Ibagué S.A.S.', '3165214870', 'Acarreo', NULL, '900101234-5', 6, 'Camión', 8000,
       'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE nit = '900101234-5');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_juridica', 'Fletes del Tolima Ltda.', '3157823601', 'Acarreo', NULL, '900278901-3', 4, 'Camioneta', 1500,
       'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE nit = '900278901-3');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_natural', 'Carlos Andrés Murillo', '3004596321', 'Acarreo', 'XFA-123', NULL, 1, 'Camioneta', 1200,
       'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE placa = 'XFA-123');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_natural', 'Jhon Fredy Rojas', '3145028765', 'Acarreo', 'TNP-456', NULL, 1, 'Carro', 500,
       'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE placa = 'TNP-456');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_natural', 'Luis Eduardo Montoya', '3114789034', 'Acarreo', 'TNR-789', NULL, 1, 'Camión', 6000,
       'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE placa = 'TNR-789');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_juridica', 'Reparto Express Ibagué S.A.S.', '3168901254', 'Reparto', NULL, '900412345-1', 10, 'Moto', 120,
       'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE nit = '900412345-1');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_natural', 'Diego Alejandro Torres', '3006789123', 'Reparto', 'TNA-234', NULL, 1, 'Moto', 100,
       'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE placa = 'TNA-234');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_natural', 'María Camila Gutiérrez', '3157890123', 'Reparto', 'TNB-567', NULL, 1, 'Moto', 100,
       'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE placa = 'TNB-567');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_juridica', 'Rutas Urbanas E.U.', '3134567890', 'Reparto', NULL, '900590123-7', 5, 'Carro', 400,
       'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE nit = '900590123-7');

INSERT INTO public.transportadoras
  (tipo_persona, nombre, telefono, tipo, placa, nit, vehiculos, tipo_vehiculo, capacidad_kg, imagen_url, estado)
SELECT 'persona_natural', 'Andrés Felipe Cardona', '3002113456', 'Reparto', 'TNC-890', NULL, 1, 'Carro', 450,
       'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=400&q=60', 'Activo'
WHERE NOT EXISTS (SELECT 1 FROM public.transportadoras WHERE placa = 'TNC-890');

-- 4) Verificación: cuántas hay por tipo
SELECT tipo, tipo_vehiculo, COUNT(*) AS total
FROM public.transportadoras
GROUP BY tipo, tipo_vehiculo
ORDER BY tipo, tipo_vehiculo;