--
-- PostgreSQL database dump
--

\restrict 2eAKVXc7ZLm5H3EikxtxQpqhzPxHOCWHPl90mKCvM5YHaqjG0htNGPhbpSv0txP

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: actualizar_fecha(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_fecha() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id_cliente integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    "contraseña" character varying(255) NOT NULL,
    telefono character varying(20),
    direccion character varying(255),
    ciudad character varying(100),
    departamento character varying(100),
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    token_recuperacion character varying(255),
    token_expiracion timestamp without time zone,
    ultimo_envio_recuperacion timestamp without time zone,
    verificado boolean DEFAULT false NOT NULL,
    token_verificacion character varying,
    token_verificacion_expiracion timestamp without time zone,
    ultimo_envio_verificacion timestamp without time zone,
    tipo_persona character varying DEFAULT 'natural'::character varying NOT NULL,
    tipo_documento character varying,
    numero_documento character varying,
    digito_verificacion character varying,
    razon_social character varying,
    descuento_proxima_compra boolean DEFAULT false NOT NULL,
    puntos integer DEFAULT 0 NOT NULL,
    unidades_acumuladas integer DEFAULT 0 NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    tipo_cliente character varying DEFAULT 'minorista'::character varying NOT NULL,
    CONSTRAINT clientes_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'inactivo'::character varying])::text[]))),
    CONSTRAINT clientes_tipo_cliente_check CHECK (((tipo_cliente)::text = ANY ((ARRAY['minorista'::character varying, 'mayorista'::character varying])::text[]))),
    CONSTRAINT clientes_tipo_documento_check CHECK (((tipo_documento)::text = ANY ((ARRAY['CC'::character varying, 'CE'::character varying, 'NIT'::character varying, 'PASAPORTE'::character varying])::text[]))),
    CONSTRAINT clientes_tipo_persona_check CHECK (((tipo_persona)::text = ANY ((ARRAY['natural'::character varying, 'juridica'::character varying])::text[])))
);


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clientes_id_cliente_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clientes_id_cliente_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clientes_id_cliente_seq OWNED BY public.clientes.id_cliente;


--
-- Name: cosecha_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cosecha_detalle (
    id_detalle integer NOT NULL,
    id_cosecha integer NOT NULL,
    id_presentacion integer NOT NULL,
    cantidad numeric NOT NULL,
    CONSTRAINT cosecha_detalle_cantidad_check CHECK ((cantidad > (0)::numeric))
);


--
-- Name: cosecha_detalle_id_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cosecha_detalle_id_detalle_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cosecha_detalle_id_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cosecha_detalle_id_detalle_seq OWNED BY public.cosecha_detalle.id_detalle;


--
-- Name: cosechas_planeadas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cosechas_planeadas (
    id_cosecha integer NOT NULL,
    id_finca integer NOT NULL,
    id_lote integer NOT NULL,
    kg_estimados numeric NOT NULL,
    tipo_cafe character varying DEFAULT 'pergamino'::character varying NOT NULL,
    valor_estimado numeric NOT NULL,
    estado character varying DEFAULT 'planeada'::character varying NOT NULL,
    planeado_por integer,
    fecha_planeada timestamp without time zone DEFAULT now() NOT NULL,
    confirmado_por integer,
    fecha_confirmada timestamp without time zone,
    id_entrega integer,
    origen character varying(30) DEFAULT 'cosecha'::character varying NOT NULL,
    CONSTRAINT cosechas_planeadas_estado_check CHECK (((estado)::text = ANY ((ARRAY['planeada'::character varying, 'confirmada'::character varying, 'cancelada'::character varying])::text[]))),
    CONSTRAINT cosechas_planeadas_kg_estimados_check CHECK ((kg_estimados > (0)::numeric)),
    CONSTRAINT cosechas_planeadas_tipo_cafe_check CHECK (((tipo_cafe)::text = ANY ((ARRAY['cereza'::character varying, 'pergamino'::character varying])::text[]))),
    CONSTRAINT cosechas_planeadas_valor_estimado_check CHECK ((valor_estimado >= (0)::numeric))
);


--
-- Name: cosechas_planeadas_id_cosecha_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cosechas_planeadas_id_cosecha_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cosechas_planeadas_id_cosecha_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cosechas_planeadas_id_cosecha_seq OWNED BY public.cosechas_planeadas.id_cosecha;


--
-- Name: cotizaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones (
    id_cotizacion integer NOT NULL,
    id_cliente integer NOT NULL,
    numero_cotizacion character varying(30) NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    estado character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    descuento_pct numeric(5,2) DEFAULT 0 NOT NULL,
    descuento_fuente character varying(20),
    fecha_validez date NOT NULL,
    id_pedido integer
);


--
-- Name: cotizaciones_id_cotizacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizaciones_id_cotizacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizaciones_id_cotizacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizaciones_id_cotizacion_seq OWNED BY public.cotizaciones.id_cotizacion;


--
-- Name: cotizaciones_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cotizaciones_productos (
    id_cotizacion_producto integer NOT NULL,
    id_cotizacion integer NOT NULL,
    id_producto integer NOT NULL,
    id_formato integer,
    nombre character varying(200) NOT NULL,
    presentacion character varying(200),
    etiqueta_formato character varying(100),
    precio_unitario numeric(12,2) NOT NULL,
    cantidad integer NOT NULL,
    peso_kg numeric(10,3),
    promo_pct numeric(5,2),
    iva_pct numeric(5,2)
);


--
-- Name: cotizaciones_productos_id_cotizacion_producto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cotizaciones_productos_id_cotizacion_producto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cotizaciones_productos_id_cotizacion_producto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cotizaciones_productos_id_cotizacion_producto_seq OWNED BY public.cotizaciones_productos.id_cotizacion_producto;


--
-- Name: cupones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cupones (
    id_cupon integer NOT NULL,
    id_cliente integer NOT NULL,
    codigo character varying NOT NULL,
    descuento_pct numeric NOT NULL,
    usado boolean DEFAULT false NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    fecha_vencimiento timestamp without time zone NOT NULL
);


--
-- Name: cupones_id_cupon_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cupones_id_cupon_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cupones_id_cupon_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cupones_id_cupon_seq OWNED BY public.cupones.id_cupon;


--
-- Name: descuentos_volumen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.descuentos_volumen (
    id_descuento integer NOT NULL,
    kg_min numeric NOT NULL,
    kg_max numeric,
    descuento_pct numeric NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: descuentos_volumen_id_descuento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.descuentos_volumen_id_descuento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: descuentos_volumen_id_descuento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.descuentos_volumen_id_descuento_seq OWNED BY public.descuentos_volumen.id_descuento;


--
-- Name: despacho_pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despacho_pedidos (
    id_despacho integer NOT NULL,
    id_pedido integer NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    fecha_entregado timestamp with time zone,
    motivo_novedad text
);


--
-- Name: despachos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.despachos (
    id_despacho integer NOT NULL,
    numero_guia character varying(20) NOT NULL,
    id_transportadora integer,
    sector_destino character varying(100),
    fecha_programada date,
    estado character varying(20) DEFAULT 'Preparando'::character varying NOT NULL,
    total_unidades integer DEFAULT 0 NOT NULL,
    creado_por integer,
    confirmado_por integer,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_salida timestamp with time zone,
    fecha_entrega timestamp with time zone,
    CONSTRAINT despachos_estado_check CHECK (((estado)::text = ANY ((ARRAY['Preparando'::character varying, 'En ruta'::character varying, 'Entregado'::character varying, 'Novedad'::character varying])::text[])))
);


--
-- Name: despachos_id_despacho_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.despachos_id_despacho_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: despachos_id_despacho_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.despachos_id_despacho_seq OWNED BY public.despachos.id_despacho;


--
-- Name: detalle_pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_pedidos (
    id_detalle integer NOT NULL,
    id_pedido integer NOT NULL,
    id_producto integer NOT NULL,
    cantidad integer NOT NULL,
    precio_unitario numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    id_formato integer
);


--
-- Name: detalle_pedidos_id_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.detalle_pedidos_id_detalle_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: detalle_pedidos_id_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.detalle_pedidos_id_detalle_seq OWNED BY public.detalle_pedidos.id_detalle;


--
-- Name: entregas_finca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entregas_finca (
    id_entrega integer NOT NULL,
    id_finca integer NOT NULL,
    id_lote integer NOT NULL,
    cantidad_kg numeric NOT NULL,
    valor numeric NOT NULL,
    estado_pago character varying DEFAULT 'pendiente'::character varying NOT NULL,
    estado character varying DEFAULT 'registrada'::character varying NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    registrado_por integer,
    pagado_por integer,
    fecha_pago timestamp without time zone,
    tipo_cafe character varying DEFAULT 'pergamino'::character varying NOT NULL,
    kg_netos numeric,
    CONSTRAINT entregas_finca_cantidad_kg_check CHECK ((cantidad_kg > (0)::numeric)),
    CONSTRAINT entregas_finca_estado_check CHECK (((estado)::text = ANY ((ARRAY['registrada'::character varying, 'anulada'::character varying])::text[]))),
    CONSTRAINT entregas_finca_estado_pago_check CHECK (((estado_pago)::text = ANY ((ARRAY['pendiente'::character varying, 'pagado'::character varying])::text[]))),
    CONSTRAINT entregas_finca_tipo_cafe_check CHECK (((tipo_cafe)::text = ANY ((ARRAY['cereza'::character varying, 'pergamino'::character varying])::text[]))),
    CONSTRAINT entregas_finca_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- Name: entregas_finca_id_entrega_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entregas_finca_id_entrega_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entregas_finca_id_entrega_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entregas_finca_id_entrega_seq OWNED BY public.entregas_finca.id_entrega;


--
-- Name: envios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envios (
    id_envio integer NOT NULL,
    numero_guia character varying NOT NULL,
    producto character varying NOT NULL,
    peso numeric NOT NULL,
    origen character varying NOT NULL,
    destino character varying NOT NULL,
    id_transportadora integer,
    destinatario character varying NOT NULL,
    fecha_estimada date NOT NULL,
    estado character varying DEFAULT 'Preparando'::character varying NOT NULL,
    creado_por integer,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT envios_estado_check CHECK (((estado)::text = ANY ((ARRAY['Preparando'::character varying, 'En tránsito'::character varying, 'Entregado'::character varying, 'Novedad'::character varying])::text[]))),
    CONSTRAINT envios_peso_check CHECK ((peso > (0)::numeric))
);


--
-- Name: envios_id_envio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.envios_id_envio_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: envios_id_envio_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.envios_id_envio_seq OWNED BY public.envios.id_envio;


--
-- Name: etapas_procesamiento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etapas_procesamiento (
    id_etapa integer NOT NULL,
    id_lote integer NOT NULL,
    nombre_etapa character varying(20) NOT NULL,
    fecha_inicio date,
    fecha_fin date,
    responsable character varying(150),
    observaciones text,
    CONSTRAINT etapas_procesamiento_nombre_etapa_check CHECK (((nombre_etapa)::text = ANY ((ARRAY['recoleccion'::character varying, 'despulpado'::character varying, 'fermentacion'::character varying, 'lavado'::character varying, 'secado'::character varying, 'trillado'::character varying, 'tostado'::character varying, 'empacado'::character varying])::text[])))
);


--
-- Name: etapas_procesamiento_id_etapa_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.etapas_procesamiento_id_etapa_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etapas_procesamiento_id_etapa_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.etapas_procesamiento_id_etapa_seq OWNED BY public.etapas_procesamiento.id_etapa;


--
-- Name: eventos_lote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_lote (
    id_evento integer NOT NULL,
    id_lote integer NOT NULL,
    tipo_evento character varying(30) NOT NULL,
    fecha timestamp without time zone NOT NULL,
    descripcion text,
    ubicacion character varying(150),
    id_finca integer,
    imagen_url text,
    creado_en timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT eventos_lote_tipo_evento_check CHECK (((tipo_evento)::text = ANY ((ARRAY['cosecha'::character varying, 'procesado'::character varying, 'tostado'::character varying, 'envasado'::character varying, 'enviado'::character varying, 'entregado'::character varying])::text[])))
);


--
-- Name: eventos_lote_id_evento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eventos_lote_id_evento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eventos_lote_id_evento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eventos_lote_id_evento_seq OWNED BY public.eventos_lote.id_evento;


--
-- Name: facturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturas (
    id_factura integer NOT NULL,
    id_pedido integer NOT NULL,
    numero_factura character varying(50) NOT NULL,
    fecha_emision timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    subtotal numeric(10,2) NOT NULL,
    impuestos numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) NOT NULL,
    estado character varying(20) DEFAULT 'emitida'::character varying NOT NULL,
    tipo_persona_cliente character varying,
    numero_documento_cliente character varying,
    razon_social_cliente character varying,
    email_cliente character varying,
    prefijo character varying DEFAULT 'FE'::character varying NOT NULL,
    cufe character varying,
    resolucion_dian character varying,
    CONSTRAINT facturas_estado_check CHECK (((estado)::text = ANY ((ARRAY['emitida'::character varying, 'anulada'::character varying])::text[])))
);


--
-- Name: facturas_id_factura_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facturas_id_factura_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facturas_id_factura_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facturas_id_factura_seq OWNED BY public.facturas.id_factura;


--
-- Name: fincas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fincas (
    id integer NOT NULL,
    nombre character varying NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    altitud character varying,
    region character varying,
    estado character varying DEFAULT 'activa'::character varying NOT NULL
);


--
-- Name: fincas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fincas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fincas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fincas_id_seq OWNED BY public.fincas.id;


--
-- Name: formatos_producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formatos_producto (
    id_formato integer NOT NULL,
    id_producto integer NOT NULL,
    etiqueta character varying NOT NULL,
    peso_kg numeric NOT NULL,
    precio numeric NOT NULL,
    imagen_url character varying,
    activo boolean DEFAULT true NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    id_presentacion integer
);


--
-- Name: formatos_producto_id_formato_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.formatos_producto_id_formato_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: formatos_producto_id_formato_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.formatos_producto_id_formato_seq OWNED BY public.formatos_producto.id_formato;


--
-- Name: lotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lotes (
    id_lote integer NOT NULL,
    codigo_lote character varying(50) NOT NULL,
    finca character varying(150) NOT NULL,
    region character varying(100),
    variedad character varying(100),
    fecha_cosecha date,
    cantidad_kg numeric(10,2) NOT NULL,
    estado character varying(20) DEFAULT 'disponible'::character varying NOT NULL,
    fecha_registro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    finca_id integer,
    kg_perdido numeric DEFAULT 0 NOT NULL,
    kg_en_proceso numeric DEFAULT 0 NOT NULL,
    id_finca integer,
    CONSTRAINT lotes_estado_check CHECK (((estado)::text = ANY ((ARRAY['disponible'::character varying, 'agotado'::character varying, 'inactivo'::character varying])::text[])))
);


--
-- Name: lotes_id_lote_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lotes_id_lote_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lotes_id_lote_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lotes_id_lote_seq OWNED BY public.lotes.id_lote;


--
-- Name: niveles_lealtad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.niveles_lealtad (
    id integer NOT NULL,
    nombre text NOT NULL,
    puntos_min integer DEFAULT 0 NOT NULL,
    canje_puntos integer NOT NULL,
    descuento_pct numeric(5,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: niveles_lealtad_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.niveles_lealtad_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: niveles_lealtad_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.niveles_lealtad_id_seq OWNED BY public.niveles_lealtad.id;


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id_notificacion integer NOT NULL,
    id_cliente integer NOT NULL,
    tipo character varying DEFAULT 'pedido'::character varying NOT NULL,
    titulo character varying NOT NULL,
    mensaje text,
    id_pedido integer,
    leida boolean DEFAULT false NOT NULL,
    fecha timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notificaciones_id_notificacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notificaciones_id_notificacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notificaciones_id_notificacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notificaciones_id_notificacion_seq OWNED BY public.notificaciones.id_notificacion;


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id_pago integer NOT NULL,
    id_pedido integer NOT NULL,
    metodo_pago character varying(20) NOT NULL,
    monto numeric NOT NULL,
    referencia character varying(64),
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_pago timestamp with time zone,
    confirmado_por integer,
    CONSTRAINT pagos_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'pendiente_verificacion'::character varying, 'aprobado'::character varying, 'fallido'::character varying])::text[])))
);


--
-- Name: pagos_id_pago_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pagos_id_pago_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pagos_id_pago_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pagos_id_pago_seq OWNED BY public.pagos.id_pago;


--
-- Name: parametros_cafe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_cafe (
    clave character varying NOT NULL,
    valor numeric NOT NULL,
    descripcion character varying
);


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    id_pedido integer NOT NULL,
    id_cliente integer NOT NULL,
    fecha_pedido timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    estado character varying(20) DEFAULT 'confirmado'::character varying NOT NULL,
    metodo_pago character varying(20) NOT NULL,
    direccion_envio character varying(255),
    ciudad_envio character varying(100),
    total numeric(10,2) DEFAULT 0 NOT NULL,
    motivo_rechazo text,
    payment_intent_id text,
    descuento numeric DEFAULT 0 NOT NULL,
    estado_pago character varying DEFAULT 'pendiente'::character varying NOT NULL,
    codigo_cupon character varying(50),
    operacion character varying(20) DEFAULT 'domicilio'::character varying NOT NULL,
    sector_envio character varying(100),
    CONSTRAINT pedidos_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'confirmado'::character varying, 'en_proceso'::character varying, 'enviado'::character varying, 'entregado'::character varying, 'cancelado'::character varying])::text[]))),
    CONSTRAINT pedidos_estado_pago_check CHECK (((estado_pago)::text = ANY ((ARRAY['pendiente'::character varying, 'pendiente_verificacion'::character varying, 'pagado'::character varying, 'fallido'::character varying, 'reembolsado'::character varying])::text[]))),
    CONSTRAINT pedidos_metodo_pago_check CHECK (((metodo_pago)::text = ANY ((ARRAY['tarjeta'::character varying, 'pse'::character varying, 'efectivo'::character varying, 'transferencia'::character varying, 'contra_entrega'::character varying, 'nequi'::character varying, 'daviplata'::character varying])::text[]))),
    CONSTRAINT pedidos_operacion_check CHECK (((operacion)::text = ANY ((ARRAY['domicilio'::character varying, 'reparto'::character varying])::text[])))
);


--
-- Name: pedidos_id_pedido_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidos_id_pedido_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidos_id_pedido_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidos_id_pedido_seq OWNED BY public.pedidos.id_pedido;


--
-- Name: perdidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perdidas (
    id_perdida integer NOT NULL,
    id_producto integer NOT NULL,
    cantidad numeric NOT NULL,
    motivo character varying NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    registrado_por integer,
    CONSTRAINT perdidas_cantidad_check CHECK ((cantidad > (0)::numeric))
);


--
-- Name: perdidas_id_perdida_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.perdidas_id_perdida_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: perdidas_id_perdida_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.perdidas_id_perdida_seq OWNED BY public.perdidas.id_perdida;


--
-- Name: preferencias_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.preferencias_cliente (
    id_preferencia integer NOT NULL,
    id_cliente integer NOT NULL,
    sabor_preferido character varying(50),
    metodo_preparacion character varying(50),
    presupuesto character varying(30),
    fecha_actualizacion timestamp without time zone DEFAULT now(),
    categoria_preferida text,
    uso_equipo text,
    metodo_equipo text,
    presupuesto_equipo text,
    CONSTRAINT preferencias_cliente_metodo_preparacion_check CHECK (((metodo_preparacion)::text = ANY ((ARRAY['espresso'::character varying, 'prensa_francesa'::character varying, 'filtrado'::character varying, 'instantaneo'::character varying])::text[]))),
    CONSTRAINT preferencias_cliente_presupuesto_check CHECK (((presupuesto)::text = ANY ((ARRAY['menos_20000'::character varying, '20000_50000'::character varying, 'mas_50000'::character varying])::text[]))),
    CONSTRAINT preferencias_cliente_sabor_preferido_check CHECK (((sabor_preferido)::text = ANY ((ARRAY['afrutado'::character varying, 'achocolatado'::character varying, 'tostado'::character varying, 'floral'::character varying])::text[])))
);


--
-- Name: preferencias_cliente_id_preferencia_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.preferencias_cliente_id_preferencia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: preferencias_cliente_id_preferencia_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.preferencias_cliente_id_preferencia_seq OWNED BY public.preferencias_cliente.id_preferencia;


--
-- Name: presentaciones_catalogo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presentaciones_catalogo (
    id_presentacion integer NOT NULL,
    nombre character varying NOT NULL,
    kg_equivalente numeric NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT presentaciones_catalogo_kg_equivalente_check CHECK ((kg_equivalente > (0)::numeric))
);


--
-- Name: presentaciones_catalogo_id_presentacion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.presentaciones_catalogo_id_presentacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: presentaciones_catalogo_id_presentacion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.presentaciones_catalogo_id_presentacion_seq OWNED BY public.presentaciones_catalogo.id_presentacion;


--
-- Name: procesamiento_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procesamiento_detalle (
    id_detalle integer NOT NULL,
    id_procesamiento integer NOT NULL,
    id_producto integer NOT NULL,
    cantidad_agregada numeric NOT NULL,
    CONSTRAINT procesamiento_detalle_cantidad_agregada_check CHECK ((cantidad_agregada > (0)::numeric))
);


--
-- Name: procesamiento_detalle_id_detalle_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procesamiento_detalle_id_detalle_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procesamiento_detalle_id_detalle_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procesamiento_detalle_id_detalle_seq OWNED BY public.procesamiento_detalle.id_detalle;


--
-- Name: procesamientos_lote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procesamientos_lote (
    id_procesamiento integer NOT NULL,
    id_lote integer NOT NULL,
    kg_utilizados numeric NOT NULL,
    procesado_por integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT procesamientos_lote_kg_utilizados_check CHECK ((kg_utilizados > (0)::numeric))
);


--
-- Name: procesamientos_lote_id_procesamiento_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.procesamientos_lote_id_procesamiento_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: procesamientos_lote_id_procesamiento_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.procesamientos_lote_id_procesamiento_seq OWNED BY public.procesamientos_lote.id_procesamiento;


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    id_producto integer NOT NULL,
    id_lote integer,
    nombre character varying(150) NOT NULL,
    descripcion text,
    tipo_cafe character varying(20) DEFAULT 'molido'::character varying,
    presentacion character varying(50),
    precio numeric(10,2) NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    imagen_url text,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    categoria_producto character varying(20) DEFAULT 'cafe'::character varying,
    marca character varying(100),
    modelo character varying(100),
    garantia_meses integer,
    iva_pct numeric DEFAULT 5 NOT NULL,
    costo_unitario numeric DEFAULT 0 NOT NULL,
    creado_por integer,
    id_presentacion integer,
    precio_mayorista numeric,
    CONSTRAINT productos_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'inactivo'::character varying, 'agotado'::character varying])::text[]))),
    CONSTRAINT productos_tipo_cafe_check CHECK (((tipo_cafe)::text = ANY ((ARRAY['grano'::character varying, 'molido'::character varying, 'instantaneo'::character varying])::text[])))
);


--
-- Name: productos_id_producto_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.productos_id_producto_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: productos_id_producto_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.productos_id_producto_seq OWNED BY public.productos.id_producto;


--
-- Name: promocion_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promocion_productos (
    id_promocion integer NOT NULL,
    id_producto integer NOT NULL
);


--
-- Name: promociones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promociones (
    id_promocion integer NOT NULL,
    nombre character varying(150) NOT NULL,
    descripcion text,
    tipo_descuento character varying(20) NOT NULL,
    valor_descuento numeric(10,2) NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    estado character varying(20) DEFAULT 'activa'::character varying NOT NULL,
    CONSTRAINT promociones_estado_check CHECK (((estado)::text = ANY ((ARRAY['activa'::character varying, 'inactiva'::character varying, 'finalizada'::character varying])::text[]))),
    CONSTRAINT promociones_tipo_descuento_check CHECK (((tipo_descuento)::text = ANY ((ARRAY['porcentaje'::character varying, 'monto_fijo'::character varying])::text[])))
);


--
-- Name: promociones_id_promocion_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promociones_id_promocion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promociones_id_promocion_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promociones_id_promocion_seq OWNED BY public.promociones.id_promocion;


--
-- Name: reporte_respuestas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reporte_respuestas (
    id_respuesta integer NOT NULL,
    id_reporte integer NOT NULL,
    id_empleado integer NOT NULL,
    respuesta text NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reporte_respuestas_id_respuesta_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reporte_respuestas_id_respuesta_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reporte_respuestas_id_respuesta_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reporte_respuestas_id_respuesta_seq OWNED BY public.reporte_respuestas.id_respuesta;


--
-- Name: reportes_empleado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reportes_empleado (
    id_reporte integer NOT NULL,
    id_empleado integer NOT NULL,
    motivo text NOT NULL,
    creado_por integer,
    fecha timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reportes_empleado_id_reporte_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reportes_empleado_id_reporte_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reportes_empleado_id_reporte_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reportes_empleado_id_reporte_seq OWNED BY public.reportes_empleado.id_reporte;


--
-- Name: resenas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resenas (
    id_resena integer NOT NULL,
    id_detalle_pedido integer NOT NULL,
    calificacion smallint NOT NULL,
    comentario text,
    visible boolean DEFAULT true NOT NULL,
    fecha_resena timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT resenas_calificacion_check CHECK (((calificacion >= 1) AND (calificacion <= 5)))
);


--
-- Name: resenas_id_resena_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resenas_id_resena_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resenas_id_resena_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resenas_id_resena_seq OWNED BY public.resenas.id_resena;


--
-- Name: transportadoras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportadoras (
    id_transportadora integer NOT NULL,
    tipo_persona character varying DEFAULT 'persona_natural'::character varying NOT NULL,
    nombre character varying NOT NULL,
    telefono character varying NOT NULL,
    tipo character varying DEFAULT 'Acarreo'::character varying NOT NULL,
    placa character varying,
    nit character varying,
    vehiculos integer DEFAULT 0,
    estado character varying DEFAULT 'Activo'::character varying NOT NULL,
    creado_por integer,
    fecha_creacion timestamp without time zone DEFAULT now() NOT NULL,
    tipo_vehiculo character varying(50),
    capacidad_kg numeric(10,2),
    imagen_url text,
    CONSTRAINT transportadoras_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['Acarreo'::character varying, 'Reparto'::character varying])::text[])))
);


--
-- Name: transportadoras_id_transportadora_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transportadoras_id_transportadora_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transportadoras_id_transportadora_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transportadoras_id_transportadora_seq OWNED BY public.transportadoras.id_transportadora;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id_usuario integer NOT NULL,
    nombre character varying(100) NOT NULL,
    apellido character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    "contraseña" character varying(255) NOT NULL,
    rol character varying(20) DEFAULT 'empleado'::character varying NOT NULL,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    token_recuperacion text,
    token_expiracion timestamp with time zone,
    ultimo_envio_recuperacion timestamp without time zone,
    CONSTRAINT usuarios_estado_check CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'inactivo'::character varying, 'bloqueado'::character varying, 'eliminado'::character varying])::text[]))),
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY ((ARRAY['admin'::character varying, 'gerente'::character varying, 'empleado'::character varying, 'logistica'::character varying])::text[])))
);


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usuarios_id_usuario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usuarios_id_usuario_seq OWNED BY public.usuarios.id_usuario;


--
-- Name: clientes id_cliente; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes ALTER COLUMN id_cliente SET DEFAULT nextval('public.clientes_id_cliente_seq'::regclass);


--
-- Name: cosecha_detalle id_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosecha_detalle ALTER COLUMN id_detalle SET DEFAULT nextval('public.cosecha_detalle_id_detalle_seq'::regclass);


--
-- Name: cosechas_planeadas id_cosecha; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas ALTER COLUMN id_cosecha SET DEFAULT nextval('public.cosechas_planeadas_id_cosecha_seq'::regclass);


--
-- Name: cotizaciones id_cotizacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones ALTER COLUMN id_cotizacion SET DEFAULT nextval('public.cotizaciones_id_cotizacion_seq'::regclass);


--
-- Name: cotizaciones_productos id_cotizacion_producto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_productos ALTER COLUMN id_cotizacion_producto SET DEFAULT nextval('public.cotizaciones_productos_id_cotizacion_producto_seq'::regclass);


--
-- Name: cupones id_cupon; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones ALTER COLUMN id_cupon SET DEFAULT nextval('public.cupones_id_cupon_seq'::regclass);


--
-- Name: descuentos_volumen id_descuento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_volumen ALTER COLUMN id_descuento SET DEFAULT nextval('public.descuentos_volumen_id_descuento_seq'::regclass);


--
-- Name: despachos id_despacho; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despachos ALTER COLUMN id_despacho SET DEFAULT nextval('public.despachos_id_despacho_seq'::regclass);


--
-- Name: detalle_pedidos id_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedidos ALTER COLUMN id_detalle SET DEFAULT nextval('public.detalle_pedidos_id_detalle_seq'::regclass);


--
-- Name: entregas_finca id_entrega; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_finca ALTER COLUMN id_entrega SET DEFAULT nextval('public.entregas_finca_id_entrega_seq'::regclass);


--
-- Name: envios id_envio; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios ALTER COLUMN id_envio SET DEFAULT nextval('public.envios_id_envio_seq'::regclass);


--
-- Name: etapas_procesamiento id_etapa; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_procesamiento ALTER COLUMN id_etapa SET DEFAULT nextval('public.etapas_procesamiento_id_etapa_seq'::regclass);


--
-- Name: eventos_lote id_evento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_lote ALTER COLUMN id_evento SET DEFAULT nextval('public.eventos_lote_id_evento_seq'::regclass);


--
-- Name: facturas id_factura; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas ALTER COLUMN id_factura SET DEFAULT nextval('public.facturas_id_factura_seq'::regclass);


--
-- Name: fincas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fincas ALTER COLUMN id SET DEFAULT nextval('public.fincas_id_seq'::regclass);


--
-- Name: formatos_producto id_formato; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formatos_producto ALTER COLUMN id_formato SET DEFAULT nextval('public.formatos_producto_id_formato_seq'::regclass);


--
-- Name: lotes id_lote; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes ALTER COLUMN id_lote SET DEFAULT nextval('public.lotes_id_lote_seq'::regclass);


--
-- Name: niveles_lealtad id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niveles_lealtad ALTER COLUMN id SET DEFAULT nextval('public.niveles_lealtad_id_seq'::regclass);


--
-- Name: notificaciones id_notificacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones ALTER COLUMN id_notificacion SET DEFAULT nextval('public.notificaciones_id_notificacion_seq'::regclass);


--
-- Name: pagos id_pago; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos ALTER COLUMN id_pago SET DEFAULT nextval('public.pagos_id_pago_seq'::regclass);


--
-- Name: pedidos id_pedido; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos ALTER COLUMN id_pedido SET DEFAULT nextval('public.pedidos_id_pedido_seq'::regclass);


--
-- Name: perdidas id_perdida; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perdidas ALTER COLUMN id_perdida SET DEFAULT nextval('public.perdidas_id_perdida_seq'::regclass);


--
-- Name: preferencias_cliente id_preferencia; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_cliente ALTER COLUMN id_preferencia SET DEFAULT nextval('public.preferencias_cliente_id_preferencia_seq'::regclass);


--
-- Name: presentaciones_catalogo id_presentacion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentaciones_catalogo ALTER COLUMN id_presentacion SET DEFAULT nextval('public.presentaciones_catalogo_id_presentacion_seq'::regclass);


--
-- Name: procesamiento_detalle id_detalle; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamiento_detalle ALTER COLUMN id_detalle SET DEFAULT nextval('public.procesamiento_detalle_id_detalle_seq'::regclass);


--
-- Name: procesamientos_lote id_procesamiento; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamientos_lote ALTER COLUMN id_procesamiento SET DEFAULT nextval('public.procesamientos_lote_id_procesamiento_seq'::regclass);


--
-- Name: productos id_producto; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos ALTER COLUMN id_producto SET DEFAULT nextval('public.productos_id_producto_seq'::regclass);


--
-- Name: promociones id_promocion; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promociones ALTER COLUMN id_promocion SET DEFAULT nextval('public.promociones_id_promocion_seq'::regclass);


--
-- Name: reporte_respuestas id_respuesta; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_respuestas ALTER COLUMN id_respuesta SET DEFAULT nextval('public.reporte_respuestas_id_respuesta_seq'::regclass);


--
-- Name: reportes_empleado id_reporte; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_empleado ALTER COLUMN id_reporte SET DEFAULT nextval('public.reportes_empleado_id_reporte_seq'::regclass);


--
-- Name: resenas id_resena; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas ALTER COLUMN id_resena SET DEFAULT nextval('public.resenas_id_resena_seq'::regclass);


--
-- Name: transportadoras id_transportadora; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportadoras ALTER COLUMN id_transportadora SET DEFAULT nextval('public.transportadoras_id_transportadora_seq'::regclass);


--
-- Name: usuarios id_usuario; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id_usuario SET DEFAULT nextval('public.usuarios_id_usuario_seq'::regclass);


--
-- Name: clientes clientes_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_email_key UNIQUE (email);


--
-- Name: clientes clientes_numero_documento_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_numero_documento_key UNIQUE (numero_documento);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id_cliente);


--
-- Name: cosecha_detalle cosecha_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosecha_detalle
    ADD CONSTRAINT cosecha_detalle_pkey PRIMARY KEY (id_detalle);


--
-- Name: cosechas_planeadas cosechas_planeadas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas
    ADD CONSTRAINT cosechas_planeadas_pkey PRIMARY KEY (id_cosecha);


--
-- Name: cotizaciones cotizaciones_numero_cotizacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_numero_cotizacion_key UNIQUE (numero_cotizacion);


--
-- Name: cotizaciones cotizaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_pkey PRIMARY KEY (id_cotizacion);


--
-- Name: cotizaciones_productos cotizaciones_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_productos
    ADD CONSTRAINT cotizaciones_productos_pkey PRIMARY KEY (id_cotizacion_producto);


--
-- Name: cupones cupones_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_codigo_key UNIQUE (codigo);


--
-- Name: cupones cupones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_pkey PRIMARY KEY (id_cupon);


--
-- Name: descuentos_volumen descuentos_volumen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.descuentos_volumen
    ADD CONSTRAINT descuentos_volumen_pkey PRIMARY KEY (id_descuento);


--
-- Name: despacho_pedidos despacho_pedidos_id_pedido_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despacho_pedidos
    ADD CONSTRAINT despacho_pedidos_id_pedido_key UNIQUE (id_pedido);


--
-- Name: despacho_pedidos despacho_pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despacho_pedidos
    ADD CONSTRAINT despacho_pedidos_pkey PRIMARY KEY (id_despacho, id_pedido);


--
-- Name: despachos despachos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despachos
    ADD CONSTRAINT despachos_pkey PRIMARY KEY (id_despacho);


--
-- Name: detalle_pedidos detalle_pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedidos
    ADD CONSTRAINT detalle_pedidos_pkey PRIMARY KEY (id_detalle);


--
-- Name: entregas_finca entregas_finca_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_finca
    ADD CONSTRAINT entregas_finca_pkey PRIMARY KEY (id_entrega);


--
-- Name: envios envios_numero_guia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_numero_guia_key UNIQUE (numero_guia);


--
-- Name: envios envios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_pkey PRIMARY KEY (id_envio);


--
-- Name: etapas_procesamiento etapas_procesamiento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_procesamiento
    ADD CONSTRAINT etapas_procesamiento_pkey PRIMARY KEY (id_etapa);


--
-- Name: eventos_lote eventos_lote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_lote
    ADD CONSTRAINT eventos_lote_pkey PRIMARY KEY (id_evento);


--
-- Name: facturas facturas_numero_factura_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_numero_factura_key UNIQUE (numero_factura);


--
-- Name: facturas facturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT facturas_pkey PRIMARY KEY (id_factura);


--
-- Name: fincas fincas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fincas
    ADD CONSTRAINT fincas_pkey PRIMARY KEY (id);


--
-- Name: formatos_producto formatos_producto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formatos_producto
    ADD CONSTRAINT formatos_producto_pkey PRIMARY KEY (id_formato);


--
-- Name: lotes lotes_codigo_lote_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_codigo_lote_key UNIQUE (codigo_lote);


--
-- Name: lotes lotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_pkey PRIMARY KEY (id_lote);


--
-- Name: niveles_lealtad niveles_lealtad_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niveles_lealtad
    ADD CONSTRAINT niveles_lealtad_nombre_key UNIQUE (nombre);


--
-- Name: niveles_lealtad niveles_lealtad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niveles_lealtad
    ADD CONSTRAINT niveles_lealtad_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id_notificacion);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id_pago);


--
-- Name: parametros_cafe parametros_cafe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_cafe
    ADD CONSTRAINT parametros_cafe_pkey PRIMARY KEY (clave);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id_pedido);


--
-- Name: perdidas perdidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perdidas
    ADD CONSTRAINT perdidas_pkey PRIMARY KEY (id_perdida);


--
-- Name: preferencias_cliente preferencias_cliente_id_cliente_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_cliente
    ADD CONSTRAINT preferencias_cliente_id_cliente_key UNIQUE (id_cliente);


--
-- Name: preferencias_cliente preferencias_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_cliente
    ADD CONSTRAINT preferencias_cliente_pkey PRIMARY KEY (id_preferencia);


--
-- Name: presentaciones_catalogo presentaciones_catalogo_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentaciones_catalogo
    ADD CONSTRAINT presentaciones_catalogo_nombre_key UNIQUE (nombre);


--
-- Name: presentaciones_catalogo presentaciones_catalogo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentaciones_catalogo
    ADD CONSTRAINT presentaciones_catalogo_pkey PRIMARY KEY (id_presentacion);


--
-- Name: procesamiento_detalle procesamiento_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamiento_detalle
    ADD CONSTRAINT procesamiento_detalle_pkey PRIMARY KEY (id_detalle);


--
-- Name: procesamientos_lote procesamientos_lote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamientos_lote
    ADD CONSTRAINT procesamientos_lote_pkey PRIMARY KEY (id_procesamiento);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id_producto);


--
-- Name: promocion_productos promocion_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocion_productos
    ADD CONSTRAINT promocion_productos_pkey PRIMARY KEY (id_promocion, id_producto);


--
-- Name: promociones promociones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promociones
    ADD CONSTRAINT promociones_pkey PRIMARY KEY (id_promocion);


--
-- Name: reporte_respuestas reporte_respuestas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_respuestas
    ADD CONSTRAINT reporte_respuestas_pkey PRIMARY KEY (id_respuesta);


--
-- Name: reportes_empleado reportes_empleado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_empleado
    ADD CONSTRAINT reportes_empleado_pkey PRIMARY KEY (id_reporte);


--
-- Name: resenas resenas_id_detalle_pedido_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas
    ADD CONSTRAINT resenas_id_detalle_pedido_key UNIQUE (id_detalle_pedido);


--
-- Name: resenas resenas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas
    ADD CONSTRAINT resenas_pkey PRIMARY KEY (id_resena);


--
-- Name: transportadoras transportadoras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportadoras
    ADD CONSTRAINT transportadoras_pkey PRIMARY KEY (id_transportadora);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);


--
-- Name: fincas_nombre_lower_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fincas_nombre_lower_uq ON public.fincas USING btree (lower((nombre)::text));


--
-- Name: idx_cotizaciones_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cotizaciones_cliente ON public.cotizaciones USING btree (id_cliente, fecha_creacion DESC);


--
-- Name: idx_despacho_pedidos_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_despacho_pedidos_pedido ON public.despacho_pedidos USING btree (id_pedido);


--
-- Name: idx_despachos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_despachos_estado ON public.despachos USING btree (estado);


--
-- Name: idx_eventos_lote_id_lote_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eventos_lote_id_lote_fecha ON public.eventos_lote USING btree (id_lote, fecha);


--
-- Name: idx_notificaciones_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_cliente ON public.notificaciones USING btree (id_cliente, leida);


--
-- Name: idx_pagos_id_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_id_pedido ON public.pagos USING btree (id_pedido);


--
-- Name: idx_pagos_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_referencia ON public.pagos USING btree (referencia);


--
-- Name: idx_pedidos_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_payment_intent ON public.pedidos USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);


--
-- Name: idx_resenas_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resenas_visible ON public.resenas USING btree (visible);


--
-- Name: reporte_respuestas_id_reporte_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reporte_respuestas_id_reporte_idx ON public.reporte_respuestas USING btree (id_reporte);


--
-- Name: usuarios trigger_actualizar_usuarios; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_actualizar_usuarios BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha();


--
-- Name: cosecha_detalle cosecha_detalle_id_cosecha_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosecha_detalle
    ADD CONSTRAINT cosecha_detalle_id_cosecha_fkey FOREIGN KEY (id_cosecha) REFERENCES public.cosechas_planeadas(id_cosecha) ON DELETE CASCADE;


--
-- Name: cosecha_detalle cosecha_detalle_id_presentacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosecha_detalle
    ADD CONSTRAINT cosecha_detalle_id_presentacion_fkey FOREIGN KEY (id_presentacion) REFERENCES public.presentaciones_catalogo(id_presentacion);


--
-- Name: cosechas_planeadas cosechas_planeadas_confirmado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas
    ADD CONSTRAINT cosechas_planeadas_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: cosechas_planeadas cosechas_planeadas_id_entrega_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas
    ADD CONSTRAINT cosechas_planeadas_id_entrega_fkey FOREIGN KEY (id_entrega) REFERENCES public.entregas_finca(id_entrega);


--
-- Name: cosechas_planeadas cosechas_planeadas_id_finca_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas
    ADD CONSTRAINT cosechas_planeadas_id_finca_fkey FOREIGN KEY (id_finca) REFERENCES public.fincas(id);


--
-- Name: cosechas_planeadas cosechas_planeadas_id_lote_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas
    ADD CONSTRAINT cosechas_planeadas_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote);


--
-- Name: cosechas_planeadas cosechas_planeadas_planeado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosechas_planeadas
    ADD CONSTRAINT cosechas_planeadas_planeado_por_fkey FOREIGN KEY (planeado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: cotizaciones cotizaciones_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente);


--
-- Name: cotizaciones cotizaciones_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones
    ADD CONSTRAINT cotizaciones_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido);


--
-- Name: cotizaciones_productos cotizaciones_productos_id_cotizacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_productos
    ADD CONSTRAINT cotizaciones_productos_id_cotizacion_fkey FOREIGN KEY (id_cotizacion) REFERENCES public.cotizaciones(id_cotizacion) ON DELETE CASCADE;


--
-- Name: cotizaciones_productos cotizaciones_productos_id_formato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_productos
    ADD CONSTRAINT cotizaciones_productos_id_formato_fkey FOREIGN KEY (id_formato) REFERENCES public.formatos_producto(id_formato);


--
-- Name: cotizaciones_productos cotizaciones_productos_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cotizaciones_productos
    ADD CONSTRAINT cotizaciones_productos_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- Name: cupones cupones_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cupones
    ADD CONSTRAINT cupones_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente) ON DELETE CASCADE;


--
-- Name: despacho_pedidos despacho_pedidos_id_despacho_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despacho_pedidos
    ADD CONSTRAINT despacho_pedidos_id_despacho_fkey FOREIGN KEY (id_despacho) REFERENCES public.despachos(id_despacho) ON DELETE CASCADE;


--
-- Name: despacho_pedidos despacho_pedidos_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despacho_pedidos
    ADD CONSTRAINT despacho_pedidos_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido);


--
-- Name: despachos despachos_confirmado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despachos
    ADD CONSTRAINT despachos_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: despachos despachos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despachos
    ADD CONSTRAINT despachos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: despachos despachos_id_transportadora_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.despachos
    ADD CONSTRAINT despachos_id_transportadora_fkey FOREIGN KEY (id_transportadora) REFERENCES public.transportadoras(id_transportadora);


--
-- Name: detalle_pedidos detalle_pedidos_id_formato_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedidos
    ADD CONSTRAINT detalle_pedidos_id_formato_fkey FOREIGN KEY (id_formato) REFERENCES public.formatos_producto(id_formato) ON DELETE SET NULL;


--
-- Name: entregas_finca entregas_finca_id_finca_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_finca
    ADD CONSTRAINT entregas_finca_id_finca_fkey FOREIGN KEY (id_finca) REFERENCES public.fincas(id);


--
-- Name: entregas_finca entregas_finca_id_lote_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_finca
    ADD CONSTRAINT entregas_finca_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote);


--
-- Name: entregas_finca entregas_finca_pagado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_finca
    ADD CONSTRAINT entregas_finca_pagado_por_fkey FOREIGN KEY (pagado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: entregas_finca entregas_finca_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entregas_finca
    ADD CONSTRAINT entregas_finca_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: envios envios_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: envios envios_id_transportadora_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envios
    ADD CONSTRAINT envios_id_transportadora_fkey FOREIGN KEY (id_transportadora) REFERENCES public.transportadoras(id_transportadora);


--
-- Name: eventos_lote eventos_lote_id_finca_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_lote
    ADD CONSTRAINT eventos_lote_id_finca_fkey FOREIGN KEY (id_finca) REFERENCES public.fincas(id);


--
-- Name: eventos_lote eventos_lote_id_lote_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_lote
    ADD CONSTRAINT eventos_lote_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote) ON DELETE CASCADE;


--
-- Name: detalle_pedidos fk_detalle_pedido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedidos
    ADD CONSTRAINT fk_detalle_pedido FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: detalle_pedidos fk_detalle_producto; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedidos
    ADD CONSTRAINT fk_detalle_producto FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: etapas_procesamiento fk_etapa_lote; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etapas_procesamiento
    ADD CONSTRAINT fk_etapa_lote FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: facturas fk_factura_pedido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturas
    ADD CONSTRAINT fk_factura_pedido FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pedidos fk_pedido_cliente; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT fk_pedido_cliente FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: productos fk_producto_lote; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT fk_producto_lote FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: formatos_producto formatos_producto_id_presentacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formatos_producto
    ADD CONSTRAINT formatos_producto_id_presentacion_fkey FOREIGN KEY (id_presentacion) REFERENCES public.presentaciones_catalogo(id_presentacion) ON DELETE SET NULL;


--
-- Name: formatos_producto formatos_producto_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formatos_producto
    ADD CONSTRAINT formatos_producto_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto) ON DELETE CASCADE;


--
-- Name: lotes lotes_finca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_finca_id_fkey FOREIGN KEY (finca_id) REFERENCES public.fincas(id);


--
-- Name: lotes lotes_id_finca_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lotes
    ADD CONSTRAINT lotes_id_finca_fkey FOREIGN KEY (id_finca) REFERENCES public.fincas(id) ON DELETE SET NULL;


--
-- Name: notificaciones notificaciones_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente) ON DELETE CASCADE;


--
-- Name: notificaciones notificaciones_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido) ON DELETE CASCADE;


--
-- Name: pagos pagos_confirmado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: pagos pagos_id_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_id_pedido_fkey FOREIGN KEY (id_pedido) REFERENCES public.pedidos(id_pedido);


--
-- Name: perdidas perdidas_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perdidas
    ADD CONSTRAINT perdidas_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- Name: perdidas perdidas_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perdidas
    ADD CONSTRAINT perdidas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: preferencias_cliente preferencias_cliente_id_cliente_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.preferencias_cliente
    ADD CONSTRAINT preferencias_cliente_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente) ON DELETE CASCADE;


--
-- Name: procesamiento_detalle procesamiento_detalle_id_procesamiento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamiento_detalle
    ADD CONSTRAINT procesamiento_detalle_id_procesamiento_fkey FOREIGN KEY (id_procesamiento) REFERENCES public.procesamientos_lote(id_procesamiento) ON DELETE CASCADE;


--
-- Name: procesamiento_detalle procesamiento_detalle_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamiento_detalle
    ADD CONSTRAINT procesamiento_detalle_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto);


--
-- Name: procesamientos_lote procesamientos_lote_id_lote_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamientos_lote
    ADD CONSTRAINT procesamientos_lote_id_lote_fkey FOREIGN KEY (id_lote) REFERENCES public.lotes(id_lote);


--
-- Name: procesamientos_lote procesamientos_lote_procesado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procesamientos_lote
    ADD CONSTRAINT procesamientos_lote_procesado_por_fkey FOREIGN KEY (procesado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: productos productos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: productos productos_id_presentacion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_id_presentacion_fkey FOREIGN KEY (id_presentacion) REFERENCES public.presentaciones_catalogo(id_presentacion);


--
-- Name: promocion_productos promocion_productos_id_producto_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocion_productos
    ADD CONSTRAINT promocion_productos_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto) ON DELETE CASCADE;


--
-- Name: promocion_productos promocion_productos_id_promocion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocion_productos
    ADD CONSTRAINT promocion_productos_id_promocion_fkey FOREIGN KEY (id_promocion) REFERENCES public.promociones(id_promocion) ON DELETE CASCADE;


--
-- Name: reporte_respuestas reporte_respuestas_id_empleado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_respuestas
    ADD CONSTRAINT reporte_respuestas_id_empleado_fkey FOREIGN KEY (id_empleado) REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE;


--
-- Name: reporte_respuestas reporte_respuestas_id_reporte_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reporte_respuestas
    ADD CONSTRAINT reporte_respuestas_id_reporte_fkey FOREIGN KEY (id_reporte) REFERENCES public.reportes_empleado(id_reporte) ON DELETE CASCADE;


--
-- Name: reportes_empleado reportes_empleado_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_empleado
    ADD CONSTRAINT reportes_empleado_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: reportes_empleado reportes_empleado_id_empleado_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reportes_empleado
    ADD CONSTRAINT reportes_empleado_id_empleado_fkey FOREIGN KEY (id_empleado) REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE;


--
-- Name: resenas resenas_id_detalle_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resenas
    ADD CONSTRAINT resenas_id_detalle_pedido_fkey FOREIGN KEY (id_detalle_pedido) REFERENCES public.detalle_pedidos(id_detalle) ON DELETE CASCADE;


--
-- Name: transportadoras transportadoras_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportadoras
    ADD CONSTRAINT transportadoras_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.usuarios(id_usuario);


--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: cosecha_detalle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cosecha_detalle ENABLE ROW LEVEL SECURITY;

--
-- Name: cosechas_planeadas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cosechas_planeadas ENABLE ROW LEVEL SECURITY;

--
-- Name: cotizaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: cotizaciones_productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cotizaciones_productos ENABLE ROW LEVEL SECURITY;

--
-- Name: cupones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cupones ENABLE ROW LEVEL SECURITY;

--
-- Name: descuentos_volumen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.descuentos_volumen ENABLE ROW LEVEL SECURITY;

--
-- Name: despacho_pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despacho_pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: despachos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.despachos ENABLE ROW LEVEL SECURITY;

--
-- Name: detalle_pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detalle_pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: entregas_finca; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entregas_finca ENABLE ROW LEVEL SECURITY;

--
-- Name: envios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envios ENABLE ROW LEVEL SECURITY;

--
-- Name: etapas_procesamiento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.etapas_procesamiento ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_lote; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_lote ENABLE ROW LEVEL SECURITY;

--
-- Name: facturas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

--
-- Name: fincas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fincas ENABLE ROW LEVEL SECURITY;

--
-- Name: formatos_producto; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formatos_producto ENABLE ROW LEVEL SECURITY;

--
-- Name: lotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

--
-- Name: niveles_lealtad; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.niveles_lealtad ENABLE ROW LEVEL SECURITY;

--
-- Name: notificaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_cafe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_cafe ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

--
-- Name: perdidas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perdidas ENABLE ROW LEVEL SECURITY;

--
-- Name: preferencias_cliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.preferencias_cliente ENABLE ROW LEVEL SECURITY;

--
-- Name: presentaciones_catalogo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presentaciones_catalogo ENABLE ROW LEVEL SECURITY;

--
-- Name: procesamiento_detalle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procesamiento_detalle ENABLE ROW LEVEL SECURITY;

--
-- Name: procesamientos_lote; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.procesamientos_lote ENABLE ROW LEVEL SECURITY;

--
-- Name: productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: promocion_productos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promocion_productos ENABLE ROW LEVEL SECURITY;

--
-- Name: promociones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

--
-- Name: reporte_respuestas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reporte_respuestas ENABLE ROW LEVEL SECURITY;

--
-- Name: reportes_empleado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reportes_empleado ENABLE ROW LEVEL SECURITY;

--
-- Name: resenas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resenas ENABLE ROW LEVEL SECURITY;

--
-- Name: transportadoras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transportadoras ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 2eAKVXc7ZLm5H3EikxtxQpqhzPxHOCWHPl90mKCvM5YHaqjG0htNGPhbpSv0txP

