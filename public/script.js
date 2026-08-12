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
// 3. OBTENER TIENDA COMPLETA EN ESPAÑOL
// ==========================================
async function obtenerTiendaFortnite() {
  const contenedor = document.getElementById('contenedor-productos');
  if (!contenedor) return;

  contenedor.innerHTML = '<p style="color: #a29bfe; grid-column: 1/-1; text-align: center;">Cargando la tienda en vivo...</p>';

  try {
    const respuesta = await fetch('https://fortnite-api.com/v2/shop?language=es');
    const datos = await respuesta.json();

    if (datos && datos.data && datos.data.entries) {
      productosGlobales = datos.data.entries;

      generarMenuFiltros(productosGlobales);

      const primerFiltro = document.querySelector('.item-filtro');
      if (primerFiltro) {
        const primeraSec = primerFiltro.getAttribute('data-seccion');
        filtrarPorSeccion(primeraSec);
      } else {
        renderizarProductos(productosGlobales);
      }
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
// 5. GENERAR MENÚ DE FILTROS — BARRA LATERAL FIJA
// (Siempre visible, sin necesidad de clic. Se ajusta al ancho
// de su columna para no sobresalir sobre el catálogo.)
// ==========================================
function inyectarEstilosFiltros() {
  if (document.getElementById('estilos-filtros-dinamicos')) return;

  const style = document.createElement('style');
  style.id = 'estilos-filtros-dinamicos';
  style.textContent = `
    .panel-filtros-header{
      display:flex; align-items:center; gap:8px;
      background:rgba(255,255,255,0.96); color:#111;
      padding:11px 16px; border-radius:10px 10px 0 0;
      font-weight:800; font-size:0.82rem; letter-spacing:0.3px;
      text-transform:uppercase;
    }
    .panel-filtros-header svg{ width:15px; height:15px; }
    .panel-filtros{
      position:relative; width:100%; max-width:100%;
      max-height:calc(100vh - 120px); overflow-y:auto; overflow-x:hidden;
      background:rgba(10,8,18,0.94);
      border-radius:0 0 10px 10px;
      box-sizing:border-box; padding:6px;
      box-shadow:0 10px 30px rgba(0,0,0,0.4);
    }
    .panel-filtros .item-filtro{
      list-style:none; padding:12px 10px; margin:2px 0;
      color:#fff; font-weight:700; font-size:0.76rem;
      letter-spacing:0.3px; text-transform:uppercase;
      border-radius:8px; cursor:pointer; transition:0.15s;
      background:transparent;
      word-wrap:break-word; overflow-wrap:break-word;
    }
    .panel-filtros .item-filtro:hover{ background:rgba(255,255,255,0.08); }
    .panel-filtros .item-filtro.activo{ background:#e8e8e8 !important; color:#111 !important; }
  `;
  document.head.appendChild(style);
}

function generarMenuFiltros(entries) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  sidebar.style.width = '100%';
  sidebar.style.maxWidth = '100%';
  sidebar.style.boxSizing = 'border-box';
  sidebar.style.overflow = 'hidden';

  inyectarEstilosFiltros();

  const seccionesSet = new Set();
  entries.forEach(entry => {
    const nombreSeccion = obtenerNombreSeccion(entry);
    if (nombreSeccion !== "Destacados") seccionesSet.add(nombreSeccion);
  });
  const secciones = Array.from(seccionesSet);

  let htmlMenu = `
    <div class="panel-filtros-header">
      FILTROS
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="4" y1="6" x2="20" y2="6"></line>
        <line x1="7" y1="12" x2="17" y2="12"></line>
        <line x1="10" y1="18" x2="14" y2="18"></line>
      </svg>
    </div>
    <ul class="panel-filtros">
  `;

  secciones.forEach((sec, index) => {
    const claseActiva = index === 0 ? 'item-filtro activo' : 'item-filtro';
    htmlMenu += `<li class="${claseActiva}" data-seccion="${sec}">${sec}</li>`;
  });

  htmlMenu += `</ul>`;
  sidebar.innerHTML = htmlMenu;
  aplicarScrollSticky();
}

function aplicarScrollSticky() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.style.position = 'sticky';
    sidebar.style.top = '20px';
    sidebar.style.alignSelf = 'start';
    sidebar.style.maxHeight = 'calc(100vh - 40px)';
  }
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
// FIX: se eliminó por completo el listener duplicado que usaba
// la variable inexistente TODAS_LAS_ENTRADAS (causaba un error
// en consola cada vez que hacías clic en un filtro). El único
// manejador de clics en filtros ahora vive en la sección 10.
// ==========================================

// 7. RENDERIZAR PRODUCTOS
function renderizarProductos(entries) {
  const contenedor = document.getElementById('contenedor-productos');
  if (!contenedor) return;

  contenedor.innerHTML = "";

  if (entries.length === 0) {
    contenedor.innerHTML = '<p style="color: #a29bfe; grid-column: 1/-1; text-align: center;">No hay productos en esta sección.</p>';
    return;
  }

  entries.forEach(entry => {
    const item = (entry.brItems && entry.brItems[0]) ||
                 (entry.tracks && entry.tracks[0]) ||
                 (entry.instruments && entry.instruments[0]) ||
                 (entry.cars && entry.cars[0]) ||
                 (entry.items && entry.items[0]) ||
                 entry.bundle || {};

    let nombre = item.name || entry.devName || "Objeto de Fortnite";
    nombre = limpiarNombre(nombre);
    if (nombre.includes("TBD") || nombre.length < 2) return;

    const imagen = obtenerImagenReal(entry, item);
    const pavos = entry.finalPrice || entry.regularPrice || 500;
    const precioSoles = ((pavos / 100) * TASA_CONVERSION).toFixed(2);
    const seccionNombre = obtenerNombreSeccion(entry);

    crearTarjetaHTML(nombre, pavos, precioSoles, imagen, seccionNombre);
  });
}

function crearTarjetaHTML(nombre, pavos, precioSoles, imagen, seccion) {
  const contenedor = document.getElementById('contenedor-productos');
  const tarjeta = document.createElement('div');
  tarjeta.classList.add('tarjeta-producto');

  const iconoPavos = "https://fortnite-api.com/images/vbuck.png";
  const nombreLimpio = nombre.replace(/'/g, "&#39;").replace(/"/g, "&quot;");

  tarjeta.innerHTML = `
    <div class="tarjeta-fondo">
      <img src="${imagen}" alt="${nombreLimpio}" class="tarjeta-imagen"
           onerror="this.onerror=null; this.src='https://placehold.co/200x200/181528/ffffff?text=Fortnite';">
      <div class="tarjeta-overlay"></div>
      <div class="tarjeta-info">
        <h4 class="tarjeta-nombre">${nombre}</h4>
        <p class="tarjeta-precio">
          <img src="${iconoPavos}" alt="V-Bucks" class="icono-pavos">
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
  contenedor.appendChild(tarjeta);
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
    // Ya está en el carrito: no se aumenta la cantidad.
    abrirCarrito();
    return;
  }
  carritoItems.push({ nombre, precio: parseFloat(precio), imagen, cantidad: 1 });
  actualizarVistaCarrito();
  abrirCarrito();
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
        <img src="${item.imagen}" alt="${item.nombre}">
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

function filtrarPorSeccion(seccion) {
  const filtrados = seccion === "Todos"
    ? productosGlobales
    : productosGlobales.filter(entry => obtenerNombreSeccion(entry) === seccion);
  renderizarProductos(filtrados);
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
    document.querySelectorAll('.item-filtro').forEach(el => el.classList.remove('activo'));
    itemFiltro.classList.add('activo');

    filtrarPorSeccion(itemFiltro.getAttribute('data-seccion'));
    document.getElementById('panel-filtros')?.classList.add('oculto');
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
