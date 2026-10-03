// ==========================================
// MODAL "CONFIRMAR PEDIDO"
// Se carga DESPUÉS de script.js. No modifica script.js: observa el
// modal #modal-pago y, cada vez que se abre, lo rellena con el
// carrito real (carritoItems) y lo deja en el primer paso.
// Reutiliza de script.js: carritoItems, enviarPedidoWhatsApp(),
// cerrarModalPago() y el zoom del QR (.qr-imagen / .qr-ayuda).
// ==========================================
(function () {
  const modal = document.getElementById('modal-pago');
  if (!modal) return;

  const $ = (id) => document.getElementById(id);

  const el = {
    listaPedido: $('mc-lista-pedido'),
    total: $('monto-total-pago'),
    usuarioId: $('mc-usuario-id'),
    mensaje: $('mc-mensaje'),
    pasoPedido: $('mc-paso-pedido'),
    pasoComprobante: $('mc-paso-comprobante'),
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
    btnFinalizar: $('mc-btn-finalizar'),
    btnSinComprobante: $('mc-btn-sin-comprobante')
  };

  let urlPreview = null;

  // ---------- Pasos ----------
  function mostrarPaso(paso) {
    el.pasoPedido.classList.toggle('oculto', paso !== 'pedido');
    el.pasoComprobante.classList.toggle('oculto', paso !== 'comprobante');
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
  }

  // ---------- Rellenar con el carrito ----------
  function pintarPedido() {
    const idCliente = localStorage.getItem('usuarioLogueado') || '—';
    el.usuarioId.textContent = idCliente;

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

  function finalizarPedido() {
    // Abre WhatsApp con el resumen del pedido (función de script.js).
    // Nota: wa.me no permite adjuntar la imagen automáticamente; el
    // cliente la adjunta en el chat de WhatsApp.
    if (typeof enviarPedidoWhatsApp === 'function') enviarPedidoWhatsApp();
    if (typeof cerrarModalPago === 'function') cerrarModalPago();
  }

  el.btnFinalizar.addEventListener('click', () => {
    if (el.btnFinalizar.disabled) return;
    finalizarPedido();
  });

  el.btnSinComprobante.addEventListener('click', finalizarPedido);
})();
