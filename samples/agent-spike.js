(function() {
  window.chronos_mutations = [];
  let nextId = 1;

  function serializeNode(node) {
    if (!node) return null;
    if (node.__chronos_id) return node.__chronos_id;
    
    let id = nextId++;
    node.__chronos_id = id;

    let serialized = {
      id: id,
      nodeType: node.nodeType,
    };

    if (node.nodeType === Node.ELEMENT_NODE) {
      serialized.tagName = node.tagName.toLowerCase();
      serialized.attributes = {};
      for (let i = 0; i < node.attributes.length; i++) {
        let attr = node.attributes[i];
        serialized.attributes[attr.name] = attr.value;
      }
      serialized.childNodes = Array.from(node.childNodes)
        .filter(c => c.nodeType === Node.ELEMENT_NODE || c.nodeType === Node.TEXT_NODE)
        .map(child => serializeNode(child));
    } else if (node.nodeType === Node.TEXT_NODE) {
      serialized.nodeValue = node.nodeValue;
    }

    return serialized;
  }

  function init() {
    if (window.__chronos_initialized) return;
    window.__chronos_initialized = true;

    // Serialize initial DOM
    window.chronos_initial_dom = serializeNode(document.documentElement);

    // Set up MutationObserver to track deltas
    const observer = new MutationObserver((mutations) => {
      for (let mutation of mutations) {
        let serializedMutation = {
          type: mutation.type,
          target: mutation.target.__chronos_id || serializeNode(mutation.target),
          timestamp: performance.now(),
        };

        if (mutation.type === 'childList') {
          serializedMutation.addedNodes = Array.from(mutation.addedNodes)
            .filter(n => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE)
            .map(node => serializeNode(node));
          
          serializedMutation.removedNodes = Array.from(mutation.removedNodes)
            .filter(n => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE)
            .map(node => node.__chronos_id || serializeNode(node));

          serializedMutation.previousSibling = mutation.previousSibling ? (mutation.previousSibling.__chronos_id || null) : null;
          serializedMutation.nextSibling = mutation.nextSibling ? (mutation.nextSibling.__chronos_id || null) : null;
        } else if (mutation.type === 'attributes') {
          serializedMutation.attributeName = mutation.attributeName;
          serializedMutation.attributeValue = mutation.target.getAttribute(mutation.attributeName);
        } else if (mutation.type === 'characterData') {
          serializedMutation.nodeValue = mutation.target.nodeValue;
        }
        window.chronos_mutations.push(serializedMutation);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
