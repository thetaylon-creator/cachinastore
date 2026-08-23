let totalItems = 0;
const TASA_CONVERSION = 1.40; // 100 Pavos = 1.40 PEN
let productosGlobales = [];
let carritoItems = [];

// ==========================================
// 0. ALTURA REAL DEL HEADER (cabecera-fija)
// Mide el alto real del bloque header + subbar-moneda y lo guarda
// en la variable CSS --cab-h. Así el panel de FILTROS (sidebar)
// siempre queda pegado justo debajo del header, sin overlap y sin
// huecos, tanto en escritorio como en móvil, y aunque el header
// cambie de tamaño (por ejemplo al pasar a una fila extra en
// pantallas angostas).
// ==========================================
function actualizarAlturaCabecera() {
  const cabecera = document.querySelector('.cabecera-fija');
  if (!cabecera) return;
  const alto = Math.ceil(cabecera.getBoundingClientRect().height);
  if (alto > 0) {
    document.documentElement.style.setProperty('--cab-h', `${alto}px`);
  }
}

window.addEventListener('resize', actualizarAlturaCabecera);
window.addEventListener('load', actualizarAlturaCabecera);
document.addEventListener('DOMContentLoaded', actualizarAlturaCabecera);

// ==========================================
// 1. MANEJO DE AUTENTICACIÓN (LOGIN)
// FIX: antes había 2 listeners distintos en 'form-login'
// (uno guardaba el ID, el otro cambiaba de pantalla).
// Ahora es solo UNO que hace las dos cosas.
// ==========================================
const API_URL = ''; // vacío porque frontend y backend viven en el mismo dominio de Render

document.getElementById('form-login')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const idIngresado = document.getElementById('login-id').value.trim();
  const pinIngresado = document.getElementById('login-pin').value.trim();
  const errorTexto = document.getElementById('login-error');
  const btnSubmit = e.target.querySelector('button[type="submit"]');

  if (!idIngresado || !pinIngresado) return;

  errorTexto?.classList.add('oculto');
  if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.textContent = 'Verificando...'; }

  try {
    const respuesta = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_code: idIngresado, pin: pinIngresado })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      if (errorTexto) {
        errorTexto.textContent = datos.error || 'Error al iniciar sesión';
        errorTexto.classList.remove('oculto');
      }
      return;
    }

    localStorage.setItem('usuarioLogueado', datos.user_code);
    mostrarIdClienteHeader(datos.user_code);
    mostrarPantalla('pantalla-tienda');
    obtenerTiendaFortnite();
    // El header puede cambiar de alto al mostrar la pantalla de
    // tienda (antes estaba oculta con display:none), así que se
    // vuelve a medir después de mostrarla.
    requestAnimationFrame(actualizarAlturaCabecera);

  } catch (error) {
    console.error('Error de conexión:', error);
    if (errorTexto) {
      errorTexto.textContent = 'No se pudo conectar al servidor. Intenta de nuevo.';
      errorTexto.classList.remove('oculto');
    }
  } finally {
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = 'Entrar →'; }
  }
});

// ==========================================
// 2. CONSTRUIR MENSAJE DE PEDIDO (función compartida)
// FIX: antes había 3 formas distintas de armar y enviar el
// mensaje a WhatsApp (una por cada botón). Ahora es 1 sola
// función que arma el texto usando el carrito real (carritoItems),
// que es más confiable que leer el texto de la pantalla.
// ==========================================
function construirMensajePedido() {
  const idCliente = localStorage.getItem('usuarioLogueado') || 'No especificado';

  let listaProductos = "";
  let total = 0;

  if (carritoItems.length === 0) {
    listaProductos = "• (carrito vacío)\n";
  } else {
    carritoItems.forEach(item => {
      const subtotal = item.precio * item.cantidad;
      total += subtotal;
      listaProductos += `• *${item.nombre}* x${item.cantidad} — ${subtotal.toFixed(2)} PEN\n`;
    });
  }

  return `*ORDEN CREADA — CachinaStore*\n\n` +
         `*ID / Nick:* ${idCliente}\n` +
         `${listaProductos}` +
         `*Total:* ${total.toFixed(2)} PEN\n` +
         `*Moneda:* PEN`;
}

function enviarPedidoWhatsApp() {
  const numeroTelefono = '51969639154';
  const mensaje = construirMensajePedido();
  const url = `https://wa.me/${numeroTelefono}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

// ==========================================
// ==========================================
// ID DEL CLIENTE EN EL HEADER Y EN EL CARRITO
// Muestra "ID: usuario" al lado de "Fortnite" en el encabezado,
// y también dentro del carrito (reemplaza el texto "👤 Usuario").
// ==========================================
function mostrarIdClienteHeader(idCliente) {
  const contenedorHeader = document.getElementById('id-cliente-header');
  if (contenedorHeader && idCliente) {
    contenedorHeader.textContent = `ID: ${idCliente}`;
  }

  const contenedorCarrito = document.getElementById('nombre-usuario-carrito');
  if (contenedorCarrito && idCliente) {
    contenedorCarrito.textContent = `ID: ${idCliente}`;
  }
}

// 3. OBTENER TIENDA COMPLETA EN ESPAÑOL
// FIX: se cambia el idioma de la API de "es" (español de España) a
// "es-419" (español latinoamericano/México). Con "es" algunos
// nombres de lotes especiales (ej. "Itchy & Scratchy") no venían
// traducidos y se veían en inglés o incompletos; con "es-419" la
// API los devuelve como "Rasca y Pica", que es como se conocen en
// Los Simpson en Latinoamérica/México.
// ==========================================
async function obtenerTiendaFortnite() {
  const contenedor = document.getElementById('contenedor-productos');
  if (!contenedor) return;

  contenedor.innerHTML = '<p style="color: #a29bfe; grid-column: 1/-1; text-align: center;">Cargando la tienda en vivo...</p>';

  try {
    const respuesta = await fetch(`https://fortnite-api.com/v2/shop?language=es-419&_=${Date.now()}`, { cache: 'no-store' });
    const datos = await respuesta.json();

    if (datos && datos.data && datos.data.entries) {
      productosGlobales = datos.data.entries;

      

      renderizarProductos(productosGlobales);
      generarMenuFiltros(window._ordenSeccionesActual || []);
      inicializarBuscador();
      requestAnimationFrame(actualizarAlturaCabecera);
    }  } catch (error) {
    console.error("Error al conectar con la API:", error);
    contenedor.innerHTML = '<p style="color: #ff4757; grid-column: 1/-1; text-align: center;">Error al cargar los productos.</p>';
  }
}
// Refresca la tienda automáticamente cada 5 minutos,
// para que se actualice sola cuando resetea (00:00 UTC).
setInterval(() => {
  if (!document.getElementById('pantalla-tienda')?.classList.contains('oculto')) {
    obtenerTiendaFortnite();
  }
}, 5 * 60 * 1000); // cada 5 minutos
// 4. OBTENER SECCIÓN OFICIAL DE FORTNITE
// FIX: el campo correcto para el nombre real de cada fila de la
// tienda es entry.layout.name (ej: "Fiesta de la victoria", "Marvel",
// "BLEACH"). Antes se buscaba primero entry.section.name, que no
// existe en la API actual, así que casi todo caía en "Destacados".
//
// FIX 2 (IMPORTANTE): muchos productos que se venden SUELTOS
// (no en lote) —ruedas de autos, mochilas, algunos wraps, etc.—
// llegan de la API SIN el objeto "layout" (solo traen "layoutId",
// ej. "alc.0"). Antes esos productos cai­an en el fallback
// "Destacados" y más abajo, en renderizarProductos(), había un
// "if (seccionNombre === 'Destacados') return;" que los descartaba
// por completo. Por eso NO se veían los productos individuales.
// Ahora el fallback usa un nombre propio ("Más artículos") que ya
// no coincide con ese filtro, así que estos productos sí se
// renderizan, agrupados en su propia sección.
// ==========================================
function obtenerNombreSeccion(entry) {
  if (entry.layout && entry.layout.name) return entry.layout.name;
  if (entry.layout && entry.layout.category) return entry.layout.category;
  if (entry.section && entry.section.name) return entry.section.name;
  return "Más artículos";
}

// ==========================================
// IDs DE TODOS LOS ÍTEMS DENTRO DE UN LOTE
// Recorre TODOS los arrays de objetos de una oferta (no solo el
// primero) para saber exactamente qué cosméticos trae un lote,
// y así poder ocultar esos mismos ítems si se venden sueltos.
// ==========================================
function obtenerIdsDeEntry(entry) {
  const ids = [];
  (entry.brItems || []).forEach(i => ids.push(i.id));
  (entry.cars || []).forEach(i => ids.push(i.id));
  (entry.instruments || []).forEach(i => ids.push(i.id));
  (entry.tracks || []).forEach(i => ids.push(i.id));
  (entry.items || []).forEach(i => ids.push(i.id));
  return ids;
}

// ==========================================
// 4.5 SLUG DE SECCIÓN
// Convierte el nombre de una sección ("BLEACH", "Fiesta de la
// victoria") en un id de HTML válido y único ("seccion-bleach",
// "seccion-fiesta-de-la-victoria"), para poder saltar a ella con
// scrollIntoView desde el menú de filtros.
// ==========================================
function slugificarSeccion(nombreSeccion) {
  const base = nombreSeccion
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `seccion-${base || 'general'}`;
}

// ==========================================
// 5. GENERAR MENÚ DE FILTROS — BARRA LATERAL FIJA
// (Siempre visible, sin necesidad de clic. Se ajusta al ancho
// de su columna para no sobresalir sobre el catálogo.)
// AJUSTE: barra "FILTROS" más delgada (menos padding/letra chica)
// y panel desplegable con fondo más transparente, a pedido.
// ==========================================
function inyectarEstilosFiltros() {
  if (document.getElementById('estilos-filtros-dinamicos')) return;

  const style = document.createElement('style');
  style.id = 'estilos-filtros-dinamicos';
style.textContent = `
    .panel-filtros-header svg{ width:14px; height:14px; flex-shrink:0; }
    .filtros-label{ display:flex; align-items:center; gap:6px; }
.panel-filtros{
      position:relative; width:100%; max-width:100%;
      max-height:320px; min-height:0;
      overflow-y:auto; overflow-x:hidden;
      background:rgba(24,21,40,0.85);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius:0 0 10px 10px;
      box-sizing:border-box; padding:6px;
      box-shadow:0 10px 30px rgba(0,0,0,0.35);
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.3) transparent;
    }
    .panel-filtros::-webkit-scrollbar{ width:7px; }
    .panel-filtros::-webkit-scrollbar-track{ background:transparent; }
    .panel-filtros::-webkit-scrollbar-thumb{ background:rgba(255,255,255,0.3); border-radius:8px; }
    .panel-filtros::-webkit-scrollbar-thumb:hover{ background:rgba(255,255,255,0.5); }
    .panel-filtros .item-filtro{
      list-style:none; padding:6px 12px; margin:2px 0;
      color:var(--text-muted); font-family:'Orbitron','Segoe UI',sans-serif;
      font-weight:500; font-size:0.76rem;
      letter-spacing:0.2px; text-transform:none;
      border-radius:8px; cursor:pointer; transition:color .15s, background .15s, font-weight .15s;
      background:transparent;
      word-wrap:break-word; overflow-wrap:break-word;
      border-left: 3px solid transparent;
    }
    @media (min-width: 901px){
      .panel-filtros .item-filtro{
        font-size: 0.9rem;
        padding: 10px 14px;
      }
    }
    .panel-filtros .item-filtro:hover{
      color:#fff;
      background:rgba(255,255,255,0.06);
    }
    .panel-filtros .item-filtro.activo{
      color: var(--accent-purple) !important;
      background: rgba(108,92,231,0.14) !important;
      font-weight: 700;
      border-left: 3px solid var(--accent-purple);
    }
  `;
  document.head.appendChild(style);
}
// ==========================================
// 4.6 ORDEN ÚNICO Y COMPARTIDO DE SECCIONES
// Se usa tanto para pintar el menú de FILTROS como para renderizar
// el catálogo, así los dos van SIEMPRE en el mismo orden (evita que
// el scroll-spy "salte" o resalte algo que no corresponde).
// Manda "Pistas de improvisación" al final, sin importar en qué
// posición la devuelva la API.
// ==========================================

function generarMenuFiltros(secciones) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.style.width = '100%';
  sidebar.style.maxWidth = '100%';
  sidebar.style.boxSizing = 'border-box';
  sidebar.style.overflow = 'hidden';

  inyectarEstilosFiltros();

  const primeraSeccion = secciones && secciones.length ? secciones[0] : 'FILTROS';

  let htmlMenu = `
    <div class="panel-filtros-header" id="btn-toggle-filtros">
      <span class="filtros-label">FILTROS</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="4" y1="6" x2="20" y2="6"></line>
        <line x1="7" y1="12" x2="17" y2="12"></line>
        <line x1="10" y1="18" x2="14" y2="18"></line>
      </svg>
    </div>
    <ul class="panel-filtros" id="panel-filtros">
  `;

  secciones.forEach((sec, index) => {
    const claseActiva = index === 0 ? 'item-filtro activo' : 'item-filtro';
    htmlMenu += `<li class="${claseActiva}" data-seccion="${sec}">${sec}</li>`;
  });

  htmlMenu += `</ul>`;
  sidebar.innerHTML = htmlMenu;

  if (window.innerWidth <= 900) {
    document.getElementById('panel-filtros')?.classList.add('oculto');
  }

  aplicarScrollSticky();
  requestAnimationFrame(actualizarAlturaCabecera);
}

// ==========================================
// FIX: el sidebar (FILTROS) ahora se queda pegado SIEMPRE justo
// debajo del header (cabecera-fija), usando la altura real medida
// en --cab-h, tanto en escritorio como en móvil. Antes en móvil
// usaba top:0, lo que lo hacía pegarse en el mismo punto que el
// header y quedar tapado por él (mismo z-index/posición): por eso
// solo se veía el header "quedarse fijo" y el filtro no.
// ==========================================
function aplicarScrollSticky() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.style.position = 'sticky';
  sidebar.style.top = 'var(--cab-h, 118px)';
  sidebar.style.zIndex = '60';

  if (window.innerWidth <= 900) {
    sidebar.style.alignSelf = 'auto';
    sidebar.style.maxHeight = 'calc(100vh - var(--cab-h, 118px) - 16px)';
    return;
  }

  sidebar.style.alignSelf = 'start';
  sidebar.style.maxHeight = 'calc(100vh - var(--cab-h, 118px) - 20px)';
}

// 6. OBTENER LA IMAGEN REAL DEL PRODUCTO
function obtenerImagenReal(entry, item) {
  if (entry.newDisplayAsset?.renderImages?.[0]?.image) return entry.newDisplayAsset.renderImages[0].image;
  if (entry.displayAssets?.[0]?.url) return entry.displayAssets[0].url;
  if (entry.displayAssets?.[0]?.background) return entry.displayAssets[0].background;
  if (entry.bundle?.image) return entry.bundle.image;
  if (entry.cars?.[0]?.images?.large) return entry.cars[0].images.large;
  if (entry.tracks?.[0]?.albumArt) return entry.tracks[0].albumArt;
  if (item) {
    if (item.images?.featured) return item.images.featured;
    if (item.images?.icon) return item.images.icon;
    if (item.images?.large) return item.images.large;
  }
  return "https://placehold.co/200x200/181528/ffffff?text=Fortnite";
}

// ==========================================
// FONDO REAL DEL PRODUCTO (API de Fortnite)
// El color oficial de cada item viene en entry.colors (color1,
// color2, color3), como hex de 8 dígitos (los últimos 2 son
// transparencia, ej: "586167ff"). Se arma un degradado real con
// esos 3 colores, igual al que usa la tienda oficial.
// ==========================================
function obtenerFondoReal(entry) {
  const c = entry.colors;
  if (!c) return null;

  // Quita los últimos 2 dígitos (alpha) y agrega el "#" al inicio.
  const limpiar = (hex) => hex ? `#${hex.slice(0, 6)}` : null;

  const colores = [c.color1, c.color2, c.color3]
    .map(limpiar)
    .filter(Boolean);

  if (colores.length === 0) return null;
  if (colores.length === 1) return colores[0];

  return `linear-gradient(160deg, ${colores.join(', ')})`;
}

// 7. RENDERIZAR PRODUCTOS AGRUPADOS POR SECCIÓN
// FIX: antes se renderizaba una sola sección a la vez (la que
// estuviera activa en el filtro) y por eso no existía forma de
// "bajar" de una sección a otra con el scroll de la tienda. Ahora
// se pintan TODAS las secciones seguidas, cada una con su propio
// título, en el mismo orden del menú de filtros. Bajar con el
// scroll del catálogo pasa naturalmente de una sección a la
// siguiente, y el menú de filtros se sincroniza solo (ver sección
// 10.5, scroll-spy).
// ==========================================
function renderizarProductos(entries) {
  const contenedor = document.getElementById('contenedor-productos');
  if (!contenedor) return;

  contenedor.innerHTML = "";

  if (entries.length === 0) {
    contenedor.innerHTML = '<p style="color: #a29bfe; text-align: center;">No hay productos en la tienda.</p>';
    window._ordenSeccionesActual = [];
    return;
  }

  const seccionesMapa = new Map();

  // FIX: evita productos/lotes duplicados. La API a veces devuelve
  // la misma oferta dos veces (ej. oferta normal + destacada) con
  // distinto offerId y a veces distinta imagen. Aquí se recuerda
  // cada producto ya agregado y se descarta cualquier repetido.
  const clavesVistas = new Set();
  // FIX DEFINITIVO: el intento anterior comparaba IDs de ítems entre
  // bundles, pero "Lote Equipamiento de X" trae ítems con IDs DISTINTOS
  // a los del lote completo (mismo tema, distinto ID interno), así que
  // nunca coincidían. Ahora se compara por NOMBRE: se extraen los
  // "personajes" quitando el prefijo ("Lote", "Lote de", "Lote
  // Equipamiento de") y si un "Equipamiento de X" coincide con un lote
  // completo que ya cubre esos mismos personajes, se oculta.
  function extraerPersonajesDeNombre(nombreLote) {
    return nombreLote
      .replace(/^lote\s+equipamiento\s+de\s+/i, '')
      .replace(/^lote\s+de\s+/i, '')
      .replace(/^lote\s+/i, '')
      .toLowerCase()
      .trim();
  }

  function obtenerNombreTemporal(entry) {
    const item0 = (entry.brItems && entry.brItems[0]) || entry.bundle || {};
    return limpiarNombre(entry.bundle?.name || item0.title || item0.name || entry.devName || '');
  }

  const personajesConLoteCompleto = new Set();
  entries.forEach(entry => {
    const nombreTmp = obtenerNombreTemporal(entry);
    const esEquipamiento = /^lote\s+equipamiento\s+de\s+/i.test(nombreTmp);
    const esLoteTmp = !!entry.bundle || /^lote\b/i.test(nombreTmp);
    if (esLoteTmp && !esEquipamiento && nombreTmp) {
      personajesConLoteCompleto.add(extraerPersonajesDeNombre(nombreTmp));
    }
  });

  const bundlesRedundantes = new Set();
  entries.forEach(entry => {
    const nombreTmp = obtenerNombreTemporal(entry);
    if (/^lote\s+equipamiento\s+de\s+/i.test(nombreTmp)) {
      const personajes = extraerPersonajesDeNombre(nombreTmp);
      if (personajesConLoteCompleto.has(personajes)) {
        bundlesRedundantes.add(entry);
      }
    }
  });
  console.log('Lotes completos detectados:', Array.from(personajesConLoteCompleto));
console.log('Entradas marcadas como redundantes:', 
  Array.from(bundlesRedundantes).map(e => obtenerNombreTemporal(e))
);

entries.forEach(entry => {
  if (bundlesRedundantes.has(entry)) return; // <-- AQUÍ, en este forEach
    const seccionNombre = obtenerNombreSeccion(entry).trim();
    const item = (entry.brItems && entry.brItems[0]) ||
                 (entry.tracks && entry.tracks[0]) ||
                 (entry.instruments && entry.instruments[0]) ||
                 (entry.cars && entry.cars[0]) ||
                 (entry.items && entry.items[0]) ||
                 entry.bundle || {};

    // Las pistas musicales (Jam Tracks) traen el título de la
    // canción en item.title y el nombre del artista por separado
    // en item.artist (ej: title:"Dark Thoughts", artist:"Lil Tecca").
    // Se guarda aparte para poder agruparlas con su artista aunque
    // el nombre de la canción no lo mencione.
    const artistaProducto = item.artist || '';
      // FIX: detecta si el ítem es una skin de personaje ("outfit") para
    // poder ordenar: lote completo → skins → el resto (mochilas, picos,
    // wraps, emotes, etc.), igual que en la tienda de referencia.
    const tipoItem = item?.type?.value || '';
    const esSkin = tipoItem === 'outfit';

    let nombre = entry.bundle?.name || item.title || item.name || entry.devName || "Objeto de Fortnite";
    nombre = limpiarNombre(nombre);
    if (nombre.includes("TBD") || nombre.length < 2) return;
    // FIX: la clave ahora incluye la sección, no solo el nombre.
    // Antes se comparaba el nombre contra TODA la tienda, y como la
    // API repite el mismo ítem en varias secciones (ej. "Destacados"
    // y su fila de colaboración), la segunda aparición (a veces la
    // correcta) se descartaba y el ítem desaparecía del todo.
const claveUnica = `${seccionNombre.toLowerCase()}||${nombre.toLowerCase().trim()}`;
if (clavesVistas.has(claveUnica)) {
  console.log('OCULTADO (nombre duplicado):', nombre, '| sección:', seccionNombre);
  return;
}
clavesVistas.add(claveUnica);
    const fondoReal = obtenerFondoReal(entry);
    const imagen = obtenerImagenReal(entry, item);
    const pavos = entry.finalPrice || entry.regularPrice || 500;
    const precioSoles = ((pavos / 100) * TASA_CONVERSION).toFixed(2);
    const expira = seVaHoy(entry.outDate);
    // Un item es "lote" si la API trae objeto bundle, o si su
    // propio nombre empieza con "Lote" (ambos casos indican un
    // pack de varios cosméticos juntos, con imagen combinada).
    const esLote = !!entry.bundle || /^lote\b/i.test(nombre);

    // FIX: se elimina el filtro que ocultaba ítems sueltos (mochilas,
    // picos, skins) cuando su ID ya estaba dentro de un lote. La API
    // SÍ los vende por separado con su propio precio, y la tienda de
    // referencia los muestra tanto en el lote como individualmente.
    //
    // if (!esLote) {
    //   const idsDeEsteItem = obtenerIdsDeEntry(entry);
    //   if (idsDeEsteItem.length > 0 && idsDeEsteItem.some(id => idsEnLotes.has(id))) {
    //     console.log('OCULTADO (ya en un lote):', nombre, idsDeEsteItem);
    //     return;
    //   }
    // }


    if (!seccionesMapa.has(seccionNombre)) seccionesMapa.set(seccionNombre, []);
    seccionesMapa.get(seccionNombre).push({ nombre, pavos, precioSoles, imagen, expira, esLote, esSkin, artistaProducto, fondoReal });
  });
  // ==========================================
  // AGRUPAR ITEMS RELACIONADOS CON CADA ARTISTA/COLABORACIÓN
  // La API a veces separa las pistas musicales (Jam Tracks) y otros
  // objetos relacionados con un artista en categorías genéricas
  // (ej. "Pistas de improvisación"), en vez de agruparlos junto al
  // resto de esa colaboración (ej. "Lil Tecca"). Aquí se revisan
  // esas categorías "cajón" y se mueve cualquier producto cuyo
  // nombre mencione a un artista/colaboración que YA tiene su
  // propia sección, para que todo quede junto: skins, emotes,
  // envoltorios y música, tal como en la tienda de referencia.
  // ==========================================
  const cajonesGenericos = [
    'Pistas de improvisación', 'Destacados', 'Más artículos', 'Casillero candente',
    'No hay problema', 'No te preocupes'
  ];
  const nombresSecciones = Array.from(seccionesMapa.keys())
    .filter(n => !cajonesGenericos.includes(n));

cajonesGenericos.forEach(cajon => {
    const lista = seccionesMapa.get(cajon);
    if (!lista) return;
    for (let i = lista.length - 1; i >= 0; i--) {
      const producto = lista[i];
      const textoComparar = `${producto.nombre} ${producto.artistaProducto}`.toLowerCase();
      const coincide = nombresSecciones.find(sec =>
        textoComparar.includes(sec.toLowerCase())
      );
      if (coincide) {
        lista.splice(i, 1);
        seccionesMapa.get(coincide).push(producto);
      }
    }
    if (lista.length === 0) seccionesMapa.delete(cajon);
  });
  // Orden ÚNICO: mismo orden en que aparecieron las secciones al
  // recorrer los productos, pero cualquier sección cuyo nombre
  // contenga "pista" (ej. "Pistas de improvisación") se manda
  // siempre al final, y "Más artículos" (ítems individuales sin
  // fila propia en la API) se manda justo antes de las pistas.
  // Este mismo arreglo lo va a usar el menú de filtros, así los dos
  // SIEMPRE coinciden.
  const esPistas = (n) => n.toLowerCase().includes('pista');
  const esMasArticulos = (n) => n === 'Más artículos';
  const todasLasSecciones = Array.from(seccionesMapa.keys());
  const normales = todasLasSecciones.filter(n => !esPistas(n) && !esMasArticulos(n));
  const masArticulos = todasLasSecciones.filter(esMasArticulos);
  const pistas = todasLasSecciones.filter(esPistas);
    const ordenSecciones = [...normales, ...masArticulos, ...pistas];

  // Se agregan al final, igual que en la tienda de referencia.
  seccionesMapa.set('V-Bucks', obtenerProductosVBucks());
  seccionesMapa.set('Crew · DLC · Packs', obtenerProductosCrew());
  ordenSecciones.push('V-Bucks', 'Crew · DLC · Packs');

  const fragmento = document.createDocumentFragment();

ordenSecciones.forEach(nombreSeccion => {
    const productos = seccionesMapa.get(nombreSeccion);
    if (!productos || productos.length === 0) return;

    // Los lotes/bundles siempre van primero dentro de su sección,
    // igual que en la tienda de referencia. Entre sí, mantienen el
    // orden en que llegaron de la API (sort estable).
    // FIX: orden de 3 niveles dentro de cada sección: 1) lotes
    // completos primero, 2) skins de personaje después, 3) el resto
    // (mochilas, picos, wraps, emotes, planeadores, etc.) al final.
    productos.sort((a, b) => {
      const rangoA = a.esLote ? 0 : (a.esSkin ? 1 : 2);
      const rangoB = b.esLote ? 0 : (b.esSkin ? 1 : 2);
      return rangoA - rangoB;
    });

    const bloqueSeccion = document.createElement('section');
    bloqueSeccion.className = 'seccion-tienda';
    bloqueSeccion.id = slugificarSeccion(nombreSeccion);
    bloqueSeccion.setAttribute('data-seccion-nombre', nombreSeccion);
    bloqueSeccion.style.cssText += obtenerFondoSeccion(nombreSeccion);

    const titulo = document.createElement('h3');
    titulo.className = 'seccion-titulo';
    titulo.textContent = nombreSeccion;
    titulo.style.background = obtenerColorSerie(nombreSeccion);
    bloqueSeccion.appendChild(titulo);

if (productos.length === 1) {
  // Sección con un solo producto (auto, bundle especial) → tarjeta grande
  const p = productos[0];
  const contenedorGrande = document.createElement('div');
  contenedorGrande.style.cssText = 'max-width: 700px;';
  contenedorGrande.appendChild(crearTarjetaGrandeHTML(p.nombre, p.pavos, p.precioSoles, p.imagen));
  bloqueSeccion.appendChild(contenedorGrande);
} else {
  const grid = document.createElement('div');
  grid.className = 'grid-productos';

  // "Pistas de improvisación" puede traer decenas de canciones.
  // Se muestran solo las primeras 8 y el resto detrás de "Ver más".
  const esSeccionPistas = nombreSeccion.toLowerCase().includes('pista');
  const LIMITE_PISTAS = 8;
  const productosVisibles = esSeccionPistas ? productos.slice(0, LIMITE_PISTAS) : productos;
  const productosOcultos = esSeccionPistas ? productos.slice(LIMITE_PISTAS) : [];

  productosVisibles.forEach(p => {
    grid.appendChild(crearTarjetaHTML(p.nombre, p.pavos, p.precioSoles, p.imagen, nombreSeccion, p.expira, p.esLote, p.fondoReal));
  });

  bloqueSeccion.appendChild(grid);

  if (productosOcultos.length > 0) {
    const btnVerMas = document.createElement('button');
    btnVerMas.type = 'button';
    btnVerMas.className = 'btn-ver-mas-pistas';
    btnVerMas.textContent = `Ver más (${productosOcultos.length} restantes)`;
    btnVerMas.addEventListener('click', () => {
      productosOcultos.forEach(p => {
        grid.appendChild(crearTarjetaHTML(p.nombre, p.pavos, p.precioSoles, p.imagen, nombreSeccion, p.expira, p.esLote, p.fondoReal));
      });
      btnVerMas.remove();
    });
    bloqueSeccion.appendChild(btnVerMas);
  }
}
    fragmento.appendChild(bloqueSeccion);
  });

  contenedor.appendChild(fragmento);

  // Guarda el orden final para que generarMenuFiltros use EXACTAMENTE
  // el mismo, sin recalcularlo por su cuenta.
  window._ordenSeccionesActual = ordenSecciones;

  iniciarScrollSpySecciones();
}
// ==========================================
// 16. BUSCADOR DE PRODUCTOS
// Filtra las tarjetas por nombre en tiempo real. Si una sección
// se queda sin resultados visibles, se oculta completa.
// ==========================================
function inicializarBuscador() {
  const input = document.getElementById('input-buscar');
  if (!input) return;

  input.addEventListener('input', () => {
    const termino = input.value.trim().toLowerCase();
    const tarjetas = document.querySelectorAll('.tarjeta-producto');
    const secciones = document.querySelectorAll('.seccion-tienda');

    tarjetas.forEach(tarjeta => {
      const nombre = (tarjeta.querySelector('.tarjeta-nombre')?.textContent || '').toLowerCase();
      const coincide = !termino || nombre.includes(termino);
      tarjeta.style.display = coincide ? '' : 'none';
    });

    secciones.forEach(seccion => {
      const algunaVisible = Array.from(seccion.querySelectorAll('.tarjeta-producto'))
        .some(t => t.style.display !== 'none');
      seccion.style.display = algunaVisible ? '' : 'none';
    });
  });
}

// ==========================================
// 9.5 DETECTAR SI EL PRODUCTO SE VA HOY
// La API de Fortnite trae "outDate" (fecha en que el item sale de
// la tienda). Si faltan 24h o menos, se considera "se va hoy".
// ==========================================
function seVaHoy(outDate) {
  if (!outDate) return false;
  try {
    const salida = new Date(outDate).getTime();
    const ahora = Date.now();
    const horasRestantes = (salida - ahora) / (1000 * 60 * 60);
    return horasRestantes > 0 && horasRestantes <= 24;
  } catch (e) {
    return false;
  }
}

function crearTarjetaHTML(nombre, pavos, precioSoles, imagen, seccion, expira, esLote, fondoReal) {
  const tarjeta = document.createElement('div');
    tarjeta.classList.add('tarjeta-producto');
  if (esLote) tarjeta.classList.add('tarjeta-producto-lote');
  if (seccion === 'V-Bucks') tarjeta.setAttribute('data-vbucks', '1');
  const iconoPavos = "https://fortnite-api.com/images/vbuck.png";
  const nombreLimpio = nombre.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  const badgeExpira = expira
    ? `<span class="badge-se-va-hoy"><span class="punto-pulso"></span>SE VA HOY</span>`
    : '';
  const estiloFondo = fondoReal ? `style="background: ${fondoReal};"` : '';
  tarjeta.innerHTML = `
    <div class="tarjeta-fondo" ${estiloFondo}>
      <img src="${imagen}" alt="${nombreLimpio}" class="tarjeta-imagen"
           loading="lazy" decoding="async"
           onerror="this.onerror=null; this.src='https://placehold.co/200x200/181528/ffffff?text=Fortnite';">
      <div class="tarjeta-overlay"></div>
      <div class="tarjeta-info">
        ${badgeExpira}
       <h4 class="tarjeta-nombre">${nombre}</h4>
        ${pavos ? `<p class="tarjeta-precio"><img src="${iconoPavos}" alt="V-Bucks" class="icono-pavos" loading="lazy" decoding="async">${pavos}</p>` : ''}
        <p class="tarjeta-precio-pen">${precioSoles} PEN</p>
      </div>
      <button class="btn-agregar btn-agregar-icono"
              data-nombre="${nombreLimpio}"
              data-precio="${precioSoles}"
              data-imagen="${imagen}">+</button>
    </div>
  `;
  return tarjeta;
}
function crearTarjetaGrandeHTML(nombre, pavos, precioSoles, imagen) {
  const tarjeta = document.createElement('div');
  tarjeta.classList.add('tarjeta-producto-grande');

  const iconoPavos = "https://fortnite-api.com/images/vbuck.png";
  const nombreLimpio = nombre.replace(/'/g, "&#39;").replace(/"/g, "&quot;");

  tarjeta.innerHTML = `
    <div class="tarjeta-fondo">
      <img src="${imagen}" alt="${nombreLimpio}" class="tarjeta-imagen"
           loading="lazy" decoding="async"
           onerror="this.onerror=null; this.src='https://placehold.co/400x250/181528/ffffff?text=Fortnite';">
      <div class="tarjeta-overlay"></div>
      <div class="tarjeta-info">
        <h4 class="tarjeta-nombre">${nombre}</h4>
        <p class="tarjeta-precio">
          <img src="${iconoPavos}" alt="V-Bucks" class="icono-pavos" loading="lazy" decoding="async">
          ${pavos}
        </p>
        <p class="tarjeta-precio-pen">${precioSoles} PEN</p>
      </div>
      <button class="btn-agregar btn-agregar-icono"
              data-nombre="${nombreLimpio}"
              data-precio="${precioSoles}"
              data-imagen="${imagen}">+</button>
    </div>
  `;
  return tarjeta;
}

// 9. COLORES POR SERIE / SECCIÓN
function obtenerColorSerie(seccion) {
  const colores = {
    'Marvel': 'linear-gradient(135deg, #0f766e, #1e1b4b)',
    'BLEACH': 'linear-gradient(135deg, #0e7490, #4c1d95)',
    'Terminator': 'linear-gradient(135deg, #134e4a, #312e81)',
    'Spider-Man': 'linear-gradient(135deg, #0891b2, #6d28d9)',
    'Gesto': 'linear-gradient(135deg, #0d9488, #4338ca)',
    'Pico': 'linear-gradient(135deg, #0f766e, #047857)',
    'Traje': 'linear-gradient(135deg, #155e75, #6366f1)',
    'Calzado': 'linear-gradient(135deg, #0e7490, #a21caf)',
    'Destacados': 'linear-gradient(135deg, #0f766e, #7c3aed)',
    'Más artículos': 'linear-gradient(135deg, #0f766e, #7c3aed)',
    'default': 'linear-gradient(135deg, #0d9488, #4c1d95)'
  };
  return colores[seccion] || colores['default'];
}
// ==========================================
// FONDOS TEMÁTICOS POR SECCIÓN
// Cada sección puede tener un color base + un patrón de fondo
// (SVG en data-URI) que la identifique visualmente, como telarañas
// para Spider-Man, estrellas para Star Wars, etc. Si una sección
// no tiene tema definido, usa un fondo genérico con su color.
// ==========================================
// ==========================================
// FONDOS TEMÁTICOS POR SECCIÓN
// Las franquicias conocidas tienen un tema fijo y reconocible
// (telarañas para Spider-Man, estrellas para Star Wars, etc).
// Cualquier sección NUEVA que no esté en la lista (colaboraciones,
// eventos, etc.) recibe automáticamente un fondo de una paleta
// variada, elegido según el nombre de la sección para que sea
// SIEMPRE el mismo fondo cada vez que esa sección aparezca
// (no cambia random en cada recarga).
// ==========================================
function obtenerFondoSeccion(seccion) {
  // FIX: se unifica el fondo de TODAS las secciones a un mismo estilo:
  // base oscura casi negra + un resplandor blanco tenue y difuminado.
  // Ya no hay temas por franquicia ni colores variados por sección.
  return `background-color: #0d0c14; background-image: radial-gradient(ellipse at top left, rgba(255,255,255,0.08), transparent 65%);`;
}

function limpiarNombre(nombreFeo) {
  return nombreFeo
    .replace(/^\[VIRTUAL\]\d+\s*x\s*/i, '')
    .replace(/\s*for\s*\d+\s*MtxCurrency/i, '')
    .replace(/\(SID_Placeholder_\d+\)/i, '')
    .trim();
}
// ==========================================
// SECCIONES MANUALES: V-BUCKS Y CREW/DLC/PACKS
// Estas dos NO vienen de la API de Fortnite (no son cosméticos),
// así que se arman a mano con precios reales en soles.
// ==========================================
function obtenerProductosVBucks() {
  return [
    { nombre: "800 V-Bucks", pavos: 800, precioSoles: "20.00", imagen: "https://image.api.playstation.com/vulcan/ap/rnd/202606/2419/b91e936d55f1ae1d77b2ded6c3c9c1d839f664af3b7dd95a.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "2.400 V-Bucks", pavos: 2400, precioSoles: "43.00", imagen: "https://image.api.playstation.com/vulcan/ap/rnd/202606/2419/2dae406a226530d633c0778ccaa32775fee17adfc1515660.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "4.500 V-Bucks", pavos: 4500, precioSoles: "67.00", imagen: "https://image.api.playstation.com/vulcan/ap/rnd/202606/2419/8761c4c50accb6d913f7b047975fbe8447b9b1d7eeaa25a2.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "12.500 V-Bucks", pavos: 12500, precioSoles: "165.00", imagen: "https://image.api.playstation.com/vulcan/ap/rnd/202606/2420/7c1f091337d884e32ff2b84de29ec9c513d671065443804e.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
  ];
}

function obtenerProductosCrew() {
  return [
    { nombre: "Club - 1 Mes(Xbox)", pavos: 0, precioSoles: "16.00", imagen: "https://cdn1.epicgames.com/offer/fn/FNECO_34-20_CyberDelivery_PaidMedia_EGS_PDP_LogoThumb_512x512_512x512-51e6dfb8c179b2f73f3b3bc2a740de84", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "Club - 1 Mes (EPIC)", pavos: 0, precioSoles: "25.00", imagen: "crew-epic.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "Pase de Batalla [Regalo]", pavos: 0, precioSoles: "20.00", imagen: "https://epiclim.com/img/tgbot/fnasset/pasebatallanew.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "Pase Musical [Regalo]", pavos: 0, precioSoles: "28.00", imagen: "https://epiclim.com/img/tgbot/fnasset/pasemusicnew.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "Paquete de inicio Operación brillante", pavos: 0, precioSoles: "12.00", imagen: "https://image.api.playstation.com/vulcan/ap/rnd/202402/2900/956432d0b4111afdb63eb5a14fe11ad7bd315574991d888e.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null },
    { nombre: "Pack de inicio Ruptura de la computadora central", pavos: 0, precioSoles: "20.00", imagen: "https://image.api.playstation.com/vulcan/ap/rnd/202608/0519/d32425b9677f8c27d8ec373b562c32be36b436f0a425165b.png", expira: false, esLote: false, artistaProducto: '', fondoReal: null }
  ];
}


// ==========================================
// 10. LÓGICA DEL CARRITO
// FIX: ya no se permite aumentar la cantidad de un producto que
// ya está en el carrito. Si el usuario intenta agregarlo de nuevo,
// simplemente se abre el carrito (sin sumar cantidad). Cada producto
// solo puede eliminarse por completo con el botón "×".
// ==========================================
function agregarAlCarrito(nombre, precio, imagen) {
  const existe = carritoItems.find(prod => prod.nombre === nombre);
  if (existe) {
    // Ya está en el carrito: no se aumenta la cantidad ni se abre el carrito.
    return;
  }
  carritoItems.push({ nombre, precio: parseFloat(precio), imagen, cantidad: 1 });
  actualizarVistaCarrito();
  // FIX: ya no se abre el carrito automáticamente al agregar un producto.
  // Solo se abre cuando el usuario toca el ícono del carrito.
}

function actualizarVistaCarrito() {
  const contenedorItems = document.getElementById('items-carrito');
  const totalTexto = document.getElementById('total-precio-carrito');
  const contadorHeader = document.getElementById('contador-carrito');

  if (!contenedorItems) return;
  contenedorItems.innerHTML = "";

  let sumaTotal = 0;
  let totalCantidad = 0;

  if (carritoItems.length === 0) {
    contenedorItems.innerHTML = `<p style="color: #71717a; text-align: center; padding: 15px; font-size: 0.85rem;">El carrito está vacío</p>`;
  } else {
    carritoItems.forEach((item, index) => {
      const subtotal = item.precio * item.cantidad;
      sumaTotal += subtotal;
      totalCantidad += item.cantidad;

      const itemElement = document.createElement('div');
      itemElement.classList.add('item-cart');
      itemElement.innerHTML = `
        <img src="${item.imagen}" alt="${item.nombre}" loading="lazy" decoding="async">
        <div class="item-info">
          <h5>${item.nombre}</h5>
          <span class="precio-item">${subtotal.toFixed(2)} PEN</span>
        </div>
        <button class="btn-eliminar-item" onclick="eliminarDelCarrito(${index})">&times;</button>
      `;
      contenedorItems.appendChild(itemElement);
    });
  }

  if (totalTexto) totalTexto.innerText = `${sumaTotal.toFixed(2)} PEN`;
  if (contadorHeader) contadorHeader.innerText = totalCantidad;
}

function eliminarDelCarrito(index) {
  carritoItems.splice(index, 1);
  actualizarVistaCarrito();
}

// ==========================================
// 10.4 IR A UNA SECCIÓN (clic en el menú de filtros)
// Ya no se filtra/reemplaza el catálogo: como ahora todas las
// secciones están renderizadas seguidas, un clic en el filtro
// simplemente hace scroll suave hasta el bloque de esa sección.
// ==========================================
function irASeccion(nombreSeccion) {
  const destino = document.getElementById(slugificarSeccion(nombreSeccion));
  if (!destino) return;
  const esMovil = window.innerWidth <= 900;
  let offset;
if (esMovil) {
    // En móvil el header (cabecera-fija) Y el sidebar (filtros) quedan
    // sticky, uno debajo del otro. Hay que restar la altura de AMBOS
    // para que el título de la sección no quede tapado.
    const cabecera = document.querySelector('.cabecera-fija');
    const sidebar = document.querySelector('.sidebar');
    const altoCabecera = cabecera ? cabecera.getBoundingClientRect().height : 0;
    const altoSidebar = sidebar ? sidebar.getBoundingClientRect().height : 0;
    offset = altoCabecera + altoSidebar + 34;
  } else {
    // En escritorio el sidebar va AL COSTADO del catálogo (dos columnas),
    // no lo tapa verticalmente. Solo hay que restar el header sticky.
    const header = document.querySelector('.cabecera-fija');
    offset = (header ? header.getBoundingClientRect().height : 70) + 55;
  }
  const posicionDestino = destino.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({
    top: Math.max(0, posicionDestino),
    behavior: 'smooth'
  });
}

function activarFiltroEnMenu(nombreSeccion) {
  document.querySelectorAll('.item-filtro').forEach(el => el.classList.remove('activo'));
  const itemCorrespondiente = Array.from(document.querySelectorAll('.item-filtro'))
    .find(el => el.getAttribute('data-seccion') === nombreSeccion);
  itemCorrespondiente?.classList.add('activo');

  // Mantiene el filtro activo visible dentro del propio scroll de
  // la lista de filtros, por si quedó fuera de vista.
  itemCorrespondiente?.scrollIntoView({ block: 'nearest' });

  // El botón "FILTROS" se queda siempre con el texto fijo "FILTROS".
  // La sección activa se ve directamente en el catálogo (el título
  // de la sección, ej. "Spider-Man", que ya trae su propio color).
}

// ==========================================
// 10.5 SCROLL-SPY: AL BAJAR EN LA TIENDA, CAMBIA
// AUTOMÁTICAMENTE LA SECCIÓN ACTIVA EN "FILTROS"
// FIX: esto es lo que faltaba para que el scroll de la tienda
// "pase de sección" solo. Se observa cada bloque .seccion-tienda;
// la que esté cruzando la franja superior de la pantalla en un
// momento dado se marca como activa en el menú lateral.
// ==========================================
let bloqueoScrollSpy = false;
let _handlerScrollSpy = null;

// FIX: antes se usaba IntersectionObserver con una franja ancha
// (-15% a -75%), lo que a veces dejaba DOS secciones "intersectando"
// al mismo tiempo (la que termina y la que empieza). Como el código
// recorría todas las entradas intersectando y marcaba la última que
// procesaba, el filtro resaltado no siempre coincidía con lo que
// realmente se veía en pantalla (ej: marcaba "BLEACH" mientras se
// veía "Un show más").
//
// Ahora se usa un cálculo directo en cada scroll: se recorren TODAS
// las secciones en orden y se elige la ÚLTIMA cuyo borde superior ya
// cruzó la línea de referencia (justo debajo del header). Esa es,
// sin ambigüedad, la sección que está siendo vista en ese momento.
function iniciarScrollSpySecciones() {
  const secciones = Array.from(document.querySelectorAll('.seccion-tienda'));
  if (!secciones.length) return;
  if (_handlerScrollSpy) {
    window.removeEventListener('scroll', _handlerScrollSpy);
  }
  function calcularSeccionActiva() {
    if (bloqueoScrollSpy) return;
    const cabH = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--cab-h')
    ) || 118;

    const esMovil = window.innerWidth <= 900;
    let lineaReferencia;

    if (esMovil) {
      const sidebar = document.querySelector('.sidebar');
      const altoSidebar = sidebar ? sidebar.getBoundingClientRect().height : 0;
      lineaReferencia = cabH + altoSidebar + 34;
    } else {
      lineaReferencia = cabH + 55;
    }

    let seccionActiva = secciones[0];
    for (const sec of secciones) {
      const top = sec.getBoundingClientRect().top;
      if (top - lineaReferencia <= 0) {
        seccionActiva = sec;
      } else {
        break;
      }
    }
    const nombreSeccion = seccionActiva.getAttribute('data-seccion-nombre');
    if (nombreSeccion) activarFiltroEnMenu(nombreSeccion);
  }
  _handlerScrollSpy = calcularSeccionActiva;
  window.addEventListener('scroll', _handlerScrollSpy, { passive: true });
  calcularSeccionActiva();
}

function filtrarPorSeccion(seccion) {
  // FIX: se mantiene esta función por compatibilidad, pero ahora
  // en vez de reemplazar el catálogo, navega a la sección pedida.
  irASeccion(seccion);
}

// ==========================================
// 10.5 BLOQUEO DE SCROLL DEL FONDO (MÓVIL)
// FIX: antes cada panel/modal ponía y quitaba la clase
// 'bloquear-scroll' directamente. Si dos estaban abiertos a la
// vez (ej: modal de pago + QR ampliado), al cerrar el segundo se
// desbloqueaba el scroll aunque el primero siguiera abierto,
// y como tampoco se guardaba la posición de scroll, todo el
// contenido de atrás se veía desordenado/superpuesto al cerrar.
// Ahora se usa un contador: solo se desbloquea cuando ya no
// queda NINGÚN panel abierto, y se restaura el scroll exacto.
// ==========================================
let panelesAbiertos = 0;
let scrollGuardado = 0;

function bloquearScrollBody() {
  panelesAbiertos++;
  if (panelesAbiertos === 1) {
    scrollGuardado = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = `-${scrollGuardado}px`;
    document.body.classList.add('bloquear-scroll');
  }
}

function desbloquearScrollBody() {
  panelesAbiertos = Math.max(0, panelesAbiertos - 1);
  if (panelesAbiertos === 0) {
    document.body.classList.remove('bloquear-scroll');
    document.body.style.top = '';
    window.scrollTo(0, scrollGuardado);
  }
}

// 11. CONTROL DE PANELES (CARRITO)
const panelCarrito = document.getElementById('panel-carrito');
const overlayCarrito = document.getElementById('overlay-carrito');

function abrirCarrito() {
  panelCarrito?.classList.remove('oculto');
  overlayCarrito?.classList.remove('oculto');
  bloquearScrollBody();
}
function cerrarCarrito() {
  panelCarrito?.classList.add('oculto');
  overlayCarrito?.classList.add('oculto');
  desbloquearScrollBody();
}

document.getElementById('btn-carrito')?.addEventListener('click', (e) => {
  e.preventDefault();
  abrirCarrito();
});
document.getElementById('btn-cerrar-carrito')?.addEventListener('click', cerrarCarrito);
overlayCarrito?.addEventListener('click', cerrarCarrito);

// 12. NAVEGACIÓN DE PANTALLAS
document.getElementById('btn-entrar')?.addEventListener('click', () => mostrarPantalla('pantalla-auth'));
document.getElementById('btn-cerrar')?.addEventListener('click', () => mostrarPantalla('pantalla-bienvenida'));

function mostrarPantalla(idPantalla) {
  document.getElementById('pantalla-bienvenida')?.classList.add('oculto');
  document.getElementById('pantalla-auth')?.classList.add('oculto');
  document.getElementById('pantalla-tienda')?.classList.add('oculto');
  document.getElementById(idPantalla)?.classList.remove('oculto');
}

// ==========================================
// 13. MODAL DE PAGO (YAPE)
// ==========================================
const modalPago = document.getElementById('modal-pago');
const overlayPago = document.getElementById('overlay-pago');
const montoTotalPago = document.getElementById('monto-total-pago');

function abrirModalPago() {
  const totalCarritoElemento = document.getElementById('total-precio-carrito');
  if (totalCarritoElemento && montoTotalPago) {
    montoTotalPago.innerText = totalCarritoElemento.innerText;
  }
  cerrarCarrito();
  overlayPago?.classList.remove('oculto');
  modalPago?.classList.remove('oculto');
  modalPago?.classList.add('mostrar');
  bloquearScrollBody();
}

function cerrarModalPago() {
  overlayPago?.classList.add('oculto');
  modalPago?.classList.remove('mostrar');
  modalPago?.classList.add('oculto');
  desbloquearScrollBody();
}

// ==========================================
// 14. EVENTOS GLOBALES DE CLIC
// FIX: aquí está el ÚNICO lugar que escucha clics de filtros,
// botón agregar, pago y whatsapp. Antes había versiones
// repetidas de estos mismos manejadores en otras partes del
// archivo, causando doble ejecución.
// ==========================================
document.addEventListener('click', (e) => {

  // Botón "FILTROS" — abre/cierra el panel desplegable
  const btnToggleFiltros = e.target.closest('#btn-toggle-filtros');
  if (btnToggleFiltros) {
    document.getElementById('panel-filtros')?.classList.toggle('oculto');
    return;
  }

  // Filtros de categoría
  const itemFiltro = e.target.closest('.item-filtro');
  if (itemFiltro) {
    const seccion = itemFiltro.getAttribute('data-seccion');

    // Marca el filtro como activo al instante (feedback inmediato),
    // y evita que el scroll-spy lo pise mientras dura el scroll suave.
    document.querySelectorAll('.item-filtro').forEach(el => el.classList.remove('activo'));
    itemFiltro.classList.add('activo');

// Solo se cierra automáticamente en móvil (donde el panel
    // funciona como un desplegable); en escritorio se queda visible.
    if (window.innerWidth <= 900) {
      document.getElementById('panel-filtros')?.classList.add('oculto');
    }

    bloqueoScrollSpy = true;
    irASeccion(seccion);
    window.clearTimeout(window._timeoutScrollSpy);
    window._timeoutScrollSpy = window.setTimeout(() => { bloqueoScrollSpy = false; }, 900);
    return;
  }

  // Botón "Agregar" de las tarjetas
  const btnAgregar = e.target.closest('.btn-agregar');
  if (btnAgregar) {
    const nombre = btnAgregar.getAttribute('data-nombre');
    const precio = btnAgregar.getAttribute('data-precio');
    const imagen = btnAgregar.getAttribute('data-imagen');
    if (nombre && precio && imagen) agregarAlCarrito(nombre, precio, imagen);
    return;
  }

  // Abrir modal de pago desde el carrito
  if (e.target.closest('.btn-realizar-pago')) {
    e.preventDefault();
    abrirModalPago();
    return;
  }

  // Cerrar modal de pago
  if (e.target.closest('#btn-cerrar-pago') || e.target.id === 'overlay-pago') {
    cerrarModalPago();
    return;
  }

  // Enviar pedido a WhatsApp (cualquiera de los botones de whatsapp que tengas)
  if (e.target.closest('.btn-whatsapp') || e.target.closest('#btn-pago-whatsapp')) {
    e.preventDefault();
    enviarPedidoWhatsApp();
    return;
  }

  // Si el clic fue fuera del panel de filtros, ciérralo
  const panelFiltros = document.getElementById('panel-filtros');
  if (panelFiltros && !panelFiltros.classList.contains('oculto') && !e.target.closest('.sidebar')) {
    panelFiltros.classList.add('oculto');
  }
});

// 15. ZOOM DEL CÓDIGO QR
document.addEventListener('click', (e) => {
  const modalZoom = document.getElementById('modal-qr-zoom');
  const imgAmpliada = document.getElementById('img-qr-ampliada');

  if (e.target.closest('.qr-imagen') || e.target.closest('.qr-ayuda')) {
    const qrImg = document.querySelector('.qr-imagen');
    if (qrImg && modalZoom && imgAmpliada) {
      imgAmpliada.src = qrImg.src;
      modalZoom.classList.remove('oculto');
      bloquearScrollBody();
    }
  }

  if (e.target.closest('#modal-qr-zoom') || e.target.closest('#cerrar-qr-zoom')) {
    if (!modalZoom.classList.contains('oculto')) {
      modalZoom.classList.add('oculto');
      desbloquearScrollBody();
    }
  }
});
