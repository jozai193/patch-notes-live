import ts from 'typescript';

export function literalLoops(source: string): { line: number; column: number }[] {
  const file = ts.createSourceFile(
    'mod.js',
    source,
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.JS,
  );
  const locations: { line: number; column: number }[] = [];
  function visit(node: ts.Node): void {
    if (ts.isWhileStatement(node) && node.expression.kind === ts.SyntaxKind.TrueKeyword) {
      const p = file.getLineAndCharacterOfPosition(node.getStart(file));
      locations.push({ line: p.line + 1, column: p.character + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return locations;
}
