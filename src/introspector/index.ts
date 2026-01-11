export { analyze, analyzeIncremental } from './summarizer.js';
export { scanDirectory, detectConfig } from './scanner.js';
export { getGitInfo, getChangedFiles, getCurrentCommit, isGitRepo, getRecentCommits, getFileHistory } from './git.js';
export { buildFileTree, treeToString, getTreeStats } from './tree.js';
export { PythonParser } from './parsers/python.js';
export { TypeScriptParser } from './parsers/typescript.js';

export type {
  RepoSummary,
  FileInfo,
  ModuleInfo,
  ExportInfo,
  ConfigInfo,
  GitInfo,
  CommitInfo,
  FileHistoryInfo,
  FileTreeNode,
  Language,
} from './types.js';

import { analyze as analyzeRepo } from './summarizer.js';

export async function introspect(repoPath: string): Promise<import('./types.js').RepoSummary> {
  return analyzeRepo({ root: repoPath });
}
