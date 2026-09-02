-- =============================================================
-- Granova — Logística de reparto (rol logistica + despachos)
-- Fase A: separa pedidos de DOMICILIO (empleado) de pedidos de
-- REPARTO (despachador con vehículo). El cliente elige el sector.
-- Aplicar en Supabase (SQL Editor) ANTES del redeploy.
-- =============================================================

-- 1) Pedidos: tipo de operación y sector de envío
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS operacion varchar(20) NOT NULL DEFAULT 'domicilio';

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_operacion_check;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_operacion_check
  CHECK (operacion IN ('domicilio','reparto'));

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS sector_envio varchar(100);

-- 2) Transportadoras: ahora son también "vehículos" de reparto
ALTER TABLE public.transportadoras
  ADD COLUMN IF NOT EXISTS tipo_vehiculo varchar(50);

ALTER TABLE public.transportadoras
  ADD COLUMN IF NOT EXISTS capacidad_kg numeric(10,2);

-- 3) Nuevo rol 'logistica' (despachador).
--    Antes de este CHECK quizá había un constraint con otro nombre
--    (usuarios_rol_check / users_rol_check) que solo permitía
--    admin/empleado. Aquí se elimina CUALQUIER check que mencione
--    "rol" en la tabla usuarios y se crea uno que acepte todos los
--    roles del sistema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'usuarios'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%rol%'
  LOOP
    EXECUTE format('ALTER TABLE public.usuarios DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin','gerente','empleado','logistica'));

-- 4) Despachos: una "salida" con un vehículo que agrupa 1..n pedidos
CREATE TABLE IF NOT EXISTS public.despachos (
  id_despacho      serial PRIMARY KEY,
  numero_guia      varchar(20) NOT NULL,
  id_transportadora integer REFERENCES public.transportadoras(id_transportadora),
  sector_destino   varchar(100),
  fecha_programada date,
  estado           varchar(20) NOT NULL DEFAULT 'Preparando'
    CHECK (estado IN ('Preparando','En ruta','Entregado','Novedad')),
  total_unidades   integer NOT NULL DEFAULT 0,
  creado_por       integer REFERENCES public.usuarios(id_usuario),
  confirmado_por   integer REFERENCES public.usuarios(id_usuario),
  fecha_creacion   timestamptz NOT NULL DEFAULT NOW(),
  fecha_salida     timestamptz,
  fecha_entrega    timestamptz
);

CREATE TABLE IF NOT EXISTS public.despacho_pedidos (
  id_despacho integer NOT NULL REFERENCES public.despachos(id_despacho) ON DELETE CASCADE,
  id_pedido   integer NOT NULL UNIQUE REFERENCES public.pedidos(id_pedido),
  PRIMARY KEY (id_despacho, id_pedido)
);

CREATE INDEX IF NOT EXISTS idx_despachos_estado   ON public.despachos(estado);
CREATE INDEX IF NOT EXISTS idx_despacho_pedidos_pedido ON public.despacho_pedidos(id_pedido);

-- 5) Pedidos históricos: ninguno se re-clasifica solo; el despachador
--    puede moverlos con el botón "Reclasificar" del panel.
SELECT operacion, COUNT(*) AS total
FROM public.pedidos
GROUP BY operacion;

-- Verificar el nuevo rol permitido (debe listar 'logistica')
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.usuarios'::regclass AND conname = 'usuarios_rol_check';