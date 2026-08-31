-- =============================================================
-- Granova — P0: Cobro real con estado_pago, trazabilidad de pagos,
-- stock fino por formato y datos fiscales en la factura.
-- Aplicar en Supabase (SQL Editor) ANTES del deploy.
-- =============================================================

-- 1) Estado de pago separado del estado logístico (doc 01: estado_pago != estado)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS estado_pago varchar(20) NOT NULL DEFAULT 'pendiente';

ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_estado_pago_check;

ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_estado_pago_check
  CHECK (estado_pago IN ('pendiente','pendiente_verificacion','pagado','fallido','reembolsado'));

-- 2) Trazabilidad de pagos (pasarela simulada hoy / Wompi mañana)
CREATE TABLE IF NOT EXISTS public.pagos (
  id_pago serial PRIMARY KEY,
  id_pedido integer NOT NULL REFERENCES public.pedidos(id_pedido),
  metodo_pago varchar(20) NOT NULL,
  monto numeric NOT NULL,
  referencia varchar(64),
  estado varchar(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','pendiente_verificacion','aprobado','fallido')),
  fecha_creacion timestamptz NOT NULL DEFAULT NOW(),
  fecha_pago timestamptz,
  confirmado_por integer REFERENCES public.usuarios(id_usuario)
);

CREATE INDEX IF NOT EXISTS idx_pagos_id_pedido ON public.pagos(id_pedido);
CREATE INDEX IF NOT EXISTS idx_pagos_referencia ON public.pagos(referencia);

-- 3) Stock fino: el detalle registra qué bolsa/formato se vendió
ALTER TABLE public.detalle_pedidos
  ADD COLUMN IF NOT EXISTS id_formato integer
  REFERENCES public.formatos_producto(id_formato) ON DELETE SET NULL;

-- 4) Datos fiscales congelados en la factura (doc 03, listo para DIAN futura)
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS tipo_persona_cliente varchar,
  ADD COLUMN IF NOT EXISTS numero_documento_cliente varchar,
  ADD COLUMN IF NOT EXISTS razon_social_cliente varchar,
  ADD COLUMN IF NOT EXISTS email_cliente varchar,
  ADD COLUMN IF NOT EXISTS prefijo varchar NOT NULL DEFAULT 'FE',
  ADD COLUMN IF NOT EXISTS cufe varchar,
  ADD COLUMN IF NOT EXISTS resolucion_dian varchar;

-- 5) Backfill histórico (mejor esfuerzo): lo ya entregado o en camino se da por
-- pagado; los contra-entrega sin despachar siguen 'pendiente'.
UPDATE public.pedidos
SET estado_pago = 'pagado'
WHERE estado_pago = 'pendiente'
  AND estado NOT IN ('cancelado','rechazado')
  AND (metodo_pago <> 'contra_entrega' OR estado IN ('entregado','enviado'));