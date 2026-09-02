-- =============================================================
-- Granova — Cotizaciones (historial persistido)
-- Aplicar en Supabase (SQL Editor): pegar TODO y Run
-- =============================================================
-- Guarda cada cotización emitida para que el cliente tenga
-- historial ("Mis cotizaciones") y el panel pueda consultarlas.
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id_cotizacion      serial PRIMARY KEY,
  numero_cotizacion  varchar NOT NULL,
  id_cliente         integer NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  items              jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal           numeric NOT NULL DEFAULT 0,
  descuento          numeric NOT NULL DEFAULT 0,
  total              numeric NOT NULL DEFAULT 0,
  validez_dias       integer NOT NULL DEFAULT 8,
  estado             varchar NOT NULL DEFAULT 'emitida',
  creada_en          timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente
  ON public.cotizaciones (id_cliente, creada_en DESC);

-- Verificación: debe salir la tabla con 10 columnas
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name = 'cotizaciones'
ORDER BY ordinal_position;