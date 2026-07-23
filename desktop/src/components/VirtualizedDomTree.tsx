import React, { useState, useMemo } from 'react';

interface FlattenedItem {
  id: string;
  tagName: string;
  attributes: Record<string, string>;
  nodeType: number;
  nodeValue?: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  refNode: any;
}

interface VirtualizedDomTreeProps {
  html: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  hoveredNodeId: string | null;
  onHoverNode: (id: string | null) => void;
}

export const VirtualizedDomTree: React.FC<VirtualizedDomTreeProps> = ({
  html,
  selectedNodeId,
  onSelectNode,
  hoveredNodeId,
  onHoverNode,
}) => {
  // Store expanded node IDs in a set
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['1'])); // Expand html (ID 1) by default

  const visibleItems = useMemo(() => {
    if (!html) return [];
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const root = doc.documentElement;
      
      const list: FlattenedItem[] = [];
      flatten(root, 0, list, expandedNodes);
      return list;
    } catch (e) {
      console.error('Failed to parse DOM tree:', e);
      return [];
    }
  }, [html, expandedNodes]);

  function flatten(node: any, depth: number, result: FlattenedItem[], expandedSet: Set<string>) {
    if (node.nodeType !== 1 && node.nodeType !== 3) return;
    if (node.nodeType === 3 && !node.nodeValue.trim()) return; // skip empty text whitespace

    // script/style tag contents shouldn't render text nodes inside DOM tree node preview
    if (node.parentNode && (node.parentNode.tagName === 'SCRIPT' || node.parentNode.tagName === 'STYLE')) {
      return;
    }

    const id = node.nodeType === 1 ? node.getAttribute('data-chronos-id') || '' : 'text-' + Math.random();
    const hasChildren = node.nodeType === 1 && Array.from(node.childNodes).some((c: any) => {
      if (c.nodeType === 1) return true;
      if (c.nodeType === 3 && c.nodeValue.trim()) {
        const pTag = c.parentNode?.tagName;
        return pTag !== 'SCRIPT' && pTag !== 'STYLE';
      }
      return false;
    });
    
    const isExpanded = expandedSet.has(id);

    const attributes: Record<string, string> = {};
    if (node.nodeType === 1) {
      Array.from(node.attributes).forEach((attr: any) => {
        if (attr.name !== 'data-chronos-id') {
          attributes[attr.name] = attr.value;
        }
      });
    }

    result.push({
      id,
      tagName: node.nodeType === 1 ? node.tagName.toLowerCase() : '',
      attributes,
      nodeType: node.nodeType,
      nodeValue: node.nodeType === 3 ? node.nodeValue.trim() : '',
      depth,
      hasChildren,
      isExpanded,
      refNode: node
    });

    if (node.nodeType === 1 && hasChildren && isExpanded) {
      Array.from(node.childNodes).forEach((child: any) => {
        flatten(child, depth + 1, result, expandedSet);
      });
    }
  }

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="dom-tree">
      {visibleItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-desc">No DOM tree structure loaded.</div>
        </div>
      ) : (
        visibleItems.map(item => {
          const isSelected = selectedNodeId === item.id;
          const isHovered = hoveredNodeId === item.id;
          
          return (
            <div
              key={item.id}
              className={`dom-node-row ${isSelected ? 'selected' : ''}`}
              style={{
                paddingLeft: `${item.depth * 14}px`,
                backgroundColor: isHovered ? 'var(--bg-tertiary)' : undefined,
              }}
              onClick={() => onSelectNode(item.id)}
              onMouseEnter={() => onHoverNode(item.id)}
              onMouseLeave={() => onHoverNode(null)}
            >
              {item.hasChildren ? (
                <span
                  className="node-toggle-btn"
                  onClick={(e) => toggleExpand(item.id, e)}
                >
                  {item.isExpanded ? '▼' : '▶'}
                </span>
              ) : (
                <span className="node-toggle-btn" style={{ opacity: 0 }}>•</span>
              )}

              {item.nodeType === 1 ? (
                <>
                  <span className="node-tag">&lt;{item.tagName}</span>
                  {Object.entries(item.attributes).map(([key, val]) => (
                    <span key={key}>
                      <span className="node-attr-name"> {key}</span>
                      <span className="node-attr-val">="{val}"</span>
                    </span>
                  ))}
                  <span className="node-tag">&gt;</span>
                  {!item.isExpanded && item.hasChildren && (
                    <span style={{ color: 'var(--color-muted)' }}>...</span>
                  )}
                  {!item.isExpanded && item.hasChildren && (
                    <span className="node-tag">&lt;/{item.tagName}&gt;</span>
                  )}
                </>
              ) : (
                <span className="node-text">"{item.nodeValue}"</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
