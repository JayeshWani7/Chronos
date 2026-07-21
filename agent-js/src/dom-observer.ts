export interface SerializedNode {
  id: number;
  nodeType: number;
  tagName?: string;
  attributes?: Record<string, string>;
  nodeValue?: string;
  childNodes?: number[];
}

let nextNodeId = 1;

export function getNodeId(node: Node): number {
  const anyNode = node as any;
  if (!anyNode.__chronos_id) {
    anyNode.__chronos_id = nextNodeId++;
  }
  return anyNode.__chronos_id;
}

export function serializeNode(node: Node): SerializedNode {
  const id = getNodeId(node);
  const serialized: SerializedNode = {
    id,
    nodeType: node.nodeType
  };

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    serialized.tagName = el.tagName.toLowerCase();
    serialized.attributes = {};
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      serialized.attributes[attr.name] = attr.value;
    }
    serialized.childNodes = Array.from(el.childNodes)
      .filter(c => c.nodeType === Node.ELEMENT_NODE || c.nodeType === Node.TEXT_NODE)
      .map(child => getNodeId(child));
  } else if (node.nodeType === Node.TEXT_NODE) {
    serialized.nodeValue = node.nodeValue || '';
  }

  return serialized;
}

export function serializeTree(node: Node, accumulated: SerializedNode[] = []): SerializedNode[] {
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
    return accumulated;
  }
  
  const serialized = serializeNode(node);
  accumulated.push(serialized);
  
  if (node.nodeType === Node.ELEMENT_NODE) {
    Array.from(node.childNodes).forEach(child => {
      serializeTree(child, accumulated);
    });
  }
  
  return accumulated;
}

export function initDomObserver(publish: (category: string, type: string, payload: any) => void) {
  // Send initial DOM snapshot
  const initialNodes: SerializedNode[] = [];
  serializeTree(document.documentElement, initialNodes);
  publish('dom', 'snapshot', {
    rootId: getNodeId(document.documentElement),
    nodes: initialNodes
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const payload: any = {
        target: getNodeId(mutation.target)
      };

      if (mutation.type === 'childList') {
        const added: SerializedNode[] = [];
        mutation.addedNodes.forEach(node => {
          serializeTree(node, added);
        });

        const removed: number[] = [];
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            removed.push(getNodeId(node));
          }
        });

        payload.addedNodes = added;
        payload.removedNodes = removed;
        payload.previousSibling = mutation.previousSibling ? getNodeId(mutation.previousSibling) : null;
        payload.nextSibling = mutation.nextSibling ? getNodeId(mutation.nextSibling) : null;
        publish('dom', 'mutation_childList', payload);

      } else if (mutation.type === 'attributes') {
        const attrName = mutation.attributeName || '';
        payload.attributeName = attrName;
        payload.attributeValue = (mutation.target as Element).getAttribute(attrName);
        publish('dom', 'mutation_attributes', payload);

      } else if (mutation.type === 'characterData') {
        payload.nodeValue = mutation.target.nodeValue;
        publish('dom', 'mutation_characterData', payload);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });
}
