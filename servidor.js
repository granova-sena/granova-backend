import express from "express"
import "dotenv/config"
import dns from "node:dns"

// Railway (y otros proveedores cloud) no soportan salida a internet por IPv6.
// Esto hace que Node prefiera direcciones IPv4 al resolver dominios externos
// (Gmail, APIs, etc.), evitando errores "ENETUNREACH" como el que tuvimos
// con el envío de correos.
dns.setDefaultResultOrder("ipv4first")

import authRoutes from "./routes/authRoutes.js"
import usuariosRoutes from "./routes/usuariosRoutes.js"
import cors from "cors"
import asistenteRoutes from "./routes/asistenteRoutes.js"
import productosRoutes from "./routes/productosRoutes.js"
import fincasRoutes from "./routes/fincasRoutes.js"
import pedidosRoutes from "./routes/pedidosRoutes.js"

// Rutas del panel admin (aportadas por Daniel Rocha)
import dashboardRoutes from "./routes/admin/dashboardRoutes.js"
import inventarioRoutes from "./routes/admin/inventarioRoutes.js"
import ventasRoutes from "./routes/admin/ventasRoutes.js"
import alertasAdminRoutes from "./routes/admin/alertasRoutes.js"
import pedidosAdminRoutes from "./routes/admin/pedidosRoutes.js"
import usuariosAdminRoutes from "./routes/admin/usuariosRoutes.js"

const app = express()
app.set('trust proxy', 1)
const puerto = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use("/asistente", asistenteRoutes)
app.use("/auth", authRoutes)
app.use("/usuarios", usuariosRoutes)
app.use("/productos", productosRoutes)
app.use("/fincas", fincasRoutes)
app.use("/pedidos", pedidosRoutes)

// Panel admin (Daniel Rocha) - todo bajo el prefijo /api para no chocar
// con las rutas de cliente de arriba
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/inventario", inventarioRoutes)
app.use("/api/ventas", ventasRoutes)
app.use("/api/alertas", alertasAdminRoutes)
app.use("/api/pedidos", pedidosAdminRoutes)
app.use("/api/usuarios", usuariosAdminRoutes)

app.get("/", (req, res) => {
    res.send("Backend de Granova activo")
})

app.listen(puerto, () => {
    console.log(`Servidor corriendo en el puerto ${puerto}`)
})