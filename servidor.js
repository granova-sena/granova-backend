require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
const authRoutes     = require('./routes/authRoutes');
const productosRoutes = require('./routes/productosRoutes');

app.use('/api/auth',      authRoutes);
app.use('/api/productos', productosRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'Servidor Granova funcionando ✅' });
});

app.listen(PORT, () => {
  
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});