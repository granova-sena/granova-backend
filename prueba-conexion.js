import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function probar() {
  try {
    const resultado = await pool.query("SELECT NOW()");
    console.log("✅ Conexión exitosa:", resultado.rows[0]);
  } catch (error) {
    console.log("❌ Error de conexión:", error.message);
  }
}

probar();