// The logic layer stays pure: no clock, no unseeded randomness, no browser, no three.js, no imports from the
// presentation layers. Checked on the code with comments and strings removed.
// run.sh passes the real listing of src/sim/*.js as arguments, so a new sim file has to be added to SIM below.
import { log, readText, args, check, eq, done } from './lib.js';

const SIM = ['arena.js', 'bonussim.js', 'bot.js', 'extraction.js', 'fishsim.js', 'formation.js', 'journeysim.js', 'rng.js', 'runsim.js', 'util.js'].map(f => 'src/sim/' + f);
const FILES = [...SIM, 'src/content/specials.js'];

const listed = args.filter(a => a.endsWith('.js')).sort();
if (listed.length) eq(listed.join(' '), SIM.join(' '), 'SIM lists every file in src/sim/');
else log('  (no file listing given: run through tests/run.sh to check that SIM is complete)');

// code only: comments removed and, unless keepStrings, string / template contents blanked out (regex literals stay)
function codeOnly(src, keepStrings = false) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; out += ' '; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const j0 = i;
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      out += keepStrings ? src.slice(j0, i) : c + c;
      continue;
    }
    out += c; i++;
  }
  return out;
}

const BANNED = [
  [/\bMath\.random\b/, 'Math.random'], [/\bDate\b/, 'Date'], [/\bperformance\b/, 'performance'],
  [/\bdocument\b/, 'document'], [/\bwindow\b/, 'window'], [/\bnavigator\b/, 'navigator'], [/\blocalStorage\b/, 'localStorage'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'], [/\bset(Timeout|Interval)\b/, 'setTimeout / setInterval'], [/\bTHREE\b/, 'THREE'],
];
const importsOf = src => [...codeOnly(src, true).matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
const resolve = (from, rel) => {
  const parts = from.split('/').slice(0, -1);
  for (const p of rel.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
  return parts.join('/');
};
// the logic layer may import itself and the planner's data tables, nothing else
const allowed = path => path.startsWith('src/sim/') || path.startsWith('src/content/');

for (const f of FILES) {
  const src = readText(f), code = codeOnly(src);
  for (const [re, name] of BANNED) {
    if (f === 'src/sim/rng.js' && name === 'Math.random') {
      // the one allowed call: randomSeed() picks a fresh seed
      const lines = code.split('\n').filter(l => re.test(l));
      check(lines.length === 1 && /export const randomSeed\b/.test(lines[0]), `${f}: Math.random only inside randomSeed()`);
      continue;
    }
    check(!re.test(code), `${f}: uses ${name}`);
  }
  for (const imp of importsOf(src)) check(imp.startsWith('.') && allowed(resolve(f, imp)), `${f}: imports ${imp}`);
}

// everything the sims pull in (the content tables too) stays clear of the view, the UI and the platform
const seen = new Set(), queue = [...FILES];
while (queue.length) {
  const f = queue.shift();
  if (seen.has(f)) continue;
  seen.add(f);
  for (const imp of importsOf(readText(f))) {
    const p = resolve(f, imp);
    if (check(imp.startsWith('.') && allowed(p), `${f} (reached from the sims): imports ${imp}`)) queue.push(p);
  }
}
log(`  ${FILES.length} files checked, ${seen.size} modules in the logic layer's import graph`);
done('purity');
