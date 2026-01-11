import Parser from 'tree-sitter';
import TypeScriptLang from 'tree-sitter-typescript';
import { BaseParser } from './base.js';
import type { ModuleInfo, ExportInfo } from '../types.js';

const { typescript: TypeScript } = TypeScriptLang;

export class TypeScriptParser extends BaseParser {
  readonly language = 'typescript';
  private parser: Parser;

  constructor() {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript);
  }

  parse(source: string, filePath: string): ModuleInfo {
    const tree = this.parser.parse(source);
    const rootNode = tree.rootNode;

    const exports: ExportInfo[] = [];
    const imports: string[] = [];

    this.walkNode(rootNode, source, exports, imports, false);

    return {
      path: filePath,
      exports,
      imports: [...new Set(imports)],
      complexity: this.calculateComplexity(exports.length),
    };
  }

  private walkNode(
    node: Parser.SyntaxNode,
    source: string,
    exports: ExportInfo[],
    imports: string[],
    isExported: boolean
  ): void {
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
        // Recurse with isExported = true
        for (const child of node.children) {
          this.walkNode(child, source, exports, imports, true);
        }
        break;

      case 'import_statement':
        imports.push(...this.extractImport(node, source));
        break;

      case 'program':
        // Recurse into top-level statements
        for (const child of node.children) {
          this.walkNode(child, source, exports, imports, false);
        }
        break;
    }
  }

  private extractFunction(node: Parser.SyntaxNode, source: string, isExported: boolean): ExportInfo {
    const nameNode = node.childForFieldName('name');
    const paramsNode = node.childForFieldName('parameters');
    const returnTypeNode = node.childForFieldName('return_type');

    const name = nameNode ? this.getText(source, nameNode.startIndex, nameNode.endIndex) : 'unknown';
    
    // Build signature
    let signature = '';
    if (paramsNode) {
      signature = this.getText(source, paramsNode.startIndex, paramsNode.endIndex);
    }
    if (returnTypeNode) {
      signature += `: ${this.getText(source, returnTypeNode.startIndex, returnTypeNode.endIndex)}`;
    }

    // Check for async
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

    // Get heritage clause for extends/implements
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
          
          // Check if it's a function expression or arrow function
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
        // Remove quotes from the import path
        const importPath = this.getText(source, child.startIndex, child.endIndex)
          .replace(/^["']|["']$/g, '');
        imports.push(importPath);
      }
    }

    return imports;
  }
}
