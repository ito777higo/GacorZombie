// Tiny test helper for macOS JavaScriptCore (`jsc -m`) and Node: print, read a file, command-line args, checks.
// Paths are relative to the repo root (tests/run.sh runs every test from there).
const G = globalThis;
const fs = G.read ? null : await import('node:fs');

export const log = G.print ? s => G.print(String(s)) : s => console.log(String(s));
export const readText = path => (G.read ? G.read(path) : fs.readFileSync(path, 'utf8'));
export const args = G.process ? G.process.argv.slice(2) : G.arguments ? [...G.arguments] : [];

let checks = 0;
const fails = [];
export function check(cond, msg) {
  checks++;
  if (!cond) { fails.push(msg); log('  FAIL ' + msg); }
  return !!cond;
}
export const eq = (got, want, msg) => check(got === want, `${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// FNV-1a over strings, for event-log digests
export function digest() {
  let h = 0x811c9dc5;
  return {
    add(s) { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } h ^= 0x7c; h = Math.imul(h, 0x01000193); },
    get hex() { return (h >>> 0).toString(16).padStart(8, '0'); },
  };
}

// the last line of every test: throws (a non-zero exit in both runtimes) when a check failed
export function done(name) {
  if (fails.length) throw new Error(`${name}: ${fails.length} of ${checks} checks failed`);
  log(`ok ${name} (${checks} checks)`);
}
