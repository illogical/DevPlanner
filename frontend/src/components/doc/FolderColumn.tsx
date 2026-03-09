import { useState, useEffect, useMemo } from 'react';
import { cn } from '../../utils/cn';
import type { TreeFolder } from '../../store/types';

interface FolderColumnProps {
  folders: TreeFolder[];
  activePath: string;
  onSelect: (folder: TreeFolder) => void;
}

interface TreeNode {
  folder: TreeFolder;
  children: TreeNode[];
}

export function FolderColumn({ folders, activePath, onSelect }: FolderColumnProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand ancestors when activePath changes
  useEffect(() => {
    if (!activePath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let current = activePath;
      let changed = false;
      while (current.includes('/')) {
        current = current.split('/').slice(0, -1).join('/');
        if (!next.has(current)) {
          next.add(current);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activePath]);

  // Build tree
  const treeNodes = useMemo(() => {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    folders.forEach(f => {
      nodeMap.set(f.path, { folder: f, children: [] });
    });

    folders.forEach(f => {
      const node = nodeMap.get(f.path)!;
      if (f.parentPath && nodeMap.has(f.parentPath)) {
        nodeMap.get(f.parentPath)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort nodes alphabetically
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
      nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }, [folders]);

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const f = node.folder;
    const isActive = f.path === activePath;
    const isExpanded = expanded.has(f.path);
    const hasChildren = node.children.length > 0;

    return (
      <div key={f.path}>
        <button
          onClick={() => onSelect(f)}
          className={cn(
            'w-full text-left py-1.5 flex items-center cursor-pointer transition-colors border-l-2',
            isActive ? 'bg-gray-800/80 text-gray-100 border-amber-500' : 'text-gray-300 hover:bg-gray-800/50 border-transparent'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '12px' }}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <div
              className={cn("w-4 h-4 flex items-center justify-center shrink-0", hasChildren ? "cursor-pointer text-gray-400 hover:text-gray-200" : "opacity-0")}
              onClick={hasChildren ? (e) => toggleExpand(f.path, e) : undefined}
            >
              {hasChildren && (
                <svg
                  className={cn("w-3.5 h-3.5 transition-transform", isExpanded ? "rotate-90" : "")}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>

            <svg className="w-4 h-4 text-blue-400/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>

            <span className={cn("text-sm truncate font-medium", isActive && "text-amber-500/90")}>{f.name || '/'}</span>
          </div>
          {f.count > 0 && (
            <span className="text-[10px] text-gray-500 bg-gray-800/80 rounded px-1.5 py-0.5 shrink-0 ml-2 font-mono">
              {f.count}
            </span>
          )}
        </button>
        {isExpanded && hasChildren && (
          <div>
            {node.children.map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        No folders
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full py-2">
      {treeNodes.map(n => renderNode(n, 0))}
    </div>
  );
}
