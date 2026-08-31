import express from "express"
import "dotenv/config"
import cors from "cors"
import dns from "node:dns"

// Railway no soporta IPv6 — forzamos IPv4 para Gmail y APIs externas
dns.setDefaultResultOrder("ipv4first")

// Rutas de Jhon
import authRoutes      from "./routes/authRoutes.js"
import usuariosRoutes  from "./routes/usuariosRoutes.js"
import asistenteRoutes from "./routes/asistenteRoutes.js"
import fincasRoutes    from "./routes/fincasRoutes.js"
import preferenciasRoutes from "./routes/preferenciasRoutes.js"
import clientesRoutes  from "./routes/clientesRoutes.js"
import cuponesRoutes   from "./routes/cuponesRoutes.js"
import promocionesRoutes from "./routes/promocionesRoutes.js"

// Rutas tuyas
import productosRoutes from "./routes/productosRoutes.js"
import pedidosRoutes   from "./routes/pedidosRoutes.js"
import facturasRoutes  from "./routes/facturasRoutes.js"
import correoRoutes    from "./routes/correoRoutes.js"
import lotesRoutes     from "./routes/lotesRoutes.js"
import resenasRoutes   from "./routes/resenasRoutes.js"
import notificacionesRoutes from "./routes/notificacionesRoutes.js"
import pagosRoutes from "./routes/pagosRoutes.js"

// Rutas admin (Daniel)
import dashboardRoutes    from "./routes/admin/dashboardRoutes.js"
import inventarioRoutes   from "./routes/admin/inventarioRoutes.js"
import logisticaRoutes    from "./routes/admin/logisticaRoutes.js"
import ventasRoutes       from "./routes/admin/ventasRoutes.js"
import alertasAdminRoutes from "./routes/admin/alertasRoutes.js"
import pedidosAdminRoutes from "./routes/admin/pedidosRoutes.js"
import promocionesAdminRoutes from "./routes/admin/promocionesRoutes.js"
import resenasAdminRoutes from "./routes/admin/resenasRoutes.js"
import usuariosAdminRoutes from "./routes/admin/usuariosRoutes.js"
import reportesRoutes from "./routes/admin/reportes.js"
import empleadosRoutes from "./routes/admin/empleadosRoutes.js"

const app    = express()
const puerto = process.env.PORT || 3000

app.set('trust proxy', 1)
const origenesPermitidos = [
  'http://localhost:5173',
  'https://www.granovaoficial.com',
  'https://granovaoficial.com'
];

app.use(cors({
  origin: origenesPermitidos,
  credentials: true
}));

app.disable('x-powered-by')
app.use(express.json())

// Rutas cliente
app.use("/auth",      authRoutes)
app.use("/usuarios",  usuariosRoutes)
app.use("/asistente", asistenteRoutes)
app.use("/fincas",    fincasRoutes)
app.use("/productos", productosRoutes)
app.use("/pedidos",   pedidosRoutes)
app.use("/lotes",     lotesRoutes)
app.use("/api/preferencias", preferenciasRoutes)
app.use("/api/clientes",   clientesRoutes)
app.use("/api/cupones",    cuponesRoutes)
app.use("/api/promociones", promocionesRoutes)


// Rutas tuyas con prefijo /api
app.use("/api/productos", productosRoutes)
app.use("/api/pedidos",   pedidosRoutes)
app.use("/api/facturas",  facturasRoutes)
app.use("/api/correo",    correoRoutes)
app.use("/api/resenas",   resenasRoutes)
app.use("/api/notificaciones", notificacionesRoutes)
app.use("/api/pagos",    pagosRoutes)

// Rutas admin
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/inventario", inventarioRoutes)
app.use("/api/logistica",  logisticaRoutes)
app.use("/api/ventas",     ventasRoutes)
app.use("/api/alertas",    alertasAdminRoutes)
app.use("/api/admin/pedidos", pedidosAdminRoutes)
app.use("/api/admin/promociones", promocionesAdminRoutes)
app.use("/api/admin/resenas", resenasAdminRoutes)
app.use("/api/usuarios",   usuariosAdminRoutes)
app.use("/api/reportes",   reportesRoutes)
app.use("/api/empleados",  empleadosRoutes)


app.get("/", (req, res) => {
  res.json({ mensaje: "Backend de Granova activo" })
})

app.listen(puerto, () => {
  console.log(`Servidor corriendo en el puerto ${puerto}`)
})