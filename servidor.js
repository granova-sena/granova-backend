import express from "express"
import "dotenv/config"
import cors from "cors"

import authRoutes       from "./routes/authRoutes.js"
import usuariosRoutes   from "./routes/Usuariosroutes.js"
import asistenteRoutes  from "./routes/asistenteRoutes.js"
import fincasRoutes     from "./routes/fincasRoutes.js"
import correoRoutes from "./routes/correoRoutes.js"
import productosRoutes  from "./routes/productosRoutes.js"
import pedidosRoutes    from "./routes/pedidosRoutes.js"
import facturasRoutes   from "./routes/facturasRoutes.js"

const app    = express()
const puerto = process.env.PORT || 3000

app.use(cors())
app.use(express.json())


app.use("/auth",      authRoutes)
app.use("/usuarios",  usuariosRoutes)
app.use("/asistente", asistenteRoutes)
app.use("/fincas",    fincasRoutes)
app.use("/productos", productosRoutes)

app.use("/api/correo", correoRoutes)
app.use("/api/productos", productosRoutes)
app.use("/api/pedidos",   pedidosRoutes)
app.use("/api/facturas",  facturasRoutes);

app.get("/", (req, res) => {
  res.json({ mensaje: "Backend de Granova activo" })
})

app.listen(puerto, () => {
  console.log(`Servidor corriendo en el puerto ${puerto}`)
})