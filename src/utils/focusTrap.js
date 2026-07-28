export function createFocusTrap(modalElement, triggerElement = null) {
  if (!modalElement) return () => {};

  const focusableElementsString = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  let focusableElements = modalElement.querySelectorAll(focusableElementsString);
  focusableElements = Array.from(focusableElements).filter(el => !el.disabled);
  
  const firstTabStop = focusableElements[0];
  const lastTabStop = focusableElements[focusableElements.length - 1];

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstTabStop) {
          e.preventDefault();
          lastTabStop.focus();
        }
      } else {
        if (document.activeElement === lastTabStop) {
          e.preventDefault();
          firstTabStop.focus();
        }
      }
    }
  };

  modalElement.addEventListener('keydown', handleKeyDown);
  if (firstTabStop) firstTabStop.focus();

  return () => {
    modalElement.removeEventListener('keydown', handleKeyDown);
    if (triggerElement && typeof triggerElement.focus === 'function') {
      triggerElement.focus();
    }
  };
}
