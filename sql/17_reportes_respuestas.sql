-- Granova — Respuestas del empleado a sus reportes
-- Ejecutar UNA sola vez en el SQL Editor de Supabase (o psql con el owner).

-- Tabla de respuestas: el empleado explica por qué ocurrió el reporte.
CREATE TABLE IF NOT EXISTS public.reporte_respuestas (
  id_respuesta serial PRIMARY KEY,
  id_reporte   integer NOT NULL REFERENCES public.reportes_empleado(id_reporte) ON DELETE CASCADE,
  id_empleado  integer NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
  respuesta    text NOT NULL,
  fecha        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reporte_respuestas_id_reporte_idx
  ON public.reporte_respuestas (id_reporte);
