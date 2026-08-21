-- =============================================================
-- Granova — Frente 1 (Jhon): Clientes
-- Migración de la tabla clientes
-- Aplicar manualmente en Supabase (SQL Editor) o en psql
-- =============================================================

ALTER TABLE public.clientes
    ADD COLUMN tipo_persona character varying NOT NULL DEFAULT 'natural'
        CHECK (tipo_persona IN ('natural','juridica')),
    ADD COLUMN tipo_documento character varying
        CHECK (tipo_documento IN ('CC','CE','NIT','PASAPORTE')),
    ADD COLUMN numero_documento character varying UNIQUE,
    ADD COLUMN digito_verificacion character varying,
    ADD COLUMN razon_social character varying,
    ADD COLUMN tipo_cliente character varying NOT NULL DEFAULT 'minorista'
        CHECK (tipo_cliente IN ('minorista','mayorista'));
