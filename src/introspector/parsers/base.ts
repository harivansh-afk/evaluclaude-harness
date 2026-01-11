import type { ModuleInfo, ExportInfo } from '../types.js';

export interface ParserResult {
  exports: ExportInfo[];
  imports: string[];
}

export abstract class BaseParser {
  abstract readonly language: string;
  
  abstract parse(source: string, filePath: string): ModuleInfo;
  
  protected getText(source: string, startIndex: number, endIndex: number): string {
    return source.slice(startIndex, endIndex);
  }
  
  protected calculateComplexity(exportCount: number): ModuleInfo['complexity'] {
    if (exportCount <= 5) return 'low';
    if (exportCount <= 15) return 'medium';
    return 'high';
  }
  
  protected extractFirstLineOfDocstring(docstring: string | undefined): string | undefined {
    if (!docstring) return undefined;
    const trimmed = docstring.trim();
    const firstLine = trimmed.split('\n')[0];
    return firstLine.replace(/^["']{1,3}|["']{1,3}$/g, '').trim() || undefined;
  }
}
