// scripts/check.mjs — a syntax check of every JavaScript file of the app (npm run check).
// Plain scripts are checked as they are; files that use import / export are checked as modules.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const skip = new Set(['node_modules', 'dist', '.git', 'release', 'out', 'videos']);
const files = [];
(function walk(dir){
  for(const n of readdirSync(dir)){
    if(skip.has(n) || n.startsWith('.')) continue;
    const p = join(dir, n), st = statSync(p);
    if(st.isDirectory()) walk(p); else if(['.js', '.mjs', '.cjs'].includes(extname(p))) files.push(p);
  }
})(root);

const tmp = mkdtempSync(join(tmpdir(), 'check-'));
let bad = 0;
const run = f => spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
for(const f of files){
  let r = run(f);
  if(r.status !== 0 && /import|export/.test(r.stderr) && extname(f) === '.js'){      // an ES module in a .js file
    const copy = join(tmp, 'm.mjs'); writeFileSync(copy, readFileSync(f)); r = run(copy);
  }
  if(r.status !== 0){ bad++; console.error(`✗ ${f.slice(root.length)}\n${r.stderr.split('\n').slice(0, 6).join('\n')}`); }
}
rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} of ${files.length} files have a syntax error` : `${files.length} files OK`);
process.exit(bad ? 1 : 0);
