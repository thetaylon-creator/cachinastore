# CachinaStore — Tienda con backend

Tienda de skins con renovación automática de stock todos los días a las 7:00 PM,
controlada desde el servidor (no desde el navegador de cada visitante).

## Estructura del proyecto

```
loot-vault-backend/
├── server.js           <- El backend (Express)
├── package.json
├── .env.example         <- Copiar como .env y editar
├── data/
│   ├── products.json    <- Tu catálogo completo ("base de datos")
│   └── shop-state.json  <- Se crea solo, guarda qué se muestra hoy
└── public/
    ├── index.html        <- Tienda que ven tus clientes
    └── admin.html        <- Panel para editar precios y stock
```

## 1. Correr en tu computadora (local)

1. Abre esta carpeta en VS Code.
2. Abre la terminal (Ctrl + ñ) y corre:
   ```
   npm install
   ```
3. Copia `.env.example` y renómbralo a `.env`. Ábrelo y cambia:
   - `ADMIN_KEY` por una clave tuya (esto protege tu panel de administración).
   - `WHATSAPP_NUMBER` por tu número real.
4. Corre el servidor:
   ```
   npm start
   ```
5. Abre en el navegador:
   - Tienda: http://localhost:3000
   - Admin: http://localhost:3000/admin.html (te pedirá la clave que pusiste en `.env`)

## 2. Cómo editar tu catálogo

Todo pasa por el panel admin (`/admin.html`): agregar skins, ver el pool completo,
eliminar, o forzar una renovación manual sin esperar a las 7pm.

También puedes editar directamente `data/products.json` si prefieres hacerlo a mano.

## 3. Publicarla para que la vea todo el mundo (Render)

1. Sube esta carpeta a un repositorio de GitHub (crea el repo en github.com,
   luego en la terminal: `git init`, `git add .`, `git commit -m "primera version"`,
   `git remote add origin TU-URL-DE-GITHUB`, `git push -u origin main`).
2. Entra a render.com, crea cuenta con GitHub.
3. "New" → "Web Service" → selecciona tu repositorio.
4. Configura:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. En "Environment Variables" agrega `ADMIN_KEY` y `WHATSAPP_NUMBER` (los mismos
   valores que pusiste en tu `.env` local — ese archivo NO se sube a GitHub por seguridad).
6. Dale a "Create Web Service". En unos minutos tendrás una URL pública tipo
   `https://loot-vault.onrender.com` que cualquiera puede visitar.

**Nota:** el plan gratis de Render "duerme" el servidor tras un rato sin visitas
y tarda unos segundos en despertar con la primera visita del día. Es normal y no
afecta la renovación de las 7pm (el cron corre igual).

## 4. (Opcional) Dominio propio

Compra un dominio en Namecheap o similar, y en la configuración de tu servicio
en Render ve a "Settings" → "Custom Domain" y sigue las instrucciones para
apuntar tu dominio ahí.
