import { getNodeId } from './dom-observer';

export function initInputObserver(publish: (category: string, type: string, payload: any) => void) {
  // 1. Capture click events
  window.addEventListener('click', (e) => {
    try {
      publish('input', 'click', {
        target: e.target ? getNodeId(e.target as Node) : null,
        clientX: e.clientX,
        clientY: e.clientY
      });
    } catch (err) {}
  }, { capture: true, passive: true });

  // 2. Capture keydown events
  window.addEventListener('keydown', (e) => {
    try {
      publish('input', 'keydown', {
        target: e.target ? getNodeId(e.target as Node) : null,
        key: e.key,
        code: e.code
      });
    } catch (err) {}
  }, { capture: true, passive: true });

  // 3. Capture scroll events (debounced)
  let scrollTimeout: any = null;
  window.addEventListener('scroll', (e) => {
    try {
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      scrollTimeout = setTimeout(() => {
        publish('input', 'scroll', {
          target: e.target ? getNodeId(e.target as Node) : null,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        });
      }, 150);
    } catch (err) {}
  }, { capture: true, passive: true });
}
