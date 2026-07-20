import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Configuración para mantener la conexión activa
  max: 10,                // máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,    // cierra conexiones inactivas después de 30s
  connectionTimeoutMillis: 10000, // timeout al conectar
});

// Maneja errores inesperados sin crashear el servidor
pool.on("error", (err) => {
  console.error("Error inesperado en el pool:", err.message);
});

pool.connect()
  .then(client => {
    console.log("✅ Conectado a Supabase PostgreSQL");
    client.release();
  })
  .catch(err => console.error("❌ Error conectando:", err.message));

export default pool;