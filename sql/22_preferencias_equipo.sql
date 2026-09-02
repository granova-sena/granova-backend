-- Quiz del recomendador por categoría (F5): preferencias de maquinaria
-- Ejecutar en Supabase. Uso: SELECT * FROM preferencias_cliente;

ALTER TABLE preferencias_cliente
  ADD COLUMN IF NOT EXISTS categoria_preferida text,
  ADD COLUMN IF NOT EXISTS uso_equipo text,
  ADD COLUMN IF NOT EXISTS metodo_equipo text,
  ADD COLUMN IF NOT EXISTS presupuesto_equipo text;