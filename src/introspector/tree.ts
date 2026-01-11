import type { FileInfo, FileTreeNode } from './types.js';

export function buildFileTree(files: FileInfo[], rootName: string = '.'): FileTreeNode {
  const root: FileTreeNode = {
    name: rootName,
    path: '',
    type: 'directory',
    children: [],
  };

  // Build a map for quick lookup
  const nodeMap = new Map<string, FileTreeNode>();
  nodeMap.set('', root);

  // Sort files to ensure parents are created before children
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let currentPath = '';

    // Create all parent directories
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

      if (!nodeMap.has(currentPath)) {
        const dirNode: FileTreeNode = {
          name: parts[i],
          path: currentPath,
          type: 'directory',
          children: [],
        };
        nodeMap.set(currentPath, dirNode);

        // Add to parent
        const parent = nodeMap.get(parentPath);
        if (parent && parent.children) {
          parent.children.push(dirNode);
        }
      }
    }

    // Create the file node
    const fileName = parts[parts.length - 1];
    const fileNode: FileTreeNode = {
      name: fileName,
      path: file.path,
      type: 'file',
      lang: file.lang,
      role: file.role,
    };

    // Add to parent directory
    const parentPath = parts.slice(0, -1).join('/');
    const parent = nodeMap.get(parentPath);
    if (parent && parent.children) {
      parent.children.push(fileNode);
    }
  }

  // Sort children alphabetically (directories first)
  sortTreeRecursive(root);

  return root;
}

function sortTreeRecursive(node: FileTreeNode): void {
  if (node.children) {
    node.children.sort((a, b) => {
      // Directories first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const child of node.children) {
      sortTreeRecursive(child);
    }
  }
}

export function treeToString(node: FileTreeNode, prefix: string = '', isLast: boolean = true): string {
  const lines: string[] = [];
  
  const connector = isLast ? '└── ' : '├── ';
  const extension = isLast ? '    ' : '│   ';
  
  if (node.path === '') {
    // Root node
    lines.push(node.name);
  } else {
    const icon = node.type === 'directory' ? '📁' : getFileIcon(node.lang, node.role);
    lines.push(`${prefix}${connector}${icon} ${node.name}`);
  }

  if (node.children) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childIsLast = i === children.length - 1;
      const newPrefix = node.path === '' ? '' : prefix + extension;
      lines.push(treeToString(child, newPrefix, childIsLast));
    }
  }

  return lines.join('\n');
}

function getFileIcon(lang?: string, role?: string): string {
  if (role === 'test') return '🧪';
  if (role === 'config') return '⚙️';
  if (role === 'docs') return '📄';
  
  switch (lang) {
    case 'python': return '🐍';
    case 'typescript': return '📘';
    default: return '📄';
  }
}

export function getTreeStats(node: FileTreeNode): {
  directories: number;
  files: number;
  byLang: Record<string, number>;
  byRole: Record<string, number>;
} {
  const stats = {
    directories: 0,
    files: 0,
    byLang: {} as Record<string, number>,
    byRole: {} as Record<string, number>,
  };

  function traverse(n: FileTreeNode): void {
    if (n.type === 'directory') {
      stats.directories++;
      if (n.children) {
        for (const child of n.children) {
          traverse(child);
        }
      }
    } else {
      stats.files++;
      if (n.lang) {
        stats.byLang[n.lang] = (stats.byLang[n.lang] || 0) + 1;
      }
      if (n.role) {
        stats.byRole[n.role] = (stats.byRole[n.role] || 0) + 1;
      }
    }
  }

  traverse(node);
  return stats;
}
