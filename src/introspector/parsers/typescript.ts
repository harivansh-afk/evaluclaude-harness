import Parser from 'tree-sitter';
import TypeScriptLang from 'tree-sitter-typescript';
import { BaseParser } from './base.js';
import type { ModuleInfo, ExportInfo } from '../types.js';

const { typescript: TypeScript, tsx: TSX } = TypeScriptLang;

export class TypeScriptParser extends BaseParser {
  readonly language = 'typescript';
  
  private tsParser: Parser;
  private tsxParser: Parser;

  constructor() {
    super();
    this.tsParser = new Parser();
    this.tsParser.setLanguage(TypeScript);
    
    this.tsxParser = new Parser();
    this.tsxParser.setLanguage(TSX);
  }

  parse(source: string, filePath: string): ModuleInfo {
    const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const parser = isTsx ? this.tsxParser : this.tsParser;
    
    let tree: Parser.Tree;
    try {
      tree = parser.parse(source);
    } catch (error) {
      return this.createEmptyModule(filePath, `Parse error: ${error}`);
    }
    
    const rootNode = tree.rootNode;
    
    if (rootNode.hasError) {
      const errorCount = this.countErrors(rootNode);
      if (errorCount > 10) {
        return this.createEmptyModule(filePath, `Too many syntax errors (${errorCount})`);
      }
    }

    const exports: ExportInfo[] = [];
    const imports: string[] = [];

    try {
      this.walkNode(rootNode, source, exports, imports, false, 0);
    } catch (error) {
      return {
        path: filePath,
        exports,
        imports: [...new Set(imports)],
        complexity: this.calculateComplexity(exports.length),
      };
    }

    return {
      path: filePath,
      exports,
      imports: [...new Set(imports)],
      complexity: this.calculateComplexity(exports.length),
    };
  }

  private createEmptyModule(path: string, reason: string): ModuleInfo {
    return {
      path,
      exports: [],
      imports: [],
      complexity: 'low',
    };
  }

  private countErrors(node: Parser.SyntaxNode): number {
    let count = node.type === 'ERROR' ? 1 : 0;
    for (const child of node.children) {
      count += this.countErrors(child);
    }
    return count;
  }

  private walkNode(
    node: Parser.SyntaxNode,
    source: string,
    exports: ExportInfo[],
    imports: string[],
    isExported: boolean,
    depth: number
  ): void {
    if (depth > 50) return;
    if (node.type === 'ERROR') return;

    switch (node.type) {
      case 'function_declaration':
        exports.push(this.extractFunction(node, source, isExported));
        break;

      case 'class_declaration':
        exports.push(this.extractClass(node, source, isExported));
        break;

      case 'lexical_declaration':
      case 'variable_declaration':
        exports.push(...this.extractVariables(node, source, isExported));
        break;

      case 'type_alias_declaration':
      case 'interface_declaration':
        exports.push(this.extractTypeDefinition(node, source, isExported));
        break;

      case 'export_statement':
        for (const child of node.children) {
          this.walkNode(child, source, exports, imports, true, depth + 1);
        }
        break;

      case 'import_statement':
        imports.push(...this.extractImport(node, source));
        break;

      case 'program':
        for (const child of node.children) {
          this.walkNode(child, source, exports, imports, false, depth + 1);
        }
        break;

      case 'export_clause':
        for (const child of node.children) {
          if (child.type === 'export_specifier') {
            const nameNode = child.childForFieldName('name') || child.firstChild;
            if (nameNode && nameNode.type === 'identifier') {
              exports.push({
                name: this.getText(source, nameNode.startIndex, nameNode.endIndex),
                kind: 'constant',
                lineNumber: child.startPosition.row + 1,
                isExported: true,
              });
            }
          }
        }
        break;
    }
  }

  private extractFunction(node: Parser.SyntaxNode, source: string, isExported: boolean): ExportInfo {
    const nameNode = node.childForFieldName('name');
    const paramsNode = node.childForFieldName('parameters');
    const returnTypeNode = node.childForFieldName('return_type');

    const name = nameNode ? this.getText(source, nameNode.startIndex, nameNode.endIndex) : 'unknown';
    
    let signature = '';
    if (paramsNode) {
      signature = this.getText(source, paramsNode.startIndex, paramsNode.endIndex);
    }
    if (returnTypeNode) {
      signature += `: ${this.getText(source, returnTypeNode.startIndex, returnTypeNode.endIndex)}`;
    }

    const isAsync = node.children.some(c => c.type === 'async');

    return {
      name,
      kind: 'function',
      signature: signature || undefined,
      lineNumber: node.startPosition.row + 1,
      isAsync,
      isExported,
    };
  }

  private extractClass(node: Parser.SyntaxNode, source: string, isExported: boolean): ExportInfo {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? this.getText(source, nameNode.startIndex, nameNode.endIndex) : 'unknown';

    let signature: string | undefined;
    const heritageNode = node.children.find(c => c.type === 'class_heritage');
    if (heritageNode) {
      signature = this.getText(source, heritageNode.startIndex, heritageNode.endIndex);
    }

    return {
      name,
      kind: 'class',
      signature,
      lineNumber: node.startPosition.row + 1,
      isExported,
    };
  }

  private extractVariables(node: Parser.SyntaxNode, source: string, isExported: boolean): ExportInfo[] {
    const exports: ExportInfo[] = [];

    for (const child of node.children) {
      if (child.type === 'variable_declarator') {
        const nameNode = child.childForFieldName('name');
        const valueNode = child.childForFieldName('value');
        
        if (nameNode) {
          const name = this.getText(source, nameNode.startIndex, nameNode.endIndex);
          
          const isFunction = valueNode && (
            valueNode.type === 'arrow_function' ||
            valueNode.type === 'function_expression' ||
            valueNode.type === 'function'
          );
          
          exports.push({
            name,
            kind: isFunction ? 'function' : 'constant',
            lineNumber: child.startPosition.row + 1,
            isExported,
            isAsync: valueNode?.children.some(c => c.type === 'async'),
          });
        }
      }
    }

    return exports;
  }

  private extractTypeDefinition(node: Parser.SyntaxNode, source: string, isExported: boolean): ExportInfo {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? this.getText(source, nameNode.startIndex, nameNode.endIndex) : 'unknown';

    return {
      name,
      kind: 'type',
      lineNumber: node.startPosition.row + 1,
      isExported,
    };
  }

  private extractImport(node: Parser.SyntaxNode, source: string): string[] {
    const imports: string[] = [];

    for (const child of node.children) {
      if (child.type === 'string') {
        const importPath = this.getText(source, child.startIndex, child.endIndex)
          .replace(/^["']|["']$/g, '');
        imports.push(importPath);
      }
    }

    return imports;
  }
}
