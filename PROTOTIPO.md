# PROTOTIPO — Flujo unificado de Cosechas, Procesamiento de Lotes y Pérdidas

> **Para:** Equipo backend (y frontend) de Granova
> **Tipo:** Prototipo funcional / especificación de comportamiento y de API
> **Alcance:** Cambios necesarios para que "Procesar Lote" deje el lote en **"Procesando"**, aparezca en **"Cosechas Planeadas"**, y solo se sume al catálogo desde un botón **"Agregar a catálogo"**. Además: precio por kg con cálculo automático en "Control de Lotes" y "Cosechas Planeadas", eliminación del botón **"+ Planear cosecha"**, y pérdida que descuenta proporcionalmente el stock del lote.

---

## 0. Resumen ejecutivo (lo que cambia)

Hoy existen **dos caminos paralelos** que confunden:

1. **Cosechas planeadas** (tabla `cosechas_planeadas` + `cosecha_detalle`), creadas a mano con el botón "+ Planear cosecha".
2. **Procesar Lote** (`procesamientos_lote` + `procesamiento_detalle`), que aplica todo **de inmediato** (crea productos, suma stock y descuenta kg del lote) y **no deja ningún registro visible como "Procesando"** ni aparece en "Cosechas Planeadas". Por eso "se queda quieto y no sale nada".

El objetivo es **unificar**:

```
Registrar entrega (Control de Lotes)
        │  cantidad_kg × precio_kg  →  valor total (en vivo)
        ▼
Lote en inventario con kg disponibles
        │
Procesar Lote (Control de Inventario)
        │  elige presentaciones y cantidades
        ▼
Procesamiento en estado "Procesando"
        │  (NO crea productos, NO suma stock, NO descuenta kg todavía)
        ▼
Cosechas Planeadas (bandeja única)
        │  botón "Agregar a catálogo" (solo cuando ya tiene sus presentaciones)
        ▼
Catálogo (se SUMA stock: nunca sobreescribe ni elimina stock existente)
```

Cambios clave:

- **`POST /inventario/lotes/:id/procesar`** deja de materializar productos; solo crea el procesamiento en `estado = 'procesando'` con sus repartos.
- **`GET /inventario/cosechas`** pasa a devolver la bandeja única: procesamientos `procesando` **+** cosechas planeadas históricas, con un `origen` que las distingue.
- **Nuevo `POST /inventario/procesamientos/:id/agregar-catalogo`**: único punto donde se crean/suman productos y se descuentan los kg del lote.
- **Se elimina el botón "+ Planear cosecha"** (el frontend ya no llama a `POST /inventario/cosechas` para crear; la planeación viene solo de Procesar Lote).
- **"Control de Lotes"** pide `cantidad_kg` + `precio_kg` y el backend (y el frontend en vivo) calculan `valor_total`.
- **"Cosechas Planeadas"** pide solo `precio_kg`; el total se calcula solo.
- **Pérdida**: al marcar `kg_perdido`, el sistema descuenta **proporcionalmente** el stock de los productos ya creados de ese lote (visible en la vista de inventario), sin pedir que se vuelva a escribir "en proceso".

---

## 1. Problemas reportados (a corregir)

| # | Problema reportado | Causa raíz actual |
|---|---|---|
| 1 | Al procesar un lote y confirmar, no cambia a "Procesando"; se queda quieto y no aparece nada en el otro menú. | `procesarLote` materializa todo de una vez y no crea ningún registro con estado "procesando" que la bandeja de Cosechas Planeadas pueda leer. |
| 2 | "+ Planear cosecha" no debería existir; la planeación se hace desde Control de Inventario al procesar el lote. | El frontend muestra un botón que llama a `crearCosecha`; ese camino manual ya no aplica. |
| 3 | En "Cosechas Planeadas" al agregar solo se quiere poner el **precio del café** y que el programa calcule el total. | El formulario pide `kg_estimados` y `valor_estimado` por separado. |
| 4 | En "Control de Lotes" se quiere poner **cantidad y precio**, y que el programa calcule el **valor a pagar** y lo muestre abajo antes de guardar (ej.: 1000 pesos/kg × cantidad). | El formulario pide `cantidad_kg` y `valor` como dos campos sueltos. |
| 5 | Al marcar "perdido", el programa debe descontar del stock que ya está guardado, **sin tener que escribir "en proceso" de nuevo**. | `actualizarPerdidaProceso` solo guarda `kg_perdido`/`kg_en_proceso` en el lote; no toca el stock de los productos del lote. |
| 6 | En "Cosechas Planeadas" debe existir un botón "Agregar a catálogo" cuando la cosecha ya tiene sus presentaciones. | No existe ese endpoint; hoy solo hay `confirmar` (creación manual) que hace todo junto. |
| 7 | Texto explicativo pequeño al agregar: el producto "se va a sumar al catálogo **sin eliminar el stock**, sino solo agregando". | Falta el mensaje/contrato de que la operación es aditiva. |

---

## 2. Flujo objetivo (paso a paso)

### Paso A — Registrar entrega (Control de Lotes)
El empleado registra la entrega de la finca con **cantidad (kg)** y **precio por kg**. El sistema:
1. Calcula `valor_total = cantidad_kg × precio_kg` (y lo muestra en vivo antes de guardar).
2. Calcula `kg_netos` aplicando las mermas (`merma_cereza_pergamino_pct` y `merma_pergamino_tostado_pct`).
3. Suma `kg_netos` al lote (`lotes.cantidad_kg`) y deja la entrega en `estado = 'registrada'`.

### Paso B — Procesar lote (Control de Inventario)
El empleado elige presentaciones y cantidades sobre los kg **disponibles** del lote. Al confirmar:
1. Se valida que el reparto no supere el kg disponible.
2. Se crea un registro en `procesamientos_lote` con `estado = 'procesando'`.
3. Se guardan los repartos (presentación + cantidad) sin crear productos todavía.
4. **No** se suma stock y **no** se descuentan kg del lote en este paso.
5. El registro aparece en la bandeja **"Cosechas Planeadas"** con estado **"Procesando"**.

### Paso C — Agregar a catálogo (Cosechas Planeadas)
Cuando el procesamiento ya tiene sus presentaciones planeadas, aparece el botón **"Agregar a catálogo"**. Al presionarlo:
1. Se crean los productos si no existen (con nombre, costo y precio calculados desde el costo real del lote) o se **suma** stock a los existentes (`stock = stock + cantidad`). **Nunca** se sobreescribe ni se elimina stock.
2. Se registra el detalle en `procesamiento_detalle`.
3. Se descuentan los `kg_utilizados` del lote (`lotes.cantidad_kg = cantidad_kg - kg_utilizados`).
4. El procesamiento pasa a `estado = 'completado'` con `fecha_completado` y `agregado_por`.
5. Los productos quedan visibles y vendibles en el **catálogo**.

> **Texto de ayuda (tooltip/subtexto pequeño) al lado del botón "Agregar a catálogo":**
> "El producto se va a sumar al catálogo sin eliminar el stock existente; solo agrega las unidades nuevas."

### Paso D — Pérdida (Control de Inventario / vista de inventario)
Cuando se marca `kg_perdido` en un lote:
1. El lote guarda el nuevo `kg_perdido` (y el `kg_disponible` se recalcula).
2. **Automáticamente** se descuenta de forma **proporcional** el stock de los productos **ya creados** de ese lote (opción a): si el lote perdió 5 kg y tiene 2 productos, la pérdida se reparte entre ambos según el kg que representa cada uno (unidades × `kg_equivalente`).
3. El descuento queda reflejado en la **vista de inventario** (`GET /inventario/por-finca`), que muestra el stock ya descontado y el `kg_disponible` del lote.
4. **No** se pide volver a escribir "en proceso": solo se marca `kg_perdido`.
5. Si el lote no tiene productos creados todavía, la pérdida simplemente sale del kg disponible del lote.

> **Nota de producto (importante):** El catálogo de venta solo recibe stock cuando se presiona **"Agregar a catálogo"** (operación aditiva). La pérdida ajusta los productos **del lote** (los que se ven en la vista de inventario), porque son el reflejo de ese café. No se debe implementar un descuento global sobre el catálogo: la pérdida afecta al lote y a sus productos, no a productos de otros lotes.

---

## 3. Modelo de datos — migraciones (PostgreSQL)

El backend usa `pg` (PostgreSQL). Migraciones idempotentes:

```sql
-- 1) procesamientos_lote: ciclo de vida (estado + fechas)
ALTER TABLE procesamientos_lote
  ADD COLUMN IF NOT EXISTS estado          VARCHAR(20) NOT NULL DEFAULT 'procesando',
  ADD COLUMN IF NOT EXISTS fecha_procesado TIMESTAMP,
  ADD COLUMN IF NOT EXISTS fecha_completado TIMESTAMP,
  ADD COLUMN IF NOT EXISTS agregado_por    INTEGER REFERENCES usuarios(id_usuario);

-- Marcamos como 'completado' los procesamientos históricos que ya
-- materializaron productos (ya tienen detalle con id_producto).
UPDATE procesamientos_lote pl
   SET estado = 'completado',
       fecha_completado = COALESCE(pl.fecha_completado, pl.fecha)
 WHERE pl.estado = 'procesando'
   AND EXISTS (SELECT 1 FROM procesamiento_detalle pd
               WHERE pd.id_procesamiento = pl.id_procesamiento
                 AND pd.id_producto IS NOT NULL);

-- 2) procesamiento_detalle: permitir planear sin producto todavía
ALTER TABLE procesamiento_detalle ALTER COLUMN id_producto DROP NOT NULL;

-- 3) entregas_finca: precio_kg para trazabilidad (opcional pero recomendado)
ALTER TABLE entregas_finca ADD COLUMN IF NOT EXISTS precio_kg NUMERIC(12,2);

-- 4) cosechas_planeadas: precio_kg para trazabilidad (opcional)
ALTER TABLE cosechas_planeadas ADD COLUMN IF NOT EXISTS precio_kg NUMERIC(12,2);
```

> `procesamientos_lote.fecha` ya existe (se usa en el historial de empleados); el `estado` es la columna nueva clave.

---

## 4. API — especificación de endpoints

### 4.1 Control de Lotes

#### 4.1.1 NUEVO — `POST /inventario/entregas/calcular`
Cálculo en vivo antes de guardar (sin efectos en BD). El frontend lo llama al teclear cantidad/precio.

**Body**
```json
{
  "cantidad_kg": 120,
  "precio_kg": 1000,
  "tipo_cafe": "pergamino"
}
```

**Respuesta 200**
```json
{
  "ok": true,
  "cantidad_kg": 120,
  "precio_kg": 1000,
  "tipo_cafe": "pergamino",
  "valor_total": 120000,
  "kg_netos": 98.4,
  "costo_por_kg_neto": 1219.51
}
```

- `valor_total = cantidad_kg × precio_kg`
- `kg_netos` según mermas (cereza: ×0.78 ×0.82; pergamino: ×0.82).
- `costo_por_kg_neto = valor_total / kg_netos` (lo que de verdad cuesta cada kg neto).

#### 4.1.2 MODIFICADO — `POST /inventario/entregas`
Ahora acepta `precio_kg`; si `valor` no viene, el backend lo calcula.

**Body**
```json
{
  "id_finca": 2,
  "id_lote": 3,
  "cantidad_kg": 120,
  "precio_kg": 1000,
  "tipo_cafe": "pergamino"
}
```

**Respuesta 200**
```json
{
  "ok": true,
  "id_entrega": 41,
  "kg_netos": 98.4,
  "valor": 120000,
  "precio_kg": 1000
}
```

Lógica: `valor = (valor !== undefined) ? valor : cantidad_kg × precio_kg`. Guardar también `precio_kg` (columna nueva).

---

### 4.2 Cosechas Planeadas (bandeja única)

#### 4.2.1 MODIFICADO — `GET /inventario/cosechas?estado=procesando`
Devuelve la bandeja unificada: procesamientos en `procesando` + cosechas planeadas históricas. Cada ítem trae `origen` y sus `repartos`.

**Respuesta 200**
```json
{
  "ok": true,
  "cosechas": [
    {
      "id": 15,
      "origen": "procesamiento",
      "estado": "procesando",
      "id_lote": 3,
      "codigo_lote": "L-003",
      "finca_nombre": "Finca La Esperanza",
      "variedad": "Castillo",
      "tipo_cafe": "pergamino",
      "kg_utilizados": 12.5,
      "kg_estimados": null,
      "valor_estimado": null,
      "fecha_planeada": "2026-08-25T18:00:00.000Z",
      "puedeAgregarCatalogo": true,
      "repartos": [
        { "id_presentacion": 1, "presentacion_nombre": "Bolsa 250 g", "kg_equivalente": 0.25, "cantidad": 50 }
      ]
    },
    {
      "id": 7,
      "origen": "cosecha",
      "estado": "planeada",
      "id_lote": 1,
      "codigo_lote": "L-001",
      "finca_nombre": "Finca El Recreo",
      "variedad": "Caturra",
      "tipo_cafe": "cereza",
      "kg_utilizados": null,
      "kg_estimados": 100,
      "valor_estimado": 90000,
      "fecha_planeada": "2026-08-20T10:00:00.000Z",
      "puedeAgregarCatalogo": false,
      "repartos": [
        { "id_presentacion": 2, "presentacion_nombre": "Bolsa 500 g", "kg_equivalente": 0.5, "cantidad": 60 }
      ]
    }
  ]
}
```

- `puedeAgregarCatalogo = (estado === 'procesando' && repartos.length > 0)`.
- El frontend muestra el botón **"Agregar a catálogo"** solo cuando `puedeAgregarCatalogo === true`.
- El estado visible en la bandeja es **"Procesando"**.

#### 4.2.2 NUEVO — `POST /inventario/cosechas/calcular`
Cálculo en vivo: solo se pide el **precio por kg**; el programa calcula el total.

**Body**
```json
{ "kg_estimados": 100, "precio_kg": 900, "tipo_cafe": "cereza" }
```

**Respuesta 200**
```json
{
  "ok": true,
  "kg_estimados": 100,
  "precio_kg": 900,
  "tipo_cafe": "cereza",
  "valor_estimado": 90000,
  "kg_netos_estimados": 63.96,
  "costo_por_kg_neto": 1407.13
}
```

- `valor_estimado = kg_estimados × precio_kg`
- `kg_netos_estimados` según mermas.
- `costo_por_kg_neto = valor_estimado / kg_netos_estimados`.

#### 4.2.3 DEPRECADO para el frontend — `POST /inventario/cosechas`
Se elimina el botón **"+ Planear cosecha"**. El endpoint `crearCosecha` puede quedar por compatibilidad con datos históricos, pero **el frontend ya no debe llamarlo** para crear: la planeación viene de `Procesar Lote`. (Opcional: el backend puede rechazar nuevos `crearCosecha` con un `410 Gone` y un mensaje "La planeación se hace desde Control de Inventario → Procesar Lote".)

---

### 4.3 Procesar Lote

#### 4.3.1 MODIFICADO — `POST /inventario/lotes/:id/procesar`
Ya **no** crea productos ni suma stock ni descuenta kg. Solo **planea**: crea el procesamiento en `procesando` con sus repartos.

**Body**
```json
{
  "repartos": [
    { "id_presentacion": 1, "cantidad": 50 },
    { "id_presentacion": 2, "cantidad": 20 }
  ]
}
```

**Respuesta 200**
```json
{
  "ok": true,
  "id_procesamiento": 15,
  "estado": "procesando",
  "kg_utilizados": 12.5,
  "kg_disponible_restante": 87.5
}
```

Validaciones que se mantienen:
- Al menos un reparto válido.
- La presentación existe y está activa.
- `kg_utilizados ≤ kg_disponible` (con tolerancia 0.001).

Dentro de la transacción:
```sql
INSERT INTO procesamientos_lote (id_lote, kg_utilizados, procesado_por, estado, fecha_procesado)
VALUES ($1, $2, $3, 'procesando', NOW())
RETURNING id_procesamiento;

-- por cada reparto (id_producto NULL por ahora)
INSERT INTO procesamiento_detalle (id_procesamiento, id_producto, id_presentacion, cantidad, cantidad_agregada)
VALUES ($1, NULL, $2, $3, 0);
```
> Nota: `procesamiento_detalle` necesita una columna `id_presentacion` (ver §4.4, o reutilizar la que exista; si no existe, agregarla en la migración). Si se prefiere no tocar `procesamiento_detalle`, se puede guardar el reparto planeado en `cosecha_detalle` apuntando a la misma fila de `procesamientos_lote`; **se recomienda** documentar la decisión en el código.

#### 4.3.2 NUEVO — `POST /inventario/procesamientos/:id/agregar-catalogo`
**Único punto** donde se materializa el reparto en el catálogo (aditivo).

**Body**: vacío (el usuario que confirma se toma de `req.usuario.id`).

**Respuesta 200**
```json
{
  "ok": true,
  "id_procesamiento": 15,
  "estado": "completado",
  "kg_utilizados": 12.5,
  "productos": [
    { "id_producto": 88, "nombre": "Castillo · Bolsa 250 g · Finca La Esperanza", "cantidad_agregada": 50, "stock_resultante": 150 },
    { "id_producto": 89, "nombre": "Castillo · Bolsa 500 g · Finca La Esperanza", "cantidad_agregada": 20, "stock_resultante": 20 }
  ]
}
```

Lógica (todo en una transacción, con `FOR UPDATE` sobre el lote y el procesamiento):
1. Solo si `estado = 'procesando'`; si ya está completado → `409`.
2. Recalcular `costo_kg` real del lote y márgenes (mismo criterio del `procesarLote` actual).
3. Por cada reparto:
   - Si existe producto activo (`id_lote` + `id_presentacion`) → `stock = stock + cantidad` (**nunca** sobreescribir).
   - Si no existe → crear producto con nombre, costo y precio calculados, `stock = cantidad`.
4. Actualizar `procesamiento_detalle`: `id_producto`, `cantidad_agregada = cantidad`.
5. Descontar kg: `lotes.cantidad_kg = cantidad_kg - kg_utilizados` (validar que no quede negativo; si pasa, error 400 "No hay suficiente kg en el lote").
6. Actualizar estado del lote (`agotado` si ya no queda stock en productos).
7. `procesamientos_lote.estado = 'completado'`, `fecha_completado = NOW()`, `agregado_por = req.usuario.id`.

> Este helper (`aplicarRepartoACatalogo`) es el mismo que usará el `confirmarCosecha` histórico si se conserva, para no duplicar lógica.

#### 4.3.3 NUEVO (opcional) — `POST /inventario/procesamientos/:id/cancelar`
Cancela un procesamiento en `procesando` (cambia a `cancelada`). No afecta stock ni kg (nada se materializó). Permite "deshacer" una planeación antes de agregarla al catálogo.

**Respuesta 200**
```json
{ "ok": true, "id_procesamiento": 15, "estado": "cancelada" }
```

---

### 4.4 Pérdida proporcional

#### 4.4.1 MODIFICADO — `PATCH /inventario/lotes/:id/perdida-proceso`
Ahora, cuando `kg_perdido` aumenta, el backend **descuenta proporcionalmente** el stock de los productos activos del lote. `kg_en_proceso` solo se guarda (no toca stock).

**Body**
```json
{ "kg_perdido": 5, "kg_en_proceso": 0 }
```

**Respuesta 200**
```json
{
  "ok": true,
  "kg_perdido": 5,
  "kg_en_proceso": 0,
  "kg_disponible": 95,
  "descuentos": [
    { "id_producto": 88, "nombre": "Castillo · Bolsa 250 g · Finca La Esperanza", "stock_antes": 150, "kg_descontados": 2.5, "stock_despues": 140 }
  ]
}
```

Lógica:
1. `nuevo_perdido = Number(kg_perdido)`, `anterior = lote.kg_perdido`, `incremento = nuevo_perdido - anterior` (si `incremento <= 0`, no hay descuento).
2. Si `incremento > 0` y el lote tiene productos activos:
   - Calcular el kg que representa cada producto: `kg_producto = stock × kg_equivalente`.
   - `total_kg_productos = Σ kg_producto`.
   - Para cada producto: `kg_a_descontar = incremento × (kg_producto / total_kg_productos)`.
   - `unidades_a_descontar = floor(kg_a_descontar / kg_equivalente)` (sin dejar stock negativo).
   - `productos.stock = GREATEST(stock - unidades_a_descontar, 0)`.
3. Guardar `kg_perdido` y `kg_en_proceso` en el lote; validar `kg_perdido + kg_en_proceso ≤ cantidad_kg`.
4. Si algún producto queda en 0, se refleja en la vista de inventario; el estado del lote pasa a `agotado` si ya no queda stock en productos.
5. La vista `GET /inventario/por-finca` ya muestra `kg_perdido`, `kg_en_proceso` y `productos[].stock` → el descuento se ve ahí de inmediato. **No** se requiere volver a escribir "en proceso".

> Si no hay productos creados todavía para ese lote, el incremento solo se guarda en `lotes.kg_perdido` (sale del kg disponible).

---

## 5. Cálculos (resumen de fórmulas)

| Concepto | Fórmula |
|---|---|
| `kg_netos` entrega | cereza: `cantidad_kg × (100-merma_cereza_pergamino_pct)/100 × (100-merma_pergamino_tostado_pct)/100`; pergamino: `cantidad_kg × (100-merma_pergamino_tostado_pct)/100` |
| `valor_total` entrega | `cantidad_kg × precio_kg` |
| `costo_por_kg_neto` | `valor_total / kg_netos` |
| `valor_estimado` cosecha | `kg_estimados × precio_kg` |
| `kg_netos_estimados` | igual a `kg_netos` pero sobre `kg_estimados` |
| `costo_kg` real del lote | `SUM(valor) / SUM(kg_netos)` de `entregas_finca` en `registrada` |
| Precio producto nuevo | `costo_unitario = costo_kg × kg_equivalente`; `precio_mayorista = costo_unitario × (1 + margen_venta_mayorista_pct/100)`; `precio_publico = precio_mayorista × (1 + margen_minimo_mayorista_publico_pct/100)` |
| Descuento pérdida (producto i) | `kg_i = stock_i × kg_equivalente_i`; `kg_a_descontar_i = incremento × (kg_i / Σ kg)`; `unidades_i = floor(kg_a_descontar_i / kg_equivalente_i)` |

---

## 6. Textos y cambios de interfaz (frontend)

### Botones / estados
- **Control de Inventario → Procesar Lote**: al confirmar, el lote queda con estado **"Procesando"** y el registro viaja a la bandeja de Cosechas Planeadas.
- **Cosechas Planeadas**:
  - Eliminar el botón **"+ Planear cosecha"**.
  - Mostrar la bandeja única con estado **"Procesando"** para los registros que vienen de Procesar Lote.
  - Por cada registro que **ya tiene sus presentaciones** (`puedeAgregarCatalogo === true`), mostrar el botón **"Agregar a catálogo"**.
- **Campo de precio en Cosechas Planeadas**: solo se pide **"Precio por kg ($)"**; el programa muestra el total abajo (en vivo).

### Textos
- **Al lado del botón "Agregar a catálogo"** (tooltip / subtexto pequeño):
  > "El producto se va a sumar al catálogo sin eliminar el stock existente; solo agrega las unidades nuevas."
- **Control de Lotes — Registrar entrega**:
  - Campos: **"Cantidad (kg)"** y **"Precio por kg ($)"**.
  - Debajo, en vivo: **"Valor a pagar: $120.000"** y **"Equivale a X kg netos"**.
- **Pérdida**: al marcar **"Kg perdido"** se muestra: **"Se descontará proporcionalmente del stock de los productos de este lote (visible en inventario)."**

---

## 7. Checklist de implementación (backend)

- [ ] Migración: `procesamientos_lote.estado` (+ `fecha_procesado`, `fecha_completado`, `agregado_por`).
- [ ] Migración: `procesamiento_detalle.id_producto` nullable (+ `id_presentacion`/`cantidad` si se usan para planear).
- [ ] Migración: `entregas_finca.precio_kg` y `cosechas_planeadas.precio_kg` (trazabilidad).
- [ ] `POST /inventario/entregas/calcular` (nuevo).
- [ ] `POST /inventario/entregas`: aceptar `precio_kg` y calcular `valor`.
- [ ] `POST /inventario/lotes/:id/procesar`: dejar de materializar; crear `procesando` con repartos.
- [ ] `POST /inventario/procesamientos/:id/agregar-catalogo` (nuevo, aditivo).
- [ ] `POST /inventario/procesamientos/:id/cancelar` (nuevo, opcional).
- [ ] `GET /inventario/cosechas`: bandeja única (`origen`, `repartos`, `puedeAgregarCatalogo`).
- [ ] `PATCH /inventario/lotes/:id/perdida-proceso`: descuento proporcional del stock del lote.
- [ ] `GET /inventario/por-finca`: exponer `kg_disponible` y el stock ya descontado (verificar que se vea).
- [ ] Rutas nuevas en `routes/admin/inventarioRoutes.js` (mismas restricciones de rol: lectura admin/empleado, escritura empleado).

## 8. Checklist frontend

- [ ] Eliminar botón "+ Planear cosecha".
- [ ] Bandeja única "Cosechas Planeadas" con estado "Procesando" (consumir `GET /inventario/cosechas` con `origen`).
- [ ] Botón "Agregar a catálogo" (solo si `puedeAgregarCatalogo`), con su texto explicativo.
- [ ] Registrar entrega: campos cantidad + precio por kg, total en vivo con `POST /inventario/entregas/calcular`.
- [ ] Cosechas Planeadas: solo precio por kg, total en vivo con `POST /inventario/cosechas/calcular`.
- [ ] Pérdida: mensaje del descuento proporcional; no pedir "en proceso".
