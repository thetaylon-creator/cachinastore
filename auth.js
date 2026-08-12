const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('./db');
const router = express.Router();

// Crea la tabla automáticamente si no existe (así no tienes que entrar a la consola SQL)
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      user_code VARCHAR(50) UNIQUE NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
ensureTable().catch(err => console.error('Error creando tabla users:', err));

// POST /api/login  { user_code, pin }
// Si el user_code no existe, crea la cuenta automáticamente.
// Si existe, valida el PIN.
router.post('/login', async (req, res) => {
  const { user_code, pin } = req.body;

  if (!user_code || !pin) {
    return res.status(400).json({ error: 'Faltan datos (user_code y pin son obligatorios)' });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'El PIN debe tener entre 4 y 6 números' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE user_code = $1',
      [user_code]
    );

    if (rows.length === 0) {
      // No existe la cuenta -> se crea automáticamente
      const pinHash = await bcrypt.hash(pin, 10);
      await pool.query(
        'INSERT INTO users (user_code, pin_hash) VALUES ($1, $2)',
        [user_code, pinHash]
      );
      return res.json({ created: true, message: 'Cuenta creada e ingresada', user_code });
    }

    // Ya existe -> validar PIN
    const match = await bcrypt.compare(pin, rows[0].pin_hash);
    if (!match) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    return res.json({ created: false, message: 'Bienvenido de nuevo', user_code });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/admin/usuarios?key=TU_CLAVE
// Muestra la lista de usuarios registrados (sin mostrar el PIN)
router.get('/admin/usuarios', async (req, res) => {
  const claveIngresada = req.query.key;
  const claveCorrecta = process.env.ADMIN_KEY || 'cambia-esta-clave';

  if (claveIngresada !== claveCorrecta) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, user_code, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ total: rows.length, usuarios: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
