# 0. Tree-Sitter Introspector - System Design

> **Priority**: 🔴 FOUNDATIONAL — Build this first  
> **Complexity**: Medium  
> **Effort Estimate**: 6-10 hours

---

## Overview

The Tree-Sitter Introspector parses Python and TypeScript codebases locally using tree-sitter AST parsing, extracting structured metadata (functions, classes, imports) **without** sending raw code to Claude. This saves tokens, is faster, and produces reliable structured data.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Introspector Module                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ File Scanner │───▶│ Tree-Sitter  │───▶│  Summarizer  │      │
│  │  (glob/git)  │    │   Parsers    │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│    File list +        Per-file AST        RepoSummary          │
│    metadata           extracts            JSON                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Types

```typescript
interface RepoSummary {
  languages: ('python' | 'typescript')[];
  root: string;
  analyzedAt: string;
  files: FileInfo[];
  modules: ModuleInfo[];
  config: ConfigInfo;
  git?: GitInfo;
}

interface ModuleInfo {
  path: string;
  exports: ExportInfo[];
  imports: string[];
  complexity: 'low' | 'medium' | 'high';
}

interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'constant' | 'type';
  signature?: string;
  docstring?: string;
  lineNumber: number;
  isAsync?: boolean;
}
```

---

## Key Implementation Details

### Tree-Sitter Queries (Python)

```typescript
const FUNCTION_QUERY = `
  (function_definition
    name: (identifier) @name
    parameters: (parameters) @params
    return_type: (type)? @return_type
  ) @func
`;

const CLASS_QUERY = `
  (class_definition
    name: (identifier) @name
    body: (block) @body
  ) @class
`;
```

### Git-Aware Incremental

```typescript
async function getChangedFiles(since: string): Promise<string[]> {
  const { stdout } = await exec(`git diff --name-only ${since}`);
  return stdout.split('\n').filter(f => /\.(py|ts|tsx)$/.test(f));
}
```

---

## File Structure

```
src/introspector/
├── index.ts              # Main entry point
├── types.ts              # TypeScript interfaces
├── scanner.ts            # File discovery
├── parsers/
│   ├── python.ts         # Python tree-sitter queries
│   └── typescript.ts     # TS tree-sitter queries
├── git.ts                # Git integration
└── summarizer.ts         # Combine into RepoSummary
```

---

## Dependencies

```json
{
  "tree-sitter": "^0.21.0",
  "tree-sitter-python": "^0.21.0",
  "tree-sitter-typescript": "^0.21.0",
  "glob": "^10.3.0"
}
```

---

## Success Criteria

- [ ] Parses Python files (functions, classes, imports)
- [ ] Parses TypeScript files (functions, classes, imports)
- [ ] Handles 1000+ file repos in <10 seconds
- [ ] Incremental mode only parses changed files
- [ ] Gracefully handles syntax errors
