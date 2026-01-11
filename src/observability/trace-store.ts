import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { EvalTrace, TraceListItem } from './types.js';

const DEFAULT_TRACES_DIR = '.evaluclaude/traces';

export class TraceStore {
  private tracesDir: string;

  constructor(tracesDir: string = DEFAULT_TRACES_DIR) {
    this.tracesDir = tracesDir;
  }

  async save(trace: EvalTrace): Promise<string> {
    await mkdir(this.tracesDir, { recursive: true });
    const filePath = join(this.tracesDir, `${trace.id}.json`);
    await writeFile(filePath, JSON.stringify(trace, null, 2));
    return filePath;
  }

  async load(traceId: string): Promise<EvalTrace | null> {
    const filePath = join(this.tracesDir, `${traceId}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as EvalTrace;
  }

  async list(evalId?: string): Promise<TraceListItem[]> {
    if (!existsSync(this.tracesDir)) {
      return [];
    }

    const files = await readdir(this.tracesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const traces: TraceListItem[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(this.tracesDir, file), 'utf-8');
        const trace = JSON.parse(content) as EvalTrace;

        if (evalId && trace.evalId !== evalId) {
          continue;
        }

        traces.push({
          id: trace.id,
          evalId: trace.evalId,
          startedAt: trace.startedAt,
          status: trace.status,
          duration: trace.duration,
          testsPassed: trace.execution.testsPassed,
          testsFailed: trace.execution.testsFailed,
        });
      } catch (e) {
      }
    }

    return traces.sort((a, b) => 
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  async getLatest(): Promise<EvalTrace | null> {
    const traces = await this.list();
    if (traces.length === 0) {
      return null;
    }
    return this.load(traces[0].id);
  }

  async delete(traceId: string): Promise<boolean> {
    const filePath = join(this.tracesDir, `${traceId}.json`);
    if (!existsSync(filePath)) {
      return false;
    }
    const { unlink } = await import('fs/promises');
    await unlink(filePath);
    return true;
  }

  async cleanup(keepCount: number = 50): Promise<number> {
    const traces = await this.list();
    const toDelete = traces.slice(keepCount);
    
    let deleted = 0;
    for (const trace of toDelete) {
      if (await this.delete(trace.id)) {
        deleted++;
      }
    }
    
    return deleted;
  }
}

export const traceStore = new TraceStore();

export async function saveTrace(trace: EvalTrace): Promise<string> {
  return traceStore.save(trace);
}

export async function loadTrace(traceId: string): Promise<EvalTrace | null> {
  return traceStore.load(traceId);
}

export async function listTraces(evalId?: string): Promise<TraceListItem[]> {
  return traceStore.list(evalId);
}

export async function getLatestTrace(): Promise<EvalTrace | null> {
  return traceStore.getLatest();
}
