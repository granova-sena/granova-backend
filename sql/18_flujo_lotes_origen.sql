-- 18) Flujo de lotes: de dónde viene cada cosecha planeada
--
-- 'cosecha'      -> café que AÚN NO está en el lote (planear por adelantado,
--                   al confirmar se registra la entrega que llega).
-- 'proceso-lote' -> café que YA estaba pesado en el lote (Control de Inventario
--                   -> Procesar lote). Al confirmar NO se registra entrega nueva
--                   ni se suma kg: el kg que se convierte en producto se
--                   DESCUENTA de la capacidad real del lote (cantidad_kg).
ALTER TABLE cosechas_planeadas
  ADD COLUMN IF NOT EXISTS origen VARCHAR(30) NOT NULL DEFAULT 'cosecha';

-- Las planeadas históricas no se pueden clasificar con certeza; quedan como
-- 'cosecha' (comportamiento anterior). Solo las nuevas creadas desde
-- "Procesar lote" llevan origen = 'proceso-lote'.