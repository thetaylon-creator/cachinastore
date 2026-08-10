const { Pool } = require('pg');

// DATABASE_URL viene de la variable de entorno que configuraste en Render.
// En tu compu (local) no la tendrás, así que solo funcionará el login cuando
// esté desplegado en Render, a menos que agregues DATABASE_URL a tu .env local.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
