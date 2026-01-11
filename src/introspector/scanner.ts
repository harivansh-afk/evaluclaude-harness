import { glob } from 'glob';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileInfo } from './types.js';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '__pycache__/**',
  '*.pyc',
  'dist/**',
  'build/**',
  '.venv/**',
  'venv/**',
  '.env/**',
  'env/**',
  'coverage/**',
  '.next/**',
  '.nuxt/**',
];

export async function scanDirectory(root: string): Promise<FileInfo[]> {
  const patterns = ['**/*.py', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
  
  const files: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: root,
      ignore: IGNORE_PATTERNS,
      nodir: true,
    });
    files.push(...matches);
  }

  const uniqueFiles = [...new Set(files)];
  
  const fileInfos = await Promise.all(
    uniqueFiles.map(async (relativePath) => {
      const fullPath = path.join(root, relativePath);
      try {
        const stats = await fs.stat(fullPath);
        return {
          path: relativePath,
          lang: detectLanguage(relativePath),
          role: detectRole(relativePath),
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        } satisfies FileInfo;
      } catch {
        return null;
      }
    })
  );

  return fileInfos.filter((f): f is FileInfo => f !== null);
}

function detectLanguage(filePath: string): FileInfo['lang'] {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.py':
      return 'python';
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'typescript'; // Treat JS as TS for parsing
    default:
      return 'other';
  }
}

function detectRole(filePath: string): FileInfo['role'] {
  const lowerPath = filePath.toLowerCase();
  const fileName = lowerPath.split('/').pop() || '';
  
  // Test files - be more specific to avoid false positives
  if (
    lowerPath.includes('__tests__') ||
    lowerPath.includes('/tests/') ||
    lowerPath.includes('/test/') ||
    fileName.endsWith('_test.py') ||
    fileName.endsWith('.test.ts') ||
    fileName.endsWith('.test.tsx') ||
    fileName.endsWith('.test.js') ||
    fileName.endsWith('.spec.ts') ||
    fileName.endsWith('.spec.tsx') ||
    fileName.endsWith('.spec.js') ||
    fileName.startsWith('test_')
  ) {
    return 'test';
  }
  
  // Config files
  if (
    lowerPath.includes('config') ||
    lowerPath.includes('settings') ||
    lowerPath.includes('.env') ||
    lowerPath.endsWith('conftest.py') ||
    lowerPath.endsWith('setup.py') ||
    lowerPath.endsWith('pyproject.toml')
  ) {
    return 'config';
  }
  
  // Documentation
  if (
    lowerPath.includes('docs') ||
    lowerPath.includes('doc') ||
    lowerPath.includes('readme')
  ) {
    return 'docs';
  }
  
  return 'source';
}

export async function detectConfig(root: string): Promise<{
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
}> {
  const config: ReturnType<typeof detectConfig> extends Promise<infer T> ? T : never = {};
  
  // Check for Python project
  const hasPyprojectToml = await fileExists(path.join(root, 'pyproject.toml'));
  const hasSetupPy = await fileExists(path.join(root, 'setup.py'));
  const hasRequirementsTxt = await fileExists(path.join(root, 'requirements.txt'));
  
  if (hasPyprojectToml || hasSetupPy || hasRequirementsTxt) {
    let testFramework: 'pytest' | 'unittest' | 'none' = 'none';
    
    // Check for pytest
    if (hasPyprojectToml) {
      try {
        const content = await fs.readFile(path.join(root, 'pyproject.toml'), 'utf-8');
        if (content.includes('pytest')) {
          testFramework = 'pytest';
        }
      } catch {}
    }
    
    if (testFramework === 'none' && hasRequirementsTxt) {
      try {
        const content = await fs.readFile(path.join(root, 'requirements.txt'), 'utf-8');
        if (content.includes('pytest')) {
          testFramework = 'pytest';
        }
      } catch {}
    }
    
    config.python = {
      entryPoints: [],
      testFramework,
      hasTyping: false,
      pyprojectToml: hasPyprojectToml,
      setupPy: hasSetupPy,
    };
  }
  
  // Check for TypeScript/JavaScript project
  const hasPackageJson = await fileExists(path.join(root, 'package.json'));
  const hasTsconfig = await fileExists(path.join(root, 'tsconfig.json'));
  
  if (hasPackageJson || hasTsconfig) {
    let testFramework: 'vitest' | 'jest' | 'none' = 'none';
    
    if (hasPackageJson) {
      try {
        const content = await fs.readFile(path.join(root, 'package.json'), 'utf-8');
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        if ('vitest' in allDeps) {
          testFramework = 'vitest';
        } else if ('jest' in allDeps) {
          testFramework = 'jest';
        }
      } catch {}
    }
    
    config.typescript = {
      entryPoints: [],
      testFramework,
      hasTypes: hasTsconfig,
      packageJson: hasPackageJson,
      tsconfig: hasTsconfig,
    };
  }
  
  return config;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
