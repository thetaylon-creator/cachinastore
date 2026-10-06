// ==========================================
// MODAL "CONFIRMAR PEDIDO"
// Se carga DESPUÉS de script.js.
// ==========================================
(function () {
  const modal = document.getElementById('modal-pago');
  if (!modal) return;

  const $ = (id) => document.getElementById(id);

  const el = {
    listaPedido: $('mc-lista-pedido'),
    total: $('monto-total-pago'),
    usuarioNombre: $('mc-usuario-nombre'),
    usuarioEmail: $('mc-usuario-email'),
    mensaje: $('mc-mensaje'),
    pasoPedido: $('mc-paso-pedido'),
    pasoComprobante: $('mc-paso-comprobante'),
    pasoExito: $('mc-paso-exito'),
    selector: $('mc-selector'),
    seleccionado: $('mc-seleccionado'),
    detalle: $('mc-detalle'),
    btnMetodo: $('mc-btn-metodo'),
    btnCambiar: $('mc-btn-cambiar'),
    btnYaPague: $('btn-ya-pague'),
    ayuda: $('mc-ayuda'),
    btnVolver: $('mc-btn-volver'),
    inputArchivo: $('mc-input-archivo'),
    zona: $('mc-zona-subir'),
    preview: $('mc-preview'),
    btnFinalizar: $('mc-btn-finalizar')
  };

  let urlPreview = null;
  let finalizando = false;

  function leerSesion() {
    try { return JSON.parse(localStorage.getItem('cachina_sesion') || 'null') || {}; } catch (e) { return {}; }
  }

  // Mensaje de WhatsApp (incluye cuenta de Google y ticket)
  window.construirMensajePedido = function () {
    const ses = leerSesion();
    const idFortnite = localStorage.getItem('usuarioLogueado') || 'No especificado';
    const items = (typeof carritoItems !== 'undefined' && Array.isArray(carritoItems)) ? carritoItems : [];

    let lista = '';
    let total = 0;
    if (!items.length) {
      lista = '• (carrito vacío)\n';
    } else {
      items.forEach((item) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        lista += `• *${item.nombre}* x${item.cantidad} — ${subtotal.toFixed(2)} PEN\n`;
      });
    }

    const cuenta = ses.email ? `${ses.nombre || ''} (${ses.email})`.trim() : 'No especificado';
    return `*ORDEN CREADA — CachinaStore*\n` +
           (window.ticketPedidoActual ? `*Ticket:* ${window.ticketPedidoActual}\n` : '') + `\n` +
           `*Cliente:* ${cuenta}\n` +
           `*ID de Fortnite (regalo para):* ${idFortnite}\n\n` +
           `${lista}` +
           `*Total:* ${total.toFixed(2)} PEN\n` +
           `*Moneda:* PEN`;
  };

  // ---------- Pasos ----------
  function mostrarPaso(paso) {
    el.pasoPedido.classList.toggle('oculto', paso !== 'pedido');
    el.pasoComprobante.classList.toggle('oculto', paso !== 'comprobante');
    if (el.pasoExito) el.pasoExito.classList.toggle('oculto', paso !== 'exito');
  }

  function seleccionarMetodo(activo) {
    el.selector.classList.toggle('oculto', activo);
    el.seleccionado.classList.toggle('oculto', !activo);
    el.detalle.classList.toggle('oculto', !activo);
    el.mensaje.classList.toggle('oculto', !activo);
    el.btnYaPague.disabled = !activo;
    el.ayuda.classList.toggle('oculto', activo);
  }

  function limpiarComprobante() {
    if (urlPreview) URL.revokeObjectURL(urlPreview);
    urlPreview = null;
    el.inputArchivo.value = '';
    el.preview.removeAttribute('src');
    el.zona.classList.remove('con-imagen');
    el.btnFinalizar.disabled = true;
    el.pasoComprobante.classList.remove('sin-comp');
  }

  // ---------- Rellenar con el carrito ----------
  function pintarPedido() {
    const ses = leerSesion();
    const idCliente = localStorage.getItem('usuarioLogueado') || '—';
    el.usuarioNombre.textContent = ses.nombre || ses.email || '—';
    el.usuarioEmail.textContent = ses.nombre ? (ses.email || '') : '';

    const items = (typeof carritoItems !== 'undefined' && Array.isArray(carritoItems)) ? carritoItems : [];
    el.listaPedido.innerHTML = '';

    let total = 0;
    items.forEach((item) => {
      const subtotal = item.precio * item.cantidad;
      total += subtotal;

      const fila = document.createElement('div');
      fila.className = 'mc-item';

      const img = document.createElement('img');
      img.src = item.imagen;
      img.alt = item.nombre;

      const info = document.createElement('div');
      info.className = 'mc-item-info';

      const nombre = document.createElement('div');
      nombre.className = 'mc-item-nombre';
      nombre.textContent = item.nombre;

      const para = document.createElement('div');
      para.className = 'mc-item-para';
      para.textContent = 'Para: ' + idCliente;

      const cant = document.createElement('div');
      cant.className = 'mc-item-cant';
      cant.textContent = 'Cantidad: ' + item.cantidad;

      info.append(nombre, para, cant);

      const precio = document.createElement('div');
      precio.className = 'mc-item-precio';
      precio.textContent = 'S/ ' + subtotal.toFixed(2);

      fila.append(img, info, precio);
      el.listaPedido.appendChild(fila);
    });

    el.total.textContent = 'S/ ' + total.toFixed(2);
  }

  function reiniciarModal() {
    finalizando = false;
    window.ticketPedidoActual = null;
    pintarPedido();
    limpiarComprobante();
    seleccionarMetodo(false);
    mostrarPaso('pedido');
  }

  // Cada vez que el modal se abre (clase "mostrar"), se reinicia.
  let estabaAbierto = false;
  new MutationObserver(() => {
    const abierto = modal.classList.contains('mostrar');
    if (abierto && !estabaAbierto) reiniciarModal();
    estabaAbierto = abierto;
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });

  // ---------- Eventos ----------
  el.btnMetodo.addEventListener('click', () => seleccionarMetodo(true));
  el.btnCambiar.addEventListener('click', () => seleccionarMetodo(false));

  el.btnYaPague.addEventListener('click', () => {
    if (el.btnYaPague.disabled) return;
    mostrarPaso('comprobante');
  });

  el.btnVolver.addEventListener('click', () => mostrarPaso('pedido'));

  el.zona.addEventListener('click', () => el.inputArchivo.click());

  el.inputArchivo.addEventListener('change', () => {
    const archivo = el.inputArchivo.files && el.inputArchivo.files[0];
    if (!archivo) { limpiarComprobante(); return; }

    const permitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!permitidos.includes(archivo.type)) {
      limpiarComprobante();
      alert('Sube una imagen JPG, PNG o WebP. Si tu banco te dio un PDF, mándanos una captura de pantalla.');
      return;
    }
    if (archivo.size > 10 * 1024 * 1024) {
      limpiarComprobante();
      alert('La imagen pesa más de 10 MB. Prueba con una captura de pantalla.');
      return;
    }

    if (urlPreview) URL.revokeObjectURL(urlPreview);
    urlPreview = URL.createObjectURL(archivo);
    el.preview.src = urlPreview;
    el.zona.classList.add('con-imagen');
    el.btnFinalizar.disabled = false;
  });

  // ---------- Pantalla "¡Pedido creado!" ----------
  function mostrarExito(ticket) {
    const num = $('mc-ticket-num');
    const caja = el.pasoExito ? el.pasoExito.querySelector('.mc-ticket') : null;
    const etiqueta = caja && caja.previousElementSibling;
    const hayTicket = ticket !== undefined && ticket !== null && ticket !== '';

    if (num) num.textContent = hayTicket ? '#' + String(ticket).replace('#', '') : '';
    if (caja) caja.style.display = hayTicket ? '' : 'none';
    if (etiqueta) etiqueta.style.display = hayTicket ? '' : 'none';
    const wa = $('mc-wa-link');
    if (wa) wa.href = window.urlWhatsAppPedido || '#';
    mostrarPaso('exito');
  }
  window.mostrarPedidoCreado = mostrarExito;

  // ---------- Crear pedido en el servidor ----------
  function comprimirImagen(archivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(archivo);
      const im = new Image();
      im.onload = () => {
        const escala = Math.min(1, 1000 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * escala);
        c.height = Math.round(im.height * escala);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')); };
      im.src = url;
    });
  }

  // Si la sesión se perdió, abre el login de Google y reintenta el pedido solo.
  // El comprobante ya elegido NO se pierde (sigue en el input).
  function pedirLoginYReintentar(auth) {
    finalizando = false;
    el.btnFinalizar.disabled = false;
    if (auth && auth.pedirLogin) {
      auth.pedirLogin(
        () => finalizarPedido(),
        'Tu sesión venció. Inicia sesión con Google para finalizar tu pedido.'
      );
    } else {
      alert('Inicia sesión para finalizar tu pedido.');
    }
  }

  async function finalizarPedido() {
    if (finalizando) return;
    finalizando = true;
    el.btnFinalizar.disabled = true;

    try {
      const auth = window.CachinaAuth;
      if (!auth || !auth.logueado()) {
        pedirLoginYReintentar(auth);
        return;
      }

      const items = (typeof carritoItems !== 'undefined' && Array.isArray(carritoItems)) ? carritoItems : [];
      const sinComp = el.pasoComprobante.classList.contains('sin-comp');
      const archivo = el.inputArchivo.files && el.inputArchivo.files[0];
      const comprobante = (!sinComp && archivo) ? await comprimirImagen(archivo) : null;

      const resp = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token() },
        body: JSON.stringify({
          idFortnite: localStorage.getItem('usuarioLogueado') || '',
          items: items.map(i => ({ nombre: i.nombre, precio: i.precio, cantidad: i.cantidad, imagen: i.imagen })),
          comprobante
        })
      });
      const d = await resp.json().catch(() => ({}));

      if (resp.status === 401) {
        auth.salir();
        pedirLoginYReintentar(auth);
        return;
      }
      if (!resp.ok) throw new Error(d.error || 'No se pudo crear el pedido.');

      window.ticketPedidoActual = d.ticket;
      const urlWA = 'https://wa.me/51969639154?text=' +
        encodeURIComponent(window.construirMensajePedido());
      window.urlWhatsAppPedido = urlWA;

      mostrarExito(d.ticket);
    } catch (e) {
      alert(e.message || 'No se pudo crear el pedido. Intenta de nuevo.');
      finalizando = false;
      el.btnFinalizar.disabled = false;
    }
  }

  el.btnFinalizar.addEventListener('click', () => {
    if (el.btnFinalizar.disabled) return;
    finalizarPedido();
  });
  // "No puedo subir comprobante" lo maneja el script del index
  // (muestra el aviso amarillo). Aquí no hace nada.
})();
