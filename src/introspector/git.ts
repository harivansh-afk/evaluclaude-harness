import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitInfo, CommitInfo, FileHistoryInfo } from './types.js';

const execAsync = promisify(exec);
const MAX_COMMITS = 20;
const MAX_FILE_HISTORY = 50;

export async function getGitInfo(root: string, lastCommit?: string): Promise<GitInfo | undefined> {
  try {
    // Check if it's a git repo
    await execAsync('git rev-parse --git-dir', { cwd: root });
  } catch {
    return undefined;
  }

  try {
    const [currentCommitResult, branchResult] = await Promise.all([
      execAsync('git rev-parse HEAD', { cwd: root }),
      execAsync('git branch --show-current', { cwd: root }),
    ]);

    const currentCommit = currentCommitResult.stdout.trim();
    const branch = branchResult.stdout.trim() || 'HEAD';

    let changedSince: string[] = [];
    if (lastCommit && lastCommit !== currentCommit) {
      changedSince = await getChangedFiles(root, lastCommit);
    }

    // Fetch recent commits
    const recentCommits = await getRecentCommits(root);
    
    // Fetch file history (most frequently changed files)
    const fileHistory = await getFileHistory(root);

    return {
      currentCommit,
      lastAnalyzedCommit: lastCommit || currentCommit,
      changedSince,
      branch,
      recentCommits,
      fileHistory,
    };
  } catch {
    return undefined;
  }
}

export async function getChangedFiles(root: string, since: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`git diff --name-only ${since}`, { cwd: root });
    return stdout
      .split('\n')
      .filter(f => f && isSourceFile(f));
  } catch {
    return [];
  }
}

export async function getCurrentCommit(root: string): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: root });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function isSourceFile(filePath: string): boolean {
  return /\.(py|ts|tsx|js|jsx)$/.test(filePath);
}

export async function getRecentCommits(root: string, limit: number = MAX_COMMITS): Promise<CommitInfo[]> {
  try {
    // Format: hash|short|author|date|message|filesChanged
    const { stdout } = await execAsync(
      `git log -${limit} --pretty=format:"%H|%h|%an|%aI|%s" --shortstat`,
      { cwd: root, maxBuffer: 1024 * 1024 }
    );

    const commits: CommitInfo[] = [];
    const lines = stdout.split('\n');
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]?.trim();
      if (!line) {
        i++;
        continue;
      }

      const parts = line.split('|');
      if (parts.length >= 5) {
        // Parse the commit line
        const [hash, shortHash, author, date, ...messageParts] = parts;
        const message = messageParts.join('|'); // In case message contains |
        
        // Look for stats line (next non-empty line)
        let filesChanged = 0;
        if (i + 1 < lines.length) {
          const statsLine = lines[i + 1]?.trim();
          if (statsLine) {
            const match = statsLine.match(/(\d+) files? changed/);
            if (match) {
              filesChanged = parseInt(match[1], 10);
              i++; // Skip stats line
            }
          }
        }

        commits.push({
          hash,
          shortHash,
          author,
          date,
          message,
          filesChanged,
        });
      }
      i++;
    }

    return commits;
  } catch {
    return [];
  }
}

export async function getFileHistory(root: string, limit: number = MAX_FILE_HISTORY): Promise<FileHistoryInfo[]> {
  try {
    // Get the most frequently modified source files
    const { stdout } = await execAsync(
      `git log --pretty=format: --name-only | grep -E '\\.(py|ts|tsx|js|jsx)$' | sort | uniq -c | sort -rn | head -${limit}`,
      { cwd: root, maxBuffer: 1024 * 1024, shell: '/bin/bash' }
    );

    const files: FileHistoryInfo[] = [];
    
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const match = trimmed.match(/^\s*(\d+)\s+(.+)$/);
      if (match) {
        const commitCount = parseInt(match[1], 10);
        const filePath = match[2];
        
        // Get contributors for this file
        const contributors = await getFileContributors(root, filePath);
        const lastModified = await getFileLastModified(root, filePath);
        
        files.push({
          path: filePath,
          commitCount,
          lastModified,
          contributors,
        });
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function getFileContributors(root: string, filePath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `git log --pretty=format:"%an" -- "${filePath}" | sort -u | head -5`,
      { cwd: root, shell: '/bin/bash' }
    );
    return stdout.split('\n').filter(s => s.trim()).slice(0, 5);
  } catch {
    return [];
  }
}

async function getFileLastModified(root: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git log -1 --pretty=format:"%aI" -- "${filePath}"`,
      { cwd: root }
    );
    return stdout.trim();
  } catch {
    return '';
  }
}
