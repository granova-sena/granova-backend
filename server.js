import express from "express"
import "dotenv/config"
import cors from "cors"
import dns from "node:dns"

dns.setDefaultResultOrder("ipv4first")

import authRoutes from "./routes/authRoutes.js"
import usuariosRoutes from "./routes/usuariosRoutes.js"
import asistenteRoutes from "./routes/asistenteRoutes.js"
import fincasRoutes from "./routes/fincasRoutes.js"
import productosRoutes from "./routes/productosRoutes.js"
import pedidosRoutes from "./routes/pedidosRoutes.js"
import facturasRoutes from "./routes/facturasRoutes.js"
import correoRoutes from "./routes/correoRoutes.js"
import dashboardRoutes from "./routes/admin/dashboardRoutes.js"
import inventarioRoutes from "./routes/admin/inventarioRoutes.js"
import ventasRoutes from "./routes/admin/ventasRoutes.js"
import alertasAdminRoutes from "./routes/admin/alertasRoutes.js"
import pedidosAdminRoutes from "./routes/admin/pedidosRoutes.js"
import usuariosAdminRoutes from "./routes/admin/usuariosRoutes.js"
import reportesRoutes from "./routes/admin/reportes.js"

const app = express()
const puerto = process.env.PORT || 3000

app.set("trust proxy", 1)
app.use(cors())
app.use(express.json())

app.use("/auth", authRoutes)
app.use("/usuarios", usuariosRoutes)
app.use("/asistente", asistenteRoutes)
app.use("/fincas", fincasRoutes)
app.use("/productos", productosRoutes)
app.use("/pedidos", pedidosRoutes)

app.use("/api/productos", productosRoutes)
app.use("/api/facturas", facturasRoutes)
app.use("/api/correo", correoRoutes)

app.use("/api/dashboard", dashboardRoutes)
app.use("/api/inventario", inventarioRoutes)
app.use("/api/ventas", ventasRoutes)
app.use("/api/alertas", alertasAdminRoutes)
app.use("/api/pedidos", pedidosAdminRoutes)
app.use("/api/usuarios", usuariosAdminRoutes)
app.use("/api/reportes", reportesRoutes)

app.get("/", (req, res) => {
  res.json({ mensaje: "Backend de Granova activo" })
})

app.listen(puerto, () => {
  console.log(`Servidor corriendo en el puerto ${puerto}`)
})

export default app
