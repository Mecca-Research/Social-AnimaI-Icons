// Every tests/*.mjs must parse. A backtick inside a page.evaluate template
// literal closes it, and the syntax error it makes points at a line that is
// fine — so this is worth running before every suite rather than after.
import { readdirSync } from 'fs';
import { execFileSync } from 'child_process';
let bad = 0;
for (const f of readdirSync('tests').filter(n => n.endsWith('.mjs'))) {
  try { execFileSync('node', ['--check', `tests/${f}`], { stdio: 'pipe' }); console.log(`  ok   tests/${f}`); }
  catch (e) { bad++; console.log(`  FAIL tests/${f}\n${e.stderr.toString().split('\n').slice(0,4).join('\n')}`); }
}
process.exit(bad ? 1 : 0);
