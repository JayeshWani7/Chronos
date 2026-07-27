import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['1'])); // Expand html by default
  const [searchQuery, setSearchQuery] = useState('');

  // PERFORMANCE OPTIMIZATION: Memoize DOM tree structure based strictly on HTML & expanded set
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
    if (node.nodeType === 3 && !node.nodeValue.trim()) return;

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

  // Filter items matching query
  const queryLower = searchQuery.toLowerCase().trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* DOM Search Bar */}
      <div className="drawer-filter-bar">
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--color-muted)' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search tags, classes, IDs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '26px' }}
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="dom-tree" style={{ flex: 1, overflow: 'auto' }}>
        {visibleItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-desc">No DOM tree structure loaded.</div>
          </div>
        ) : (
          visibleItems.map(item => {
            const isSelected = selectedNodeId === item.id;
            const isHovered = hoveredNodeId === item.id;

            // Search matching check
            const matchesQuery = queryLower && (
              item.tagName.includes(queryLower) ||
              (item.nodeValue && item.nodeValue.toLowerCase().includes(queryLower)) ||
              Object.entries(item.attributes).some(([k, v]) => k.includes(queryLower) || v.toLowerCase().includes(queryLower))
            );
            
            return (
              <div
                key={item.id}
                className={`dom-node-row ${isSelected ? 'selected' : ''} ${matchesQuery ? 'highlighted' : ''}`}
                style={{
                  paddingLeft: `${Math.max(item.depth * 14, 8)}px`,
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
    </div>
  );
};
