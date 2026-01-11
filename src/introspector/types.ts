export interface RepoSummary {
  languages: ('python' | 'typescript')[];
  root: string;
  analyzedAt: string;
  files: FileInfo[];
  modules: ModuleInfo[];
  config: ConfigInfo;
  git?: GitInfo;
  tree?: FileTreeNode;
}

export interface FileInfo {
  path: string;
  lang: 'python' | 'typescript' | 'other';
  role: 'source' | 'test' | 'config' | 'docs';
  size: number;
  lastModified: string;
}

export interface ModuleInfo {
  path: string;
  exports: ExportInfo[];
  imports: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'constant' | 'type';
  signature?: string;
  docstring?: string;
  lineNumber: number;
  isAsync?: boolean;
  isExported?: boolean;
}

export interface ConfigInfo {
  python?: {
    entryPoints: string[];
    testFramework: 'pytest' | 'unittest' | 'none';
    hasTyping: boolean;
    pyprojectToml: boolean;
    setupPy: boolean;
  };
  typescript?: {
    entryPoints: string[];
    testFramework: 'vitest' | 'jest' | 'none';
    hasTypes: boolean;
    packageJson: boolean;
    tsconfig: boolean;
  };
}

export interface GitInfo {
  lastAnalyzedCommit: string;
  currentCommit: string;
  changedSince: string[];
  branch: string;
  recentCommits?: CommitInfo[];
  fileHistory?: FileHistoryInfo[];
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  filesChanged: number;
}

export interface FileHistoryInfo {
  path: string;
  commitCount: number;
  lastModified: string;
  contributors: string[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  lang?: 'python' | 'typescript' | 'other';
  role?: 'source' | 'test' | 'config' | 'docs';
}

export type Language = 'python' | 'typescript';
