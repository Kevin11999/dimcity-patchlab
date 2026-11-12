import { execFileSync } from 'node:child_process';
import { ROOT } from '../lib.mjs';
// The syntax check of the repository (npm run check): every .js / .mjs file parses.
export default { name:'code check (scripts/check.mjs)', kind:'node', timeout:60000, async run(t){
  let out = '', ok = true; try { out = execFileSync(process.execPath, ['scripts/check.mjs'], { cwd:ROOT, encoding:'utf8' }); } catch(e){ ok = false; out = String(e.stdout || e.message); }
  t.ok(ok, out.trim().split('\n').pop());
} };
