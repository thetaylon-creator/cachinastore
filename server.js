require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'cambia-esta-clave';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '51999999999';
const RESET_HOUR = 19; // 7:00 PM
const DAILY_SHOP_SIZE = 8;

const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const STATE_FILE = path.join(__dirname, 'data', 'shop-state.json');

app.use(cors());
app.use(express.json());
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
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
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

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin en http://localhost:${PORT}/admin.html`);
});
