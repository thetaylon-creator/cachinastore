require('dotenv').config();
const pool = require('./db');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// CAMBIO: sin valor por defecto y sin espacios sobrantes. Si falta la variable, el panel queda bloqueado.
const ADMIN_KEY = (process.env.ADMIN_KEY || '').trim();
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '51999999999';
const RESET_HOUR = 19; // 7:00 PM
const DAILY_SHOP_SIZE = 8;

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const STATE_FILE = path.join(__dirname, 'data', 'shop-state.json');

app.set('trust proxy', 1); // para detectar la IP real detrás de Render
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de login/registro con ID + PIN
const authRoutes = require('./auth');
app.use('/api', authRoutes);

// ---------- Helpers de "base de datos" en archivo JSON ----------
function readProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
}
function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}
function readState() {
  if (!fs.existsSync(STATE_FILE)) return { cycleKey: null, todaysIds: [] };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}
function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------- Lógica de ciclo diario (cambia a las 7:00 PM) ----------
function getShopCycleKey(date = new Date()) {
  const d = new Date(date);
  if (d.getHours() < RESET_HOUR) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function seededShuffle(array, seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  return [...array].map(v => ({ v, k: rand() })).sort((a, b) => a.k - b.k).map(x => x.v);
}

// Genera (o recupera, si ya se generó hoy) la selección del día
function getOrCreateTodaysSelection() {
  const cycleKey = getShopCycleKey();
  const state = readState();

  if (state.cycleKey === cycleKey && state.todaysIds.length > 0) {
    return state.todaysIds;
  }

  const products = readProducts();
  const shuffled = seededShuffle(products, cycleKey);
  const todaysIds = shuffled.slice(0, Math.min(DAILY_SHOP_SIZE, shuffled.length)).map(p => p.id);

  writeState({ cycleKey, todaysIds });
  return todaysIds;
}

function nextResetTimestamp() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(RESET_HOUR, 0, 0, 0);
  if (now >= next) next.setDate(next.getDate() + 1);
  return next.getTime();
}

// ---------- Middleware de autenticación para el panel admin ----------
// CAMBIO: recorta espacios y deja un log (solo longitudes, nunca la clave) cuando falla.
function requireAdmin(req, res, next) {
  const key = String(req.headers['x-admin-key'] || '').trim();
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    console.log('[admin] 401 en', req.method, req.path,
      '| recibida:', key.length, 'caracteres | esperada:', ADMIN_KEY.length, 'caracteres');
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ============ RUTAS PÚBLICAS ============

// Devuelve el stock del día de hoy + info de config
app.get('/api/products', (req, res) => {
  const products = readProducts();
  const todaysIds = getOrCreateTodaysSelection();
  const todaysProducts = todaysIds
    .map(id => products.find(p => p.id === id))
    .filter(Boolean);

  res.json({
    products: todaysProducts,
    whatsapp: WHATSAPP_NUMBER,
    nextReset: nextResetTimestamp(),
  });
});

// ============ RUTAS DE ADMINISTRACIÓN (requieren clave) ============

// Ver TODO el pool (no solo el stock de hoy)
app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(readProducts());
});

// Crear una skin nueva en el pool
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const products = readProducts();
  const { name, set, rarity, priceOld, priceNew, image } = req.body;

  if (!name || !rarity || priceNew == null) {
    return res.status(400).json({ error: 'Faltan campos: name, rarity, priceNew son obligatorios' });
  }

  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  const newProduct = {
    id: newId,
    name,
    set: set || '',
    rarity,
    priceOld: priceOld || null,
    priceNew,
    image: image || null,
  };

  products.push(newProduct);
  writeProducts(products);
  res.status(201).json(newProduct);
});

// Editar una skin existente
app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readProducts();
  const id = parseInt(req.params.id, 10);
  const index = products.findIndex(p => p.id === id);

  if (index === -1) return res.status(404).json({ error: 'Producto no encontrado' });

  products[index] = { ...products[index], ...req.body, id };
  writeProducts(products);
  res.json(products[index]);
});

// Eliminar una skin del pool
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const products = readProducts();
  const id = parseInt(req.params.id, 10);
  const filtered = products.filter(p => p.id !== id);

  if (filtered.length === products.length) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  writeProducts(filtered);
  res.json({ success: true });
});

// Forzar una renovación manual del stock (por si no quieres esperar a las 7pm)
app.post('/api/admin/force-refresh', requireAdmin, (req, res) => {
  const products = readProducts();
  const cycleKey = getShopCycleKey() + '-forced-' + Date.now();
  const shuffled = seededShuffle(products, cycleKey);
  const todaysIds = shuffled.slice(0, Math.min(DAILY_SHOP_SIZE, shuffled.length)).map(p => p.id);
  writeState({ cycleKey: getShopCycleKey(), todaysIds });
  res.json({ success: true, todaysIds });
});

// ---------- Cron: recalcula el stock del día automáticamente a las 7:00 PM ----------
cron.schedule(`0 ${RESET_HOUR} * * *`, () => {
  console.log('[cron] Renovando stock diario...');
  getOrCreateTodaysSelection();
});
const FORTNITE_API_KEY = process.env.FORTNITE_API_KEY || '';
const VENTANA_BOTS_MS = 48 * 60 * 60 * 1000; // 48 horas

// Crea la tabla en Postgres si no existe (igual que hace auth.js con "users")
async function ensureBotsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bots_requests (
      id SERIAL PRIMARY KEY,
      id_cliente VARCHAR(100) NOT NULL,
      username VARCHAR(100) NOT NULL,
      plataforma VARCHAR(20) NOT NULL,
      fecha TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
ensureBotsTable().catch(err => console.error('Error creando tabla bots_requests:', err));

async function readBotsRequests() {
  const { rows } = await pool.query(
    `SELECT id, id_cliente AS "idCliente", username, plataforma, fecha
     FROM bots_requests ORDER BY fecha ASC`
  );
  return rows;
}

async function agregarBotsRequest({ idCliente, username, plataforma }) {
  await pool.query(
    `INSERT INTO bots_requests (id_cliente, username, plataforma) VALUES ($1, $2, $3)`,
    [idCliente, username, plataforma]
  );
}

async function eliminarBotsRequest(id) {
  const { rows } = await pool.query(
    `DELETE FROM bots_requests WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

async function verificarUsuarioFortnite(username, plataforma) {
  if (!FORTNITE_API_KEY) {
    console.warn('[bots] FORTNITE_API_KEY no configurada: se omite verificación');
    return true;
  }

  const mapaPlataforma = { epic: 'epic', psn: 'psn', xbox: 'xbl' };
  const accountType = mapaPlataforma[plataforma] || 'epic';

  try {
    // Si pegan el ID largo de Epic (32 caracteres), se busca por ID
    const esAccountId = plataforma === 'epic' && /^[0-9a-f]{32}$/i.test(username);
    const url = esAccountId
      ? `https://fortnite-api.com/v2/stats/br/v2/${username}`
      : `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(username)}&accountType=${accountType}`;

    const respuesta = await fetch(url, { headers: { Authorization: FORTNITE_API_KEY } });
    console.log(`[verificar] ${plataforma}:${username} -> ${respuesta.status}`);

    // Solo un 404 prueba que la cuenta no existe.
    // 200 = existe, 403 = existe pero con estadísticas privadas,
    // 429 / 5xx = la API falló y no se puede saber, así que se deja pasar.
    return respuesta.status !== 404;
  } catch (error) {
    console.error('[bots] Error verificando usuario en Fortnite API:', error);
    return true;
  }
}

// ---- Calcula cuántas cuentas registró un cliente y cuánto falta de las 48h ----
async function calcularEstadoBots(idCliente) {
  const ahora = Date.now();
  const todas = await readBotsRequests();
  const recientes = todas
    .filter(s => s.idCliente === idCliente && (ahora - new Date(s.fecha).getTime()) < VENTANA_BOTS_MS)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  if (recientes.length === 0) {
    return { activo: false, cuentas: 0, restanteMs: 0 };
  }

  const primera = new Date(recientes[0].fecha).getTime();
  const restanteMs = Math.max((primera + VENTANA_BOTS_MS) - ahora, 0);

  return { activo: restanteMs > 0, cuentas: recientes.length, restanteMs };
}
// ---- RUTA PÚBLICA: solo verifica si un usuario existe (no guarda nada) ----
const _verifHits = new Map();
app.get('/api/verificar-usuario', async (req, res) => {
  // Límite simple: 10 consultas por minuto por IP, para que nadie abuse de la API
  const ahora = Date.now();
  const hits = (_verifHits.get(req.ip) || []).filter(t => ahora - t < 60000);
  if (hits.length >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera un minuto e intenta de nuevo.' });
  hits.push(ahora);
  _verifHits.set(req.ip, hits);

  const username = String(req.query.username || '').trim();
  const plataforma = String(req.query.plataforma || 'epic');
  if (!username || username.length > 40 || !['epic', 'psn', 'xbox'].includes(plataforma)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  try {
    const existe = await verificarUsuarioFortnite(username, plataforma);
    if (!existe) {
      const nombres = { epic: 'EPIC', psn: 'PSN', xbox: 'XBOX' };
      return res.status(404).json({
        existe: false,
        error: `Usuario '${username}' no encontrado en ${nombres[plataforma]}. Verifica que escribiste bien tu username y seleccionaste la plataforma correcta.`
      });
    }
    res.json({ existe: true });
  } catch (err) {
    console.error('[verificar-usuario]', err);
    res.status(502).json({ error: 'No se pudo verificar ahora. Intenta de nuevo en unos segundos.' });
  }
});
// ---- RUTA PÚBLICA: el cliente registra su solicitud (con verificación) ----
app.post('/api/bots-request', async (req, res) => {
  const { idCliente, username, plataforma } = req.body;
  if (!idCliente || !username || !plataforma) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  if (plataforma !== 'iduser') {
    const existe = await verificarUsuarioFortnite(username, plataforma);
    if (!existe) {
      const nombresPlataforma = { epic: 'EPIC', psn: 'PSN', xbox: 'XBOX' };
      const nombrePlataforma = nombresPlataforma[plataforma] || plataforma.toUpperCase();
      return res.status(404).json({
        error: `Usuario '${username}' no encontrado en ${nombrePlataforma}. Verifica que escribiste bien tu username y seleccionaste la plataforma correcta.`
      });
    }
  }

  try {
    await agregarBotsRequest({ idCliente, username, plataforma });
    const estado = await calcularEstadoBots(idCliente);
    res.status(201).json({ success: true, ...estado });
  } catch (err) {
    console.error('[bots] Error guardando solicitud:', err);
    res.status(500).json({ error: 'No se pudo guardar la solicitud' });
  }
});

// ---- RUTA PÚBLICA: consulta el estado actual (para cuando abres el modal) ----
app.get('/api/bots-status', async (req, res) => {
  const { idCliente } = req.query;
  if (!idCliente) return res.status(400).json({ error: 'Falta idCliente' });
  res.json(await calcularEstadoBots(idCliente));
});

// ---- RUTA ADMIN: ver todas las solicitudes (protegida con tu ADMIN_KEY) ----
app.get('/api/admin/bots-requests', requireAdmin, async (req, res) => {
  res.json(await readBotsRequests());
});

// ---- RUTA ADMIN: eliminar una solicitud manualmente ----
app.delete('/api/admin/bots-requests/:id', requireAdmin, async (req, res) => {
  const ok = await eliminarBotsRequest(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Solicitud no encontrada' });
  res.json({ success: true });
});

// ============ CACHÉ DE LA TIENDA DE FORTNITE (en Postgres) ============
let tiendaCache = null;

async function ensureShopTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_cache (
      id INT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const { rows } = await pool.query('SELECT data FROM shop_cache WHERE id = 1');
  if (rows.length) {
    tiendaCache = rows[0].data;
    console.log('[tienda] Caché recuperado desde la base de datos');
  }
}

async function actualizarTienda() {
  try {
    const r = await fetch('https://fortnite-api.com/v2/shop?language=es-419');
    if (!r.ok) throw new Error('API ' + r.status);
    const json = await r.json();

    // Solo reemplaza el caché si la respuesta trae productos de verdad
    if (!json?.data?.entries?.length) throw new Error('Respuesta sin productos');

    tiendaCache = json;
    await pool.query(
      `INSERT INTO shop_cache (id, data, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
      [JSON.stringify(json)]
    );
    console.log('[tienda] Actualizada');
  } catch (e) {
    console.error('[tienda] No se pudo actualizar (se mantiene la última buena):', e.message);
  }
}

ensureShopTable()
  .catch(e => console.error('[tienda] Error con la tabla shop_cache:', e.message))
  .finally(() => {
    actualizarTienda();
    setInterval(actualizarTienda, 5 * 60 * 1000);
  });

app.get('/api/shop', (req, res) => {
  if (!tiendaCache) return res.status(503).json({ error: 'Tienda no disponible aún' });
  res.json(tiendaCache);
});

// ============ LOGIN CON GOOGLE + RESEÑAS (Postgres) ============
// Requisitos:
//   1) npm install google-auth-library
//   2) Variables de entorno en Render:
//        GOOGLE_CLIENT_ID = (el ID de cliente de Google Cloud)
//        SESSION_SECRET   = (texto largo y aleatorio, solo tuyo; NO lo cambies o se cierran todas las sesiones)

const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const SESION_DIAS = 90; // CAMBIO: antes 30

if (!GOOGLE_CLIENT_ID || !SESSION_SECRET) {
  console.warn('[google] Faltan GOOGLE_CLIENT_ID o SESSION_SECRET: el login con Google no funcionará.');
}

// ---------- Sesión propia firmada (sin librerías extra) ----------
function firmar(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verificarSesion(token) {
  if (!token || !SESSION_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp * 1000 < Date.now()) return null;
    return p;
  } catch (e) {
    return null;
  }
}

// ---------- NUEVO: sesión también en cookie (Safari no la borra como el localStorage) ----------
function leerCookie(req, nombre) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(s => s.trim()).find(s => s.startsWith(nombre + '='));
  return m ? decodeURIComponent(m.slice(nombre.length + 1)) : '';
}

function sesionDeRequest(req) {
  const h = req.headers.authorization || '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7) : '';
  return verificarSesion(bearer) || verificarSesion(leerCookie(req, 'cachina_token'));
}

function guardarCookieSesion(res, token) {
  res.cookie('cachina_token', token, {
    httpOnly: true,
    secure: !!process.env.RENDER,
    sameSite: 'lax',
    maxAge: SESION_DIAS * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function requireGoogle(req, res, next) {
  const sesion = sesionDeRequest(req);
  if (!sesion) {
    console.log('[auth] 401 en', req.method, req.path,
      '| header:', (req.headers.authorization ? 'presente' : 'ausente'),
      '| cookie:', (leerCookie(req, 'cachina_token') ? 'presente' : 'ausente'),
      '| SESSION_SECRET:', SESSION_SECRET ? 'configurado' : 'VACÍO');
    return res.status(401).json({ error: 'Inicia sesión con Google para continuar.' });
  }
  req.usuario = sesion;
  next();
}

// ---------- Tablas ----------
async function ensureGoogleYResenasTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_users (
      sub VARCHAR(64) PRIMARY KEY,
      email VARCHAR(200) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      creado TIMESTAMPTZ NOT NULL DEFAULT now(),
      ultimo_acceso TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resenas (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(30) NOT NULL,
      nota SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
      texto VARCHAR(300) NOT NULL,
      foto TEXT NOT NULL,
      likes INT NOT NULL DEFAULT 0,
      fecha TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE resenas ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64);`);
  await pool.query(`ALTER TABLE resenas ADD COLUMN IF NOT EXISTS fotos JSONB;`);
}
ensureGoogleYResenasTables().catch(err => console.error('Error creando tablas google/resenas:', err));

// ---------- Rutas de Google ----------
app.get('/api/google-config', (req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    if (!googleClient || !SESSION_SECRET) {
      return res.status(503).json({ error: 'El inicio con Google no está configurado.' });
    }
    const credential = String(req.body.credential || '');
    if (!credential) return res.status(400).json({ error: 'Falta la credencial.' });

    // Google firma este token; aquí se verifica que sea real y para tu sitio
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p || !p.sub || !p.email_verified) {
      return res.status(401).json({ error: 'Tu cuenta de Google no está verificada.' });
    }

    const nombre = String(p.name || p.given_name || 'Cliente').trim().slice(0, 30) || 'Cliente';

    await pool.query(
      `INSERT INTO google_users (sub, email, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (sub) DO UPDATE SET email = $2, nombre = $3, ultimo_acceso = now()`,
      [p.sub, p.email, nombre]
    );

    const exp = Math.floor(Date.now() / 1000) + SESION_DIAS * 24 * 60 * 60;
    const token = firmar({ sub: p.sub, nombre, exp });
    guardarCookieSesion(res, token);
    res.json({ token, nombre, email: p.email, exp });
  } catch (err) {
    console.error('[google] Error verificando token:', err.message);
    res.status(401).json({ error: 'No se pudo verificar tu cuenta de Google.' });
  }
});

// NUEVO: restaura y renueva la sesión (90 días desde la última visita)
app.get('/api/auth/me', async (req, res) => {
  const s = sesionDeRequest(req);
  if (!s) return res.status(401).json({ error: 'Sin sesión' });
  try {
    const u = await pool.query('SELECT email FROM google_users WHERE sub = $1', [s.sub]);
    const exp = Math.floor(Date.now() / 1000) + SESION_DIAS * 24 * 60 * 60;
    const token = firmar({ sub: s.sub, nombre: s.nombre, exp });
    guardarCookieSesion(res, token);
    res.json({ token, nombre: s.nombre, email: u.rows[0]?.email || '', exp });
  } catch (e) {
    console.error('[auth/me]', e.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// NUEVO: cerrar sesión borra también la cookie
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('cachina_token', { path: '/' });
  res.json({ success: true });
});

// ---------- Reseñas ----------
const ultimaResenaPorUsuario = new Map();

const MAX_FOTOS = 4;
// Lista pública paginada: ?limit=6&offset=0
app.get('/api/resenas', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 12);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { rows } = await pool.query(
      `SELECT id, nombre, nota, texto, foto,
              COALESCE(fotos, jsonb_build_array(foto)) AS fotos, likes, fecha
       FROM resenas ORDER BY fecha DESC LIMIT $1 OFFSET $2`,
      [limit + 1, offset]
    );
    res.json({ resenas: rows.slice(0, limit), hayMas: rows.length > limit });
  } catch (err) {
    console.error('[resenas] Error listando:', err);
    res.status(500).json({ error: 'No se pudieron cargar las reseñas' });
  }
});
app.post('/api/resenas', requireGoogle, async (req, res) => {
  try {
    const texto = String(req.body.texto || '').trim().slice(0, 300);
    const nota = parseInt(req.body.nota, 10);
    let fotos = Array.isArray(req.body.fotos) ? req.body.fotos
              : (req.body.foto ? [req.body.foto] : []);
    fotos = fotos.map(String).slice(0, MAX_FOTOS);

    if (!texto) return res.status(400).json({ error: 'Escribe tu reseña.' });
    if (!(nota >= 1 && nota <= 5)) return res.status(400).json({ error: 'Calificación inválida.' });
    if (!fotos.length || !fotos.every(f => f.startsWith('data:image/jpeg;base64,'))) {
      return res.status(400).json({ error: 'Debes subir al menos una foto.' });
    }
    if (fotos.some(f => f.length > 700000) || fotos.join('').length > 2500000) {
      return res.status(413).json({ error: 'Las fotos son demasiado pesadas.' });
    }

    const compro = await pool.query(
      `SELECT 1 FROM pedidos WHERE google_sub = $1 AND estado IN ('aprobado','entregado') LIMIT 1`,
      [req.usuario.sub]
    );
    if (!compro.rows.length) {
      return res.status(403).json({ error: 'Podrás dejar tu reseña cuando tu compra sea aprobada.' });
    }
    const ya = await pool.query('SELECT 1 FROM resenas WHERE google_sub = $1 LIMIT 1', [req.usuario.sub]);
    if (ya.rows.length) return res.status(409).json({ error: 'Ya dejaste tu reseña.' });

    const ultima = ultimaResenaPorUsuario.get(req.usuario.sub) || 0;
    if (Date.now() - ultima < 60000) {
      return res.status(429).json({ error: 'Espera un minuto antes de enviar otra reseña.' });
    }
    ultimaResenaPorUsuario.set(req.usuario.sub, Date.now());

    const { rows } = await pool.query(
      `INSERT INTO resenas (nombre, nota, texto, foto, fotos, google_sub)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nombre, nota, texto, foto, fotos, likes, fecha`,
      [req.usuario.nombre, nota, texto, fotos[0], JSON.stringify(fotos), req.usuario.sub]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[resenas] Error guardando:', err);
    res.status(500).json({ error: 'No se pudo guardar la reseña' });
  }
});

// Like / quitar like
app.post('/api/resenas/:id/like', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const delta = req.body.accion === 'unlike' ? -1 : 1;
    const { rows } = await pool.query(
      `UPDATE resenas SET likes = GREATEST(likes + $1, 0) WHERE id = $2 RETURNING likes`,
      [delta, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Reseña no encontrada' });
    res.json({ likes: rows[0].likes });
  } catch (err) {
    console.error('[resenas] Error en like:', err);
    res.status(500).json({ error: 'No se pudo actualizar' });
  }
});
// Compras públicas de quien dejó una reseña (solo producto, precio y fecha)
app.get('/api/resenas/:id/compras', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    const r = await pool.query('SELECT google_sub FROM resenas WHERE id = $1', [id]);
    if (!r.rows.length || !r.rows[0].google_sub) return res.json({ compras: [] });

    // Solo pedidos ya aprobados o entregados
    const { rows } = await pool.query(
      `SELECT items, fecha FROM pedidos
       WHERE google_sub = $1 AND estado IN ('aprobado','entregado')
       ORDER BY fecha DESC LIMIT 20`,
      [r.rows[0].google_sub]
    );

    const compras = [];
    rows.forEach(p => {
      (p.items || []).forEach(i => {
        compras.push({
          nombre: i.nombre,
          precio: Number(i.precio).toFixed(2),
          imagen: i.imagen || '',
          fecha: p.fecha
        });
      });
    });

    res.json({ compras: compras.slice(0, 30) });
  } catch (err) {
    console.error('[resenas] Error en compras:', err);
    res.status(500).json({ error: 'No se pudieron cargar las compras' });
  }
});
app.get('/api/admin/resenas', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, nota, texto, COALESCE(fotos, jsonb_build_array(foto)) AS fotos, likes, fecha
     FROM resenas ORDER BY fecha DESC LIMIT 200`
  );
  res.json(rows);
});
// ADMIN: borrar una reseña (con tu ADMIN_KEY)
app.delete('/api/admin/resenas/:id', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM resenas WHERE id = $1 RETURNING id', [parseInt(req.params.id, 10)]);
  if (!rows.length) return res.status(404).json({ error: 'Reseña no encontrada' });
  res.json({ success: true });
});

// ============ PEDIDOS (tickets) ============
async function ensurePedidosTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      google_sub VARCHAR(64) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(200) NOT NULL DEFAULT '',
      id_fortnite VARCHAR(100) NOT NULL,
      items JSONB NOT NULL,
      total NUMERIC(10,2) NOT NULL,
      metodo VARCHAR(30) NOT NULL DEFAULT 'yape',
      comprobante TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'verificando',
      fecha TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo VARCHAR(200);`);
}
ensurePedidosTable().catch(err => console.error('Error creando tabla pedidos:', err));

const ticketDe = (id) => '#' + String(id).padStart(4, '0');
const ultimoPedidoPorUsuario = new Map();

// Crear pedido (solo con sesión de Google)
app.post('/api/pedidos', requireGoogle, async (req, res) => {
  try {
    const idFortnite = String(req.body.idFortnite || '').trim().slice(0, 100);
    const comprobante = req.body.comprobante ? String(req.body.comprobante) : null;
    const itemsIn = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];

    if (!idFortnite) return res.status(400).json({ error: 'Falta tu ID de Fortnite.' });
    if (!itemsIn.length) return res.status(400).json({ error: 'El carrito está vacío.' });
    if (comprobante) {
      if (!comprobante.startsWith('data:image/jpeg;base64,')) {
        return res.status(400).json({ error: 'El comprobante debe ser una imagen.' });
      }
      if (comprobante.length > 1500000) {
        return res.status(413).json({ error: 'El comprobante es demasiado pesado.' });
      }
    }

    const items = itemsIn.map(i => ({
      nombre: String(i.nombre || '').slice(0, 120),
      precio: Number(i.precio) || 0,
      cantidad: Math.max(1, Math.min(parseInt(i.cantidad, 10) || 1, 99)),
      imagen: String(i.imagen || '').slice(0, 500)
    }));
    const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    if (!(total > 0)) return res.status(400).json({ error: 'Total inválido.' });

    // Freno simple: un pedido cada 15 segundos por usuario
    const ultimo = ultimoPedidoPorUsuario.get(req.usuario.sub) || 0;
    if (Date.now() - ultimo < 15000) {
      return res.status(429).json({ error: 'Espera unos segundos antes de enviar otro pedido.' });
    }
    ultimoPedidoPorUsuario.set(req.usuario.sub, Date.now());

    const u = await pool.query('SELECT email FROM google_users WHERE sub = $1', [req.usuario.sub]);
    const email = u.rows[0]?.email || '';

    const { rows } = await pool.query(
      `INSERT INTO pedidos (google_sub, nombre, email, id_fortnite, items, total, comprobante)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, fecha`,
      [req.usuario.sub, req.usuario.nombre, email, idFortnite, JSON.stringify(items), total.toFixed(2), comprobante]
    );
    res.status(201).json({ success: true, id: rows[0].id, ticket: ticketDe(rows[0].id), fecha: rows[0].fecha });
  } catch (err) {
    console.error('[pedidos] Error creando:', err);
    res.status(500).json({ error: 'No se pudo crear el pedido. Intenta de nuevo.' });
  }
});

// Pedidos del cliente que inició sesión (para Mi cuenta > Pedidos)
app.get('/api/mis-pedidos', requireGoogle, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, id_fortnite AS "idFortnite", items, total, metodo, estado, motivo, fecha
       FROM pedidos WHERE google_sub = $1 ORDER BY fecha DESC LIMIT 50`,
      [req.usuario.sub]
    );
    res.json({ pedidos: rows.map(p => ({ ...p, ticket: ticketDe(p.id), total: Number(p.total) })) });
  } catch (err) {
    console.error('[pedidos] Error listando:', err);
    res.status(500).json({ error: 'No se pudieron cargar tus pedidos.' });
  }
});

// ADMIN: ver pedidos y cambiar su estado (verificando / aprobado / entregado / rechazado)
app.get('/api/admin/pedidos', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nombre, email, id_fortnite AS "idFortnite", items, total, estado, motivo, fecha,
            (comprobante IS NOT NULL) AS "tieneComprobante"
     FROM pedidos ORDER BY fecha DESC LIMIT 200`
  );
  res.json(rows.map(p => ({ ...p, ticket: ticketDe(p.id), total: Number(p.total) })));
});

app.get('/api/admin/pedidos/:id/comprobante', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT comprobante FROM pedidos WHERE id = $1', [parseInt(req.params.id, 10)]);
  if (!rows.length || !rows[0].comprobante) return res.status(404).json({ error: 'Sin comprobante' });
  res.json({ comprobante: rows[0].comprobante });
});

app.put('/api/admin/pedidos/:id', requireAdmin, async (req, res) => {
  const estado = String(req.body.estado || '');
  if (!['verificando', 'aprobado', 'entregado', 'no_confirmado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const motivo = estado === 'no_confirmado'
    ? (String(req.body.motivo || '').trim().slice(0, 200) || 'No llegó el pago')
    : null;
  const { rows } = await pool.query(
    'UPDATE pedidos SET estado = $1, motivo = $2 WHERE id = $3 RETURNING id',
    [estado, motivo, parseInt(req.params.id, 10)]
  );
  if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json({ success: true });
});

// ADMIN: borrar un pedido (también se elimina su comprobante)
app.delete('/api/admin/pedidos/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });
    const { rows } = await pool.query('DELETE FROM pedidos WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ success: true });
  } catch (err) {
    console.error('[pedidos] Error borrando:', err);
    res.status(500).json({ error: 'No se pudo borrar el pedido.' });
  }
});

// Mi reseña: ¿puede reseñar? ¿ya tiene una?
app.get('/api/mi-resena', requireGoogle, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nombre, nota, texto, foto,
        COALESCE(fotos, jsonb_build_array(foto)) AS fotos, likes, fecha
 FROM resenas WHERE google_sub = $1 ORDER BY fecha DESC LIMIT 1`,
      [req.usuario.sub]
    );
    const p = await pool.query(
      `SELECT 1 FROM pedidos WHERE google_sub = $1 AND estado IN ('aprobado','entregado') LIMIT 1`,
      [req.usuario.sub]
    );
    res.json({ resena: r.rows[0] || null, puede: p.rows.length > 0 });
  } catch (err) {
    console.error('[resenas] Error en mi-resena:', err);
    res.status(500).json({ error: 'No se pudo cargar tu reseña.' });
  }
});

app.delete('/api/mi-resena', requireGoogle, async (req, res) => {
  try {
    await pool.query('DELETE FROM resenas WHERE google_sub = $1', [req.usuario.sub]);
    res.json({ success: true });
  } catch (err) {
    console.error('[resenas] Error borrando la propia:', err);
    res.status(500).json({ error: 'No se pudo eliminar tu reseña.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin.html`);
  console.log('[config] ADMIN_KEY:', ADMIN_KEY ? ('configurada (' + ADMIN_KEY.length + ' caracteres)') : 'VACÍA, el panel quedará bloqueado');
});
