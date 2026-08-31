-- =============================================================
-- Granova — Notificaciones de pedidos para el cliente 🔔
-- Aplicar en Supabase (SQL Editor) antes del deploy
-- =============================================================
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id_notificacion  serial PRIMARY KEY,
  id_cliente       integer NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  tipo             varchar NOT NULL DEFAULT 'pedido',
  titulo           varchar NOT NULL,
  mensaje          text,
  id_pedido        integer REFERENCES public.pedidos(id_pedido) ON DELETE CASCADE,
  leida            boolean NOT NULL DEFAULT false,
  fecha            timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_cliente
  ON public.notificaciones (id_cliente, leida);
