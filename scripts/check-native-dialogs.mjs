import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const forbidden = new Set(['alert', 'confirm', 'prompt']);
const bad = [];

function inspectFile(path) {
  const content = readFileSync(path, 'utf8');
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, kind);

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const target = node.expression;
      const globalMethod = ts.isIdentifier(target) && forbidden.has(target.text);
      const windowMethod = ts.isPropertyAccessExpression(target) &&
        ts.isIdentifier(target.expression) &&
        ['window', 'globalThis'].includes(target.expression.text) &&
        forbidden.has(target.name.text);
      if (globalMethod || windowMethod) {
        const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
        bad.push(path + ':' + (pos.line + 1));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function walk(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { walk(path); continue; }
    if (/\.tsx?$/.test(item.name)) inspectFile(path);
  }
}
walk('src');
if (bad.length) {
  console.error('Use SweetAlert2 instead of native browser dialogs:', bad.join(', '));
  process.exitCode = 1;
} else {
  console.log('No native browser dialog calls in src/');
}
