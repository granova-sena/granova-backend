import express from "express";
import cors from "cors";
import "dotenv/config";
import productosRoutes from "./routes/productosRoutes.js";
import pedidosRoutes from "./routes/pedidosRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/pedidos", pedidosRoutes);

app.use("/api/productos", productosRoutes);

app.get("/", (req, res) => {
  res.json({ mensaje: "Servidor Granova funcionando" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});