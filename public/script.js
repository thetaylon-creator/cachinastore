let totalItems = 0;
const TASA_CONVERSION = 1.40; // 100 Pavos = 1.40 PEN
let productosGlobales = [];
let carritoItems = [];

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
    const respuesta = await fetch('https://fortnite-api.com/v2/shop?language=es-419');
    const datos = await respuesta.json();

    if (datos && datos.data && datos.data.entries) {
      productosGlobales = datos.data.entries;

      

      renderizarProductos(productosGlobales);
      generarMenuFiltros(window._ordenSeccionesActual || []);
    }  } catch (error) {
    console.error("Error al conectar con la API:", error);
    contenedor.innerHTML = '<p style="color: #ff4757; grid-column: 1/-1; text-align: center;">Error al cargar los productos.</p>';
  }
}

// 4. OBTENER SECCIÓN OFICIAL DE FORTNITE
// FIX: el campo correcto para el nombre real de cada fila de la
// tienda es entry.layout.name (ej: "Fiesta de la victoria", "Marvel",
// "BLEACH"). Antes se buscaba primero entry.section.name, que no
// existe en la API actual, así que casi todo caía en "Destacados".
function obtenerNombreSeccion(entry) {
  if (entry.layout && entry.layout.name) return entry.layout.name;
  if (entry.layout && entry.layout.category) return entry.layout.category;
  if (entry.section && entry.section.name) return entry.section.name;
  return "Destacados";
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
// ==========================================
function inyectarEstilosFiltros() {
  if (document.getElementById('estilos-filtros-dinamicos')) return;

  const style = document.createElement('style');
  style.id = 'estilos-filtros-dinamicos';
style.textContent = `
    .panel-filtros-header svg{ width:16px; height:16px; flex-shrink:0; }
    .filtros-label{ display:flex; align-items:center; gap:6px; }
    .panel-filtros{
      position:relative; width:100%; max-width:100%;
      max-height:480px; min-height:0;
      overflow-y:auto; overflow-x:hidden;
      background:rgba(10,8,18,0.94);
      border-radius:0 0 10px 10px;
      box-sizing:border-box; padding:8px;
      box-shadow:0 10px 30px rgba(0,0,0,0.4);
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.3) transparent;
    }
    .panel-filtros::-webkit-scrollbar{ width:7px; }
    .panel-filtros::-webkit-scrollbar-track{ background:transparent; }
    .panel-filtros::-webkit-scrollbar-thumb{ background:rgba(255,255,255,0.3); border-radius:8px; }
    .panel-filtros::-webkit-scrollbar-thumb:hover{ background:rgba(255,255,255,0.5); }
    .panel-filtros .item-filtro{
      list-style:none; padding:11px 14px; margin:2px 0;
      color:var(--text-muted); font-weight:500; font-size:0.85rem;
      letter-spacing:0.2px; text-transform:none;
      border-radius:8px; cursor:pointer; transition:color .15s, background .15s, font-weight .15s;
      background:transparent;
      word-wrap:break-word; overflow-wrap:break-word;
      border-left: 3px solid transparent;
    }
    .panel-filtros .item-filtro:hover{
      color:#fff;
      background:rgba(255,255,255,0.05);
    }
    .panel-filtros .item-filtro.activo{
      color: var(--accent-purple) !important;
      background: rgba(108,92,231,0.12) !important;
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
// Excluye "Destacados" por completo y manda "Pistas de
// improvisación" al final, sin importar en qué posición la
// devuelva la API.
// ==========================================

function generarMenuFiltros(secciones) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.style.width = '100%';
  sidebar.style.maxWidth = '100%';
  sidebar.style.boxSizing = 'border-box';
  sidebar.style.overflow = 'hidden';

  inyectarEstilosFiltros();

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
}

function aplicarScrollSticky() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // En móvil (sidebar apilado arriba del catálogo) no aplica sticky.
  if (window.innerWidth <= 900) {
    sidebar.style.position = 'static';
    sidebar.style.top = 'auto';
    sidebar.style.alignSelf = 'auto';
    sidebar.style.maxHeight = 'none';
    return;
  }

  // En escritorio: el sidebar se queda "pegado" a 90px del tope
  // (debajo del header) mientras se hace scroll de toda la página.
  sidebar.style.position = 'sticky';
  sidebar.style.top = '90px';
  sidebar.style.alignSelf = 'start';
  sidebar.style.maxHeight = 'calc(100vh - 110px)';
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

  entries.forEach(entry => {
    const seccionNombre = obtenerNombreSeccion(entry).trim();
    if (seccionNombre === "Destacados") return;

    const item = (entry.brItems && entry.brItems[0]) ||
                 (entry.tracks && entry.tracks[0]) ||
                 (entry.instruments && entry.instruments[0]) ||
                 (entry.cars && entry.cars[0]) ||
                 (entry.items && entry.items[0]) ||
                 entry.bundle || {};

    let nombre = entry.bundle?.name || item.name || entry.devName || "Objeto de Fortnite";
    nombre = limpiarNombre(nombre);
    if (nombre.includes("TBD") || nombre.length < 2) return;

    const imagen = obtenerImagenReal(entry, item);
    const pavos = entry.finalPrice || entry.regularPrice || 500;
    const precioSoles = ((pavos / 100) * TASA_CONVERSION).toFixed(2);

    if (!seccionesMapa.has(seccionNombre)) seccionesMapa.set(seccionNombre, []);
    seccionesMapa.get(seccionNombre).push({ nombre, pavos, precioSoles, imagen });
  });

  // Orden ÚNICO: mismo orden en que aparecieron las secciones al
  // recorrer los productos, pero cualquier sección cuyo nombre
  // contenga "pista" (ej. "Pistas de improvisación") se manda
  // siempre al final. Este mismo arreglo lo va a usar el menú
  // de filtros, así los dos SIEMPRE coinciden.
  const esPistas = (n) => n.toLowerCase().includes('pista');
  const todasLasSecciones = Array.from(seccionesMapa.keys());
  const normales = todasLasSecciones.filter(n => !esPistas(n));
  const pistas = todasLasSecciones.filter(esPistas);
  const ordenSecciones = [...normales, ...pistas];

  const fragmento = document.createDocumentFragment();

  ordenSecciones.forEach(nombreSeccion => {
    const productos = seccionesMapa.get(nombreSeccion);
    if (!productos || productos.length === 0) return;

    const bloqueSeccion = document.createElement('section');
    bloqueSeccion.className = 'seccion-tienda';
    bloqueSeccion.id = slugificarSeccion(nombreSeccion);
    bloqueSeccion.setAttribute('data-seccion-nombre', nombreSeccion);

    const titulo = document.createElement('h3');
    titulo.className = 'seccion-titulo';
    titulo.textContent = nombreSeccion;
    titulo.style.background = obtenerColorSerie(nombreSeccion);
    bloqueSeccion.appendChild(titulo);

    const grid = document.createElement('div');
    grid.className = 'grid-productos';

    productos.forEach(p => {
      grid.appendChild(crearTarjetaHTML(p.nombre, p.pavos, p.precioSoles, p.imagen, nombreSeccion));
    });

    bloqueSeccion.appendChild(grid);
    fragmento.appendChild(bloqueSeccion);
  });

  contenedor.appendChild(fragmento);

  // Guarda el orden final para que generarMenuFiltros use EXACTAMENTE
  // el mismo, sin recalcularlo por su cuenta.
  window._ordenSeccionesActual = ordenSecciones;

  iniciarScrollSpySecciones();
}

function crearTarjetaHTML(nombre, pavos, precioSoles, imagen, seccion) {
  const tarjeta = document.createElement('div');
  tarjeta.classList.add('tarjeta-producto');

  const iconoPavos = "https://fortnite-api.com/images/vbuck.png";
  const nombreLimpio = nombre.replace(/'/g, "&#39;").replace(/"/g, "&quot;");

  // FIX RENDIMIENTO: loading="lazy" hace que el navegador solo
  // descargue la imagen cuando está por entrar en pantalla, en vez
  // de bajar todas las imágenes de golpe apenas carga la tienda.
  tarjeta.innerHTML = `
    <div class="tarjeta-fondo">
      <img src="${imagen}" alt="${nombreLimpio}" class="tarjeta-imagen"
           loading="lazy" decoding="async"
           onerror="this.onerror=null; this.src='https://placehold.co/200x200/181528/ffffff?text=Fortnite';">
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
    'Marvel': 'linear-gradient(135deg, #1d0e0e, #801212)',
    'BLEACH': 'linear-gradient(135deg, #230f38, #601893)',
    'Terminator': 'linear-gradient(135deg, #111827, #374151)',
    'Spider-Man': 'linear-gradient(135deg, #1e3a8a, #991b1b)',
    'Gesto': 'linear-gradient(135deg, #1e1b4b, #4338ca)',
    'Pico': 'linear-gradient(135deg, #064e3b, #047857)',
    'Traje': 'linear-gradient(135deg, #312e81, #6366f1)',
    'Calzado': 'linear-gradient(135deg, #701a75, #c026d3)',
    'Destacados': 'linear-gradient(135deg, #78350f, #d97706)',
    'default': 'linear-gradient(135deg, #181528, #2a2244)'
  };
  return colores[seccion] || colores['default'];
}

function limpiarNombre(nombreFeo) {
  return nombreFeo
    .replace(/^\[VIRTUAL\]\d+\s*x\s*/i, '')
    .replace(/\s*for\s*\d+\s*MtxCurrency/i, '')
    .replace(/\(SID_Placeholder_\d+\)/i, '')
    .trim();
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
  destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function activarFiltroEnMenu(nombreSeccion) {
  document.querySelectorAll('.item-filtro').forEach(el => el.classList.remove('activo'));
  const itemCorrespondiente = Array.from(document.querySelectorAll('.item-filtro'))
    .find(el => el.getAttribute('data-seccion') === nombreSeccion);
  itemCorrespondiente?.classList.add('activo');

  // Mantiene el filtro activo visible dentro del propio scroll de
  // la lista de filtros, por si quedó fuera de vista.
  itemCorrespondiente?.scrollIntoView({ block: 'nearest' });
}

// ==========================================
// 10.5 SCROLL-SPY: AL BAJAR EN LA TIENDA, CAMBIA
// AUTOMÁTICAMENTE LA SECCIÓN ACTIVA EN "FILTROS"
// FIX: esto es lo que faltaba para que el scroll de la tienda
// "pase de sección" solo. Se observa cada bloque .seccion-tienda;
// la que esté cruzando la franja superior de la pantalla en un
// momento dado se marca como activa en el menú lateral.
// ==========================================
let observadorSecciones = null;
let bloqueoScrollSpy = false;

function iniciarScrollSpySecciones() {
  if (observadorSecciones) observadorSecciones.disconnect();

  const secciones = document.querySelectorAll('.seccion-tienda');
  if (!secciones.length) return;

  observadorSecciones = new IntersectionObserver((entradas) => {
    if (bloqueoScrollSpy) return;

    entradas.forEach(entrada => {
      if (entrada.isIntersecting) {
        const nombreSeccion = entrada.target.getAttribute('data-seccion-nombre');
        if (nombreSeccion) activarFiltroEnMenu(nombreSeccion);
      }
    });
  }, {
    root: null,
    // Considera "activa" la sección que está cruzando una franja
    // angosta cerca de la parte superior de la pantalla/scroll.
    rootMargin: '-15% 0px -75% 0px',
    threshold: 0
  });

  secciones.forEach(sec => observadorSecciones.observe(sec));
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

    bloqueoScrollSpy = true;
    irASeccion(seccion);
    window.clearTimeout(window._timeoutScrollSpy);
    window._timeoutScrollSpy = window.setTimeout(() => { bloqueoScrollSpy = false; }, 900);

    // Solo se cierra automáticamente en móvil (donde el panel
    // funciona como un desplegable); en escritorio se queda visible.
    if (window.innerWidth <= 900) {
      document.getElementById('panel-filtros')?.classList.add('oculto');
    }
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
