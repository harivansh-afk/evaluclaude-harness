import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import { BaseParser } from './base.js';
import type { ModuleInfo, ExportInfo } from '../types.js';

export class PythonParser extends BaseParser {
  readonly language = 'python';
  private parser: Parser;

  constructor() {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(Python);
  }

  parse(source: string, filePath: string): ModuleInfo {
    const tree = this.parser.parse(source);
    const rootNode = tree.rootNode;

    const exports: ExportInfo[] = [];
    const imports: string[] = [];

    // Walk the tree to extract functions, classes, and imports
    this.walkNode(rootNode, source, exports, imports);

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
    imports: string[]
  ): void {
    switch (node.type) {
      case 'function_definition':
        exports.push(this.extractFunction(node, source));
        break;

      case 'class_definition':
        exports.push(this.extractClass(node, source));
        break;

      case 'import_statement':
        imports.push(...this.extractImport(node, source));
        break;

      case 'import_from_statement':
        imports.push(...this.extractFromImport(node, source));
        break;

      default:
        // Recurse into children for top-level nodes
        if (node.type === 'module' || node.type === 'decorated_definition') {
          for (const child of node.children) {
            this.walkNode(child, source, exports, imports);
          }
        }
    }
  }

  private extractFunction(node: Parser.SyntaxNode, source: string): ExportInfo {
    const nameNode = node.childForFieldName('name');
    const paramsNode = node.childForFieldName('parameters');
    const returnTypeNode = node.childForFieldName('return_type');
    const bodyNode = node.childForFieldName('body');

    const name = nameNode ? this.getText(source, nameNode.startIndex, nameNode.endIndex) : 'unknown';
    
    // Build signature
    let signature = '';
    if (paramsNode) {
      signature = this.getText(source, paramsNode.startIndex, paramsNode.endIndex);
    }
    if (returnTypeNode) {
      signature += ` -> ${this.getText(source, returnTypeNode.startIndex, returnTypeNode.endIndex)}`;
    }

    // Check for async
    const isAsync = node.children.some(c => c.type === 'async');

    // Try to extract docstring
    let docstring: string | undefined;
    if (bodyNode && bodyNode.firstChild?.type === 'expression_statement') {
      const exprStmt = bodyNode.firstChild;
      const strNode = exprStmt.firstChild;
      if (strNode?.type === 'string') {
        docstring = this.extractFirstLineOfDocstring(
          this.getText(source, strNode.startIndex, strNode.endIndex)
        );
      }
    }

    return {
      name,
      kind: 'function',
      signature: signature || undefined,
      docstring,
      lineNumber: node.startPosition.row + 1,
      isAsync,
    };
  }

  private extractClass(node: Parser.SyntaxNode, source: string): ExportInfo {
    const nameNode = node.childForFieldName('name');
    const bodyNode = node.childForFieldName('body');

    const name = nameNode ? this.getText(source, nameNode.startIndex, nameNode.endIndex) : 'unknown';

    // Try to extract docstring
    let docstring: string | undefined;
    if (bodyNode && bodyNode.firstChild?.type === 'expression_statement') {
      const exprStmt = bodyNode.firstChild;
      const strNode = exprStmt.firstChild;
      if (strNode?.type === 'string') {
        docstring = this.extractFirstLineOfDocstring(
          this.getText(source, strNode.startIndex, strNode.endIndex)
        );
      }
    }

    // Build a basic signature showing inheritance
    let signature: string | undefined;
    const superclassNode = node.childForFieldName('superclasses');
    if (superclassNode) {
      signature = this.getText(source, superclassNode.startIndex, superclassNode.endIndex);
    }

    return {
      name,
      kind: 'class',
      signature,
      docstring,
      lineNumber: node.startPosition.row + 1,
    };
  }

  private extractImport(node: Parser.SyntaxNode, source: string): string[] {
    const imports: string[] = [];
    
    for (const child of node.children) {
      if (child.type === 'dotted_name') {
        imports.push(this.getText(source, child.startIndex, child.endIndex));
      } else if (child.type === 'aliased_import') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          imports.push(this.getText(source, nameNode.startIndex, nameNode.endIndex));
        }
      }
    }
    
    return imports;
  }

  private extractFromImport(node: Parser.SyntaxNode, source: string): string[] {
    const moduleNode = node.childForFieldName('module_name');
    if (moduleNode) {
      return [this.getText(source, moduleNode.startIndex, moduleNode.endIndex)];
    }
    return [];
  }
}
