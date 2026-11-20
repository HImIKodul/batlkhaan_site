// Runtime source only: historical migration names, database identifiers, archives and remotes stay compatible.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const ts=createRequire(new URL('../backend/package.json',import.meta.url))('typescript');
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];let checked=0;
function visit(relative){
 const full=path.join(root,relative);
 if(fs.statSync(full).isDirectory()){
  for(const entry of fs.readdirSync(full))if(!['node_modules','__pycache__'].includes(entry))visit(path.join(relative,entry));
 }else if(/\.(tsx?|jsx?|mjs|py|html|css|svg|json|md)$/.test(relative)){
  checked++;
  const source=fs.readFileSync(full,'utf8');
  if(/businessmmri/i.test(source))failures.push(relative);
  // Parse visible JSX text and accessible names without touching schema constants,
  // CSS classes, environment variables or historical database identifiers.
  if(relative.endsWith('.tsx')){
   const tree=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
   const legacy=/\bMMRI\b|\bBusinessMRI(?!\.mn)\b/i;
   function inspect(node){
    if(ts.isJsxText(node)&&legacy.test(node.text))failures.push(`${relative}:visible text`);
    if(ts.isJsxAttribute(node)&&['aria-label','title','alt'].includes(node.name.getText(tree))&&node.initializer&&ts.isStringLiteral(node.initializer)&&legacy.test(node.initializer.text))failures.push(`${relative}:accessible name`);
    if(ts.isBinaryExpression(node)&&node.left.getText(tree)==='document.title'&&legacy.test(node.right.getText(tree)))failures.push(`${relative}:page title`);
    ts.forEachChild(node,inspect);
   }
   inspect(tree);
  }
 }
}
for(const relative of ['backend/src','backend/pdf_renderer','frontend/src','frontend/public','frontend/index.html','frontend/ds-lib/package.json'])visit(relative);
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',checked,failures}));
if(failures.length)process.exitCode=1;
