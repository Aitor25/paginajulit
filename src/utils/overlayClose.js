// Props para el fondo oscuro de una ventana modal: cerrar al pulsar fuera.
//
// Antes bastaba con que el "click" acabase en el fondo, y el navegador lanza
// ese click en el fondo también cuando el botón se pulsa DENTRO de la ventana
// (al seleccionar texto en un campo, o con un pequeño movimiento del ratón)
// y se suelta fuera; o al pulsar la barra de desplazamiento del fondo. La
// ventana se cerraba "sola" perdiendo lo escrito. Ahora solo se cierra si el
// botón se pulsó y se soltó sobre el propio fondo, fuera de su barra.
export function overlayCloseProps(onClose) {
  return {
    onMouseDown: e => {
      const el = e.currentTarget;
      const onScrollbar = e.clientX >= el.getBoundingClientRect().left + el.clientWidth;
      el.dataset.pressedOnOverlay = e.target === el && !onScrollbar ? '1' : '';
    },
    onClick: e => {
      const el = e.currentTarget;
      const pressedOnOverlay = el.dataset.pressedOnOverlay === '1';
      el.dataset.pressedOnOverlay = '';
      if (e.target === el && pressedOnOverlay) onClose();
    }
  };
}
