# Granova — Plan de mejoras (mejoras.txt nuevo) · F1 a F6

Decisiones del usuario (confirmadas):
- Cotizaciones → se agregan al menú del cliente (`ClienteLayout`, ruta `/cliente/cotizacion`).
- "Pedidos" del cliente → "Mis compras": renombrar + paginación (5) + búsqueda.
- Transportadoras → solo Acarreo/Reparto (se elimina Activo/Inactivo como estado visible; el tipo pasa a ser lo único que las distingue).
- Filtros a rediseñar → GestionPedidos (admin) + PedidosReparto/Despachos (logística).
- Orden: ejecutar TODO desde F1.

## F1 — Bugs críticos
1. **Sesiones** (`src/services/session.js`, `api.js`, `RutaProtegida.jsx`, `RutaProtegidaCliente.jsx`, layouts, `Login.jsx`, `AdminLogin.jsx`, `CarritoContext.jsx`, `MiCuenta.jsx`):
   - `setClienteToken` también borra `token_empleado`+`usuario`; `setEmpleadoToken` también borra `token_cliente`+`cliente`.
   - `clearClienteToken` borra `cliente`; `clearEmpleadoToken` borra `usuario`; nuevo `limpiarTodo()` borra las 4 claves + legacy y se usa en todos los logout.
   - `RutaProtegidaCliente` valida expiración y que el token no tenga `rol` (shape de cliente).
   - Interceptor `api.js`: manejar 401 (limpiar token del rol activo + redirigir a `/login` o `/control-interno`) y 403 en rutas de panel → limpiar y a `/control-interno`.
2. **Correo/dominio** (`config/email.js`, `controllers/authController.js`, `controllers/AsistenteController.js`, `server.js`):
   - Centralizar dominio en `FRONTEND_URL` con fallback ok; mover `BREVO_API_URL` y `N8N_WEBHOOK_URL` a env (quitar hardcodes de n8n).
   - Agregar `api.granovaoficial.com` al CORS. Documentar variables requeridas en Railway (`.env.example`).
3. **Factura dueño** (`routes/facturasRoutes.js`, `controllers/facturasController.js`, `MisPedidos.jsx`, `components/FacturaModal.jsx`, `controllers/admin/ventasController.js`):
   - POST `/facturas` accesible al dueño del pedido (validar `req.usuario.id == pedido.id_cliente`), mantener admin/empleado.
   - `MisPedidos` manda header Authorization en el POST y valida respuesta.
   - `FacturaModal` muestra descuento (+ envio/IVA) para que el total cuadre con lo cobrado.
4. **Reportes** (`src/pages/Empleados.jsx`, `src/pages/ReportesVentas.jsx`): cerrar "Enviando..." con finally; interceptor 403 cubre el rol; lista admin se refresca tras cargar.

## F2 — Lealtad y empresas
5. **Cupones por nivel + historial** (`controllers/cuponesController.js`, `utils/lealtad.js`, `MiCuenta.jsx`, `ConfigurarPedidoPage.jsx`):
   - Niveles desde parámetros (Bronce/Plata/Oro con % distinto) en vez de recompensas fijas; seed `sql/19_niveles_cupon.sql`.
   - `obtenerCupones` devuelve activos + historial de canjeados/agotados; `MiCuenta` muestra todos y avisa "solo 1 cupón por pedido".
6. **Empresa 10→20% configurable** (`pedidosController.js:158`, `CarritoContext.jsx:284`, `SimuladorCompra.jsx:165`, `Catalogo.jsx:400`, `Empresas.jsx`):
   - Parámetro `descuento_empresa_pct` (default 20) + seed; backend y frontend lo leen.
   - Nueva vista admin "Parámetros de negocio" (usa GET/PATCH `/inventario/parametros`) + ítem en DashboardLayout + ruta App.jsx.

## F3 — Inventario empleado
7. **Repartir todos los formatos**: quitar filtro `activo` en `cosechasController.js:45`, `procesamientoLoteController.js:137`, `ControlEmpleado.jsx` (presentaciones) y `ProductoModal.jsx:63`.
8. **Venta manual completa** (`VentaModal`, `controllers/admin/ventasController.js`): formato por ítem, tipo_persona/datos fiscales, dirección/sector/operacion, descuentos (volumen/promo/cupón/empresa), IVA por tasa, método de pago (7) + estado_pago, acreditación de puntos.

## F4 — Logística y transportadoras
9. **Reparto**: en `PedidosReparto.jsx` agregar pestaña "Nuevos (24h)" → "Todos"; botón flujo a salida; `Despachos` prioriza nuevos y luego todos.
10. **Transportadoras solo Acarreo/Reparto**: quitar `estado Activo/Inactivo` del flujo visible (`sql/20_transportadoras_tipo.sql`, `controllers/admin/transportadorasController.js`, `Transportadoras.jsx`); el tipo es lo único que se muestra/filtra.

## F5 — Cliente
11. `Catalogo.jsx` banner B2B → `navigate('/cliente/simulador')`.
12. Quitar `CalculadoraRapida` de las tarjetas (`Catalogo.jsx:835-858,1029`).
13. Quiz por categoría: `RecomendadorModal.jsx` parametrizado (café vs maquinaria) + recomendados según categoría (`preferenciasController`).
14. Contador de favoritos en `ClienteLayout` (desktop + móvil).
15. `MisPedidos` → "Mis compras" + buscador (paginación ya en 5).
16. "Cotizaciones" en el menú del cliente.
17. Logo: presentación consistente (tamaño/fondo) + Landing con imagen.
18. Splash Nequi: overlay de entrada/salida con logo en `main.jsx`/`App.jsx`.

## F6 — UI filtros + validaciones
19. Rediseño de filtros en `GestionPedidos.jsx` (agrupar en buscador+pills simples) y `PedidosReparto.jsx`/`Despachos.jsx`.
20. Capa consistente de validación en backend: `empleadosController.crearEmpleado`, `ventasController.crearVenta`, `lotesController`, `transportadorasController` (400 limpios en vez de 500/FK).

## Verificación
- `node --check` en archivos backend tocados · `npm run build` frontend · commits en `feature/jhon` (backend y frontend).
- Recordar: `git push` + redeploy (Railway/Supabase) y aplicar SQL nuevos.