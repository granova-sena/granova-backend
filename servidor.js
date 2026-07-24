import express from "express"
import "dotenv/config"
import authRoutes from "./routes/authRoutes.js"
import usuariosRoutes from "./routes/usuariosRoutes.js"
import cors from "cors"
import asistenteRoutes from "./routes/asistenteRoutes.js"
import productosRoutes from "./routes/productosRoutes.js"
import fincasRoutes from "./routes/fincasRoutes.js"
import pedidosRoutes from "./routes/pedidosRoutes.js"

const app = express()
const puerto = 3000

app.use(cors())
app.use(express.json())
app.use("/asistente", asistenteRoutes)
app.use("/auth", authRoutes)
app.use("/usuarios", usuariosRoutes)
app.use("/productos", productosRoutes)
app.use("/fincas", fincasRoutes)
app.use("/pedidos", pedidosRoutes)

app.get("/", (req, res) => {
    res.send("Backend de Granova activo")
})

app.listen(puerto, () => {
    console.log(`Servidor corriendo en el puerto ${puerto}`)
})