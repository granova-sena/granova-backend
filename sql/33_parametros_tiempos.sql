-- =============================================================================
-- 33. Parámetros de tiempos de venta online (configurables desde el panel)
-- -----------------------------------------------------------------------------
-- Define las ventanas de tiempo que usan la tienda y el backend:
--
--   TIEMPO_PAGO_HORAS            = 3   -> cuántas horas tiene el cliente para
--                                         pagar antes de que el pedido se
--                                         cancele automáticamente (liberar stock).
--   TIEMPO_PREPARACION_HORAS     = 6   -> horas estimadas para preparar/empacar
--                                         el pedido una vez pagado.
--   TIEMPO_ENTREGA_DOMICILIO_HORAS = 24 -> horas estimadas de entrega (domicilio).
--   TIEMPO_ENTREGA_REPARTO_HORAS   = 48 -> horas estimadas de entrega (reparto
--                                         por rutas de sector).
--
-- Idempotente: si la clave ya existe solo actualiza el valor/descripción.
-- Los tiempos estimados se muestran al cliente en el detalle de su pedido.
-- =============================================================================

INSERT INTO parametros_cafe (clave, valor, descripcion)
SELECT v.clave, v.valor, v.descripcion
FROM (VALUES
  ('TIEMPO_PAGO_HORAS',            '3', 'Horas que tiene el cliente para pagar antes de cancelar el pedido'),
  ('TIEMPO_PREPARACION_HORAS',     '6', 'Horas estimadas para preparar y empacar el pedido'),
  ('TIEMPO_ENTREGA_DOMICILIO_HORAS','24', 'Horas estimadas de entrega para domicilio'),
  ('TIEMPO_ENTREGA_REPARTO_HORAS',  '48', 'Horas estimadas de entrega para reparto (rutas por sector)')
) AS v(clave, valor, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM parametros_cafe pc WHERE pc.clave = v.clave);

UPDATE parametros_cafe SET valor = '3',  descripcion = 'Horas que tiene el cliente para pagar antes de cancelar el pedido'     WHERE clave = 'TIEMPO_PAGO_HORAS';
UPDATE parametros_cafe SET valor = '6',  descripcion = 'Horas estimadas para preparar y empacar el pedido'                        WHERE clave = 'TIEMPO_PREPARACION_HORAS';
UPDATE parametros_cafe SET valor = '24', descripcion = 'Horas estimadas de entrega para domicilio'                                WHERE clave = 'TIEMPO_ENTREGA_DOMICILIO_HORAS';
UPDATE parametros_cafe SET valor = '48', descripcion = 'Horas estimadas de entrega para reparto (rutas por sector)'               WHERE clave = 'TIEMPO_ENTREGA_REPARTO_HORAS';