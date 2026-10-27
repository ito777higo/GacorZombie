// The one seam between 一路爆分 and the host (the 2-player fishing app and its server). docs/接入方案.md is the
// contract. Today the local bridge keeps everything on the device, as the prototype always has; a host
// replaces it by defining window.GateFishHost before the game boots, with any subset of these methods:
//
//   track(event, props)            analytics event (names and props listed in the doc)
//   runResult(r) -> Promise<{ok}>  a finished run, for the server to check and credit
//   openFishing(ctx) -> bool       true when the host takes the player to the real 2-player fishing game
//   wallet() -> Promise<number>    the server's coin balance (synced into the local wallet on boot)
//
// Every call is fire-and-forget or awaited with a timeout, so a slow or missing host never blocks play.
const local = {
  track() {},
  runResult() { return Promise.resolve({ ok: true, local: true }); },
  openFishing() { return false; },
  wallet() { return Promise.resolve(null); },
};

const host = () => (typeof window !== 'undefined' && window.GateFishHost) || null;
const log = [];          // last events, readable from the 试玩数据 panel and tests

function call(name, args, fallback) {
  const h = host();
  const fn = h && typeof h[name] === 'function' ? h[name] : local[name];
  try { return fn.apply(h || local, args); } catch (e) { console.error('[bridge]', name, e); return fallback; }
}
const withTimeout = (p, ms, v) => Promise.race([Promise.resolve(p).catch(() => v), new Promise(r => setTimeout(() => r(v), ms))]);

export const bridge = {
  get connected() { return !!host(); },
  track(event, props = {}) {
    const e = { event, t: Date.now(), ...props };
    log.push(e); if (log.length > 200) log.shift();
    call('track', [event, props]);
  },
  runResult(r) { return withTimeout(call('runResult', [r], null), 4000, { ok: false, timeout: true }); },
  openFishing(ctx) { return !!call('openFishing', [ctx], false); },
  wallet() { return withTimeout(call('wallet', [], null), 3000, null); },
  log,
};
