// Playtest numbers kept on the device (no network): per level how often it was started, won, lost, retried
// straight after a loss and quit midway, plus how many levels each session played. The map's 试玩数据
// panel shows them and copies them as a table.
const KEY = 'zombie-gold-journey-playtest-v4';

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* storage blocked */ }
  return null;
}
export const PT = load() || { sessions: [], levels: {} };
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(PT)); } catch (e) { /* ignore */ } };

export function ptSession() {
  PT.sessions.push({ t: Date.now(), plays: 0, wins: 0 });
  if (PT.sessions.length > 200) PT.sessions.shift();
  store();
}
export function ptEvent(code, type) {
  const L = PT.levels[code] ||= { start: 0, win: 0, fail: 0, retry: 0, quit: 0 };
  L[type] = (L[type] || 0) + 1;
  const s = PT.sessions[PT.sessions.length - 1];
  if (s && type === 'start') s.plays++;
  if (s && type === 'win') s.wins++;
  store();
}
export function ptReset() { PT.sessions.length = 0; PT.levels = {}; PT.perf = {}; store(); }
// frame rate per level (average of 2-second windows while playing, and the worst window)
export function ptPerf({ code, avg, min, q }) {
  const P = (PT.perf ||= {});
  const r = P[code] ||= { avg: 0, min: 999, n: 0, q };
  r.avg = Math.round((r.avg * r.n + avg) / (r.n + 1)); r.min = Math.min(r.min, min); r.n++; r.q = q;
  store();
}

// rows for the panel and the copied table
export function ptRows(order) {
  return order.map(code => {
    const L = PT.levels[code] || { start: 0, win: 0, fail: 0, retry: 0, quit: 0 };
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    const F = (PT.perf || {})[code];
    return { code, ...L, failRate: pct(L.fail, L.fail + L.win), retryRate: pct(L.retry, L.fail), quitRate: pct(L.quit, L.start), fps: F ? `${F.avg}/${F.min}` : '—' };
  });
}
export function ptSummary() {
  const n = PT.sessions.length;
  const plays = PT.sessions.reduce((a, s) => a + s.plays, 0);
  return { sessions: n, avgPlays: n ? (plays / n).toFixed(1) : '—' };
}
export function ptText(order, device = '') {
  const head = ['关卡', '开始', '通过', '失败', '失败率', '失败后立刻重开', '重开率', '中途退出', '退出率', '帧率 平均/最低'];
  const rows = ptRows([...order, '渔场']).map(r => [r.code, r.start, r.win, r.fail, r.failRate, r.retry, r.retryRate, r.quit, r.quitRate, r.fps]);
  const sm = ptSummary();
  return [head, ...rows].map(r => r.join('\t')).join('\n') + `\n\n打开次数\t${sm.sessions}\n每次平均玩几关\t${sm.avgPlays}` + (device ? `\n设备\t${device}` : '');
}
