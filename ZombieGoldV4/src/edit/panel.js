// 调参台 (关卡编辑器 · 功能一): open a level, play it, change its numbers while it runs. The panel sits beside the
// game on a wide screen and in a drawer under it on a phone. Four pages:
//   本关  the level's script item by item (insert / delete / move, every parameter in a form), its start, boss, finale
//   全局  every global number (edit/params.js) — a slider and a box, live where it can be
//   验关  the autopilot plays this level or all 13, N times per way of playing, and tabulates it (edit/autotest.js)
//   导入导出  a level or the globals as JSON (保存检查 first), new levels, back to the demo's numbers
// Changes are kept on this device (localStorage) and come back after a reload; only #edit / ?edit builds open it.
import { LEVELS, CHAPTERS } from '../content/levels.js';
import { TUNE } from '../content/tune.js';
import { save, runtime } from '../platform/save.js';
import { kmb, fmt } from '../sim/util.js';
import { PARAMS, PARAM, WHEN, bindWorld } from './params.js';
import * as S from './schema.js';
import { BOSSES } from '../content/cast.js';
import { runBatch } from './autotest.js';

const STORE = 'zombie-gold-journey-edit-v4';
const TUNE_FORMAT = 'gatefish-tune/1', ALL_FORMAT = 'gatefish-edits/1';
const BOTS = { best: '最优', mostly: '一般', random: '乱走' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = v => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pct = v => `${Math.round(v * 100)}%`;

let G = null, root = null, body = null;
const ORIG = {};                                   // the demo's config of each of the 13, by code
const st = { levels: {}, custom: [], customOrig: {}, tune: {} };   // the changes, kept on this device
const customObjs = {};                             // code → level object of a level that isn't one of the 13
let cur = null, tab = 'level', openItems = {}, insAt = null, undoStack = [], dirty = false, preDrag = null;
let vt = { running: false, stop: false, rows: [], scope: 'cur' };

// ---------------------------------------------------------------- open, load, keep
export function openPanel(ctx) {
  document.body.classList.add('edit');
  if (root) return;
  G = ctx;
  bindWorld(ctx.world);
  for (const L of LEVELS) ORIG[L.code] = S.toConfig(L);
  load();
  applyAll();
  cur = (G.game.L && levelObj(G.game.L.code) && G.game.L.code) || LEVELS[Math.min(save.next || 0, LEVELS.length - 1)].code;
  build();
  render();
  // the frame changes size with the panel: the 3D view follows it
  if (window.ResizeObserver) new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(document.getElementById('frame'));
  setInterval(status, 400);
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s) Object.assign(st, { levels: s.levels || {}, custom: s.custom || [], customOrig: s.customOrig || {}, tune: s.tune || {} });
  } catch (e) { /* nothing kept */ }
}
function store() { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* private window */ } }
// put every level and global number back to the demo, then lay the kept changes on top
function applyAll() {
  for (const p of PARAMS) p.set(p.k in st.tune ? st.tune[p.k] : p.def);
  for (const L of LEVELS) S.applyConfig(L, st.levels[L.code] || ORIG[L.code]);
  for (const k of Object.keys(customObjs)) delete customObjs[k];
  for (const c of st.custom) customObjs[c.code] = S.applyConfig({ run: {}, finale: {}, teach: [] }, c);
}
// 兵力系数 and 炮倍 are copied into every level from 大关二 on (levels.js does it once at load)
function syncDerived() {
  for (const L of [...LEVELS, ...Object.values(customObjs)]) if (L.ch >= 1) { L.run.army = TUNE.army; L.stake = TUNE.stake; }
}
const levelObj = code => LEVELS.find(L => L.code === code) || customObjs[code];
const levelIndex = code => LEVELS.findIndex(L => L.code === code);
const isCustom = code => levelIndex(code) < 0;
const cfgOf = code => (isCustom(code) ? st.custom.find(c => c.code === code) : st.levels[code] || ORIG[code]);
const origOf = code => (isCustom(code) ? st.customOrig[code] || cfgOf(code) : ORIG[code]);
function pushUndo(snap = JSON.stringify(st)) { undoStack.push(snap); if (undoStack.length > 120) undoStack.shift(); }
function undo() {
  if (!undoStack.length) return;
  const s = JSON.parse(undoStack.pop());
  for (const k of Object.keys(st)) delete st[k];
  Object.assign(st, s);
  applyAll(); store(); dirty = true; render();
}
// change the current level's config: fn mutates a copy, which then replaces it
function edit(fn) {
  pushUndo();
  const c = clone(cfgOf(cur));
  fn(c);
  commit(cur, c);
}
function commit(code, c) {
  if (isCustom(code)) {
    st.custom[st.custom.findIndex(q => q.code === code)] = c;
    S.applyConfig(customObjs[code], c);
  } else {
    if (same(c, ORIG[code])) delete st.levels[code]; else st.levels[code] = c;
    S.applyConfig(levelObj(code), c);
  }
  dirty = true; store(); render();
}
function setParam(p, v) {
  p.set(v);
  if (Math.abs(v - p.def) < 1e-9) delete st.tune[p.k]; else st.tune[p.k] = v;
  if (p.k === 'stake' || p.k === 'army') syncDerived();
  store();
}

// ---------------------------------------------------------------- playing the level
function startFrom(from) {
  const L = levelObj(cur), i = levelIndex(cur), g = G.game;
  const nIn = Math.round(+$('#edN').value) || 0, useCur = $('#edCurN').checked;
  let startN = nIn || null, skills = [];
  if (from > 0 && useCur && g.sim && g.L && g.L.code === cur && g.sim.squad.N > 0) {
    if (!nIn) startN = g.sim.squad.N;
    skills = Object.keys(g.sim.squad.skills).filter(k => g.sim.squad.skills[k]);
  }
  const o = { skipIntro: true, edit: { from, startN, skills } };
  if (i < 0) o.level = L;
  runtime.pause = false;
  G.ui.prompt(null); G.ui.hideOverlays();
  g.start(i, o);
  dirty = false; render();
}

// ---------------------------------------------------------------- DOM
const $ = s => root.querySelector(s);
function build() {
  root = document.createElement('aside');
  root.id = 'editPanel';
  root.innerHTML = `<div class="ed-head"><b>调参台</b><select id="edLevel" aria-label="关卡"></select><button class="ed-min" data-tb="min" type="button" title="收起 / 展开">▾</button></div>
    <div class="ed-tb">
      <button data-tb="pause" type="button" title="暂停 / 继续">⏸</button>
      <span class="ed-seg"><button data-tb="sp" data-v="1" type="button">×1</button><button data-tb="sp" data-v="2" type="button">×2</button><button data-tb="sp" data-v="3" type="button">×3</button></span>
      <button data-tb="restart" type="button">重开本关</button>
      <span class="ed-grp">从第<input id="edFrom" type="number" min="1" value="1">项<button data-tb="from" type="button" title="从这一项开始">▶</button></span>
      <span class="ed-grp">开局兵<input id="edN" type="number" min="1" placeholder="默认"></span>
      <label class="ed-grp"><input id="edCurN" type="checkbox" checked>带当前兵数</label>
      <button data-tb="undo" type="button">撤销</button>
    </div>
    <div class="ed-tabs"><button data-tab="level" type="button">本关</button><button data-tab="global" type="button">全局</button><button data-tab="test" type="button">验关</button><button data-tab="io" type="button">导入导出</button></div>
    <div class="ed-body"></div>
    <div class="ed-status"></div>`;
  document.getElementById('app').appendChild(root);
  body = $('.ed-body');
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('pointerdown', e => { if (e.target.closest('[data-k]')) preDrag = JSON.stringify(st); });
  root.addEventListener('focusin', e => { if (e.target.closest('[data-k]')) preDrag = JSON.stringify(st); });
  $('#edLevel').addEventListener('change', e => { cur = e.target.value; openItems = {}; insAt = null; render(); startFrom(0); });
}

function render() {
  const sel = $('#edLevel');
  sel.innerHTML = LEVELS.map(L => `<option value="${esc(L.code)}">${esc(L.code)} ${esc(L.title)}${st.levels[L.code] ? ' · 改过' : ''}</option>`).join('')
    + st.custom.map(c => `<option value="${esc(c.code)}">★ ${esc(c.code)} ${esc(c.title)}</option>`).join('');
  sel.value = cur;
  root.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  root.querySelectorAll('[data-tb="sp"]').forEach(b => b.classList.toggle('on', +b.dataset.v === Math.max(1, save.speed || 1)));
  $('[data-tb="pause"]').textContent = runtime.pause ? '▶' : '⏸';
  $('[data-tb="undo"]').disabled = !undoStack.length;
  const top = body.scrollTop;
  body.innerHTML = tab === 'level' ? pageLevel() : tab === 'global' ? pageGlobal() : tab === 'test' ? pageTest() : pageIO();
  body.scrollTop = top;
  status();
}
function status() {
  if (!root) return;
  const g = G.game, el = $('.ed-status');
  const run = g.sim && g.L ? `正在跑 ${esc(g.L.code)} · 兵 ${fmt(g.sim.squad.N)} · ${{ ready: '准备', run: '跑道', arrive: '上台', boss: 'Boss', finale: '结尾', done: '打完', fail: '失败' }[g.sim.phase] || g.sim.phase}` : '没有在跑';
  const tip = dirty ? '<em>关卡数据改过：点 ▶ 从那一项重开，或「重开本关」才生效</em>' : '';
  const html = `${run}${runtime.pause ? ' · 暂停中' : ''}${tip ? ' · ' + tip : ''}`;
  if (el.innerHTML !== html) el.innerHTML = html;
}

// ---------------------------------------------------------------- 本关
const LEVEL_FIELDS = [
  { p: 'title', label: '关卡名', type: 'text' },
  { p: 'ch', label: '大关', type: 'sel', num: true, options: CHAPTERS.map((C, i) => ({ v: i, label: `大关${C.no} ${C.name}` })) },
  { p: 'run.startN', label: '开局兵数（大关二起再 × 兵力系数）', type: 'int', min: 1, max: 999 },
  { p: 'run.stand', label: '站桩关（队伍不动，东西飘过来）', type: 'bool' },
  { p: 'run.drift', label: '站桩：飘过来的速度', type: 'num', min: 1, max: 20, step: 0.5, show: c => c.run.stand },
  { p: 'coins', label: '剧本金额（一星这关大概给多少金币）', type: 'int', min: 0, max: 1e8, step: 10000, optional: true, fmt: kmb },
  { p: 'par', label: '一般兵数（一般走法带到结尾的兵 × 跑道倍数，定表现系数）', type: 'int', min: 0, max: 1e6, optional: true },
];
const BOSS_FIELDS = [
  { p: 'finale.boss.name', label: '名字', type: 'text' },
  { p: 'finale.boss.hp', label: '血量（按队伍火力夹在 1～2.2 倍战斗时长之间）', type: 'int', min: 1, max: 100000 },
  { p: 'finale.boss.m', label: '倍数（打倒赔 ×N 炮倍）', type: 'int', min: 0, max: 5000, optional: true },
  { p: 'finale.boss.sec', label: '战斗时长（秒）', type: 'num', min: 2, max: 40, step: 0.5, optional: true },
  { p: 'finale.boss.slam', label: '出招间隔（秒，空 = 不出招）', type: 'num', min: 0.5, max: 10, step: 0.1, optional: true },
  { p: 'finale.boss.bite', label: '贴身啃食（每秒扣兵）', type: 'num', min: 0, max: 30, step: 0.5, optional: true },
  { p: 'finale.boss.big', label: '大体型', type: 'bool' },
  { p: 'finale.boss.escape', label: '几秒打不倒就跑（空 = 不跑）', type: 'num', min: 2, max: 40, optional: true },
  { p: 'finale.boss.dodgy', label: '会闪（只有瞄准追得上）', type: 'bool' },
  { p: 'finale.boss.shieldWall', label: '身前盾墙几个（空 = 没有）', type: 'int', min: 1, max: 12, optional: true },
];
const FIN_FIELDS = [
  { p: 'finale.after', label: '结尾', type: 'sel', options: S.FINALE_OPTS },
  { p: 'finale.pick', label: '结尾转盘：一星转到', type: 'sel', options: S.PICK_OPTS, show: c => c.finale.after === 'pick' },
  { p: 'finale.rbDiv', label: '彩虹滚轮第一格 = 一般兵数 ÷（空 = 全局）', type: 'num', min: 1, max: 30, optional: true, show: c => c.finale.after === 'rainbow' },
  { p: 'finale.ladder.steps', label: '倍数跑道（逗号分隔，空 = 没有）', type: 'list', optional: true },
  { p: 'finale.ladder.base', label: '倍数跑道：第一格要几个兵', type: 'int', min: 1, max: 100000, optional: true, show: c => c.finale.ladder },
];
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.'), last = ks.pop();
  let a = o;
  for (const k of ks) { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; }
  if (v === undefined) delete a[last]; else a[last] = v;
}
function widget(f, v, path) {
  const d = `data-p="${esc(path)}" data-t="${f.type}"${f.num ? ' data-num="1"' : ''}`;
  const opt = (list, empty) => (empty ? `<option value="">${esc(empty)}</option>` : '') + list.map(q => `<option value="${esc(q.v)}"${String(q.v) === String(v ?? '') ? ' selected' : ''}>${esc(q.label)}</option>`).join('');
  switch (f.type) {
    case 'int': case 'num': return `<input type="number" ${d} value="${v ?? ''}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''} step="${f.step || (f.type === 'int' ? 1 : 'any')}">`;
    case 'bool': return `<input type="checkbox" ${d}${v ? ' checked' : ''}>`;
    case 'tri': return `<select ${d}>${opt([{ v: 'true', label: '是' }, { v: 'false', label: '否' }], '自动')}</select>`;
    case 'side': return `<select ${d}>${opt(S.SIDES, f.optional ? '（中）' : '')}</select>`;
    case 'sel': return `<select ${d}>${opt(f.options, f.optional ? '（空）' : '')}</select>`;
    case 'fish': return `<select ${d}>${opt(S.FISH_OPTS, f.optional ? '（默认）' : '')}</select>`;
    case 'skill': return `<select ${d}>${opt(S.SKILL_OPTS)}</select>`;
    case 'list': return `<input type="text" ${d} value="${esc(Array.isArray(v) ? v.join(', ') : '')}">`;
    default: return `<input type="text" ${d} value="${esc(v ?? '')}">`;
  }
}
const show = v => (v === undefined || v === null || v === '' ? '空' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '是' : '否') : String(v));
function fieldRow(f, c, o) {
  if (f.show && !f.show(c)) return '';
  const v = getPath(c, f.p), ov = o ? getPath(o, f.p) : v, mod = !same(v ?? null, ov ?? null);
  return `<div class="ed-f${mod ? ' mod' : ''}"><span>${esc(f.label)}${f.fmt && v ? ` <i>${f.fmt(v)}</i>` : ''}</span>${widget(f, v, 'L:' + f.p)}${mod ? `<small>原 ${esc(show(ov))} <button type="button" data-reset="${esc(f.p)}" title="恢复">↺</button></small>` : ''}</div>`;
}
function pageLevel() {
  const c = cfgOf(cur), o = origOf(cur), L = levelObj(cur);
  const errs = S.validate(c, L.teach);
  const lvErr = errs.filter(e => e.at === null);
  const boss = c.finale.boss;
  const seq = c.run.seq.map((it, i) => itemRow(it, i, o && o.run.seq[i], errs.filter(e => e.at === i))).join('');
  return `${lvErr.length ? `<div class="ed-errs">${lvErr.map(e => `<div>${esc(e.msg)}</div>`).join('')}</div>` : ''}
    <section><h4>关卡 <small>${esc(c.code)}${isCustom(cur) ? ' · 新关卡' : ''}</small></h4>${LEVEL_FIELDS.map(f => fieldRow(f, c, o)).join('')}</section>
    <section><h4>积木序列 <small>${c.run.seq.length} 项 · 点摘要展开 · 改完点 ▶ 从这一项重开</small></h4>
      ${insAt === -1 ? insertRow(-1) : `<button class="ed-add" type="button" data-act="ins" data-i="-1">＋ 在最前面插入</button>`}
      <div class="ed-seq">${seq}</div></section>
    <section><h4>Boss</h4>
      <label class="ed-f${!same(boss?.model ?? null, o?.finale.boss?.model ?? null) ? ' mod' : ''}"><span>模型</span><select data-p="L:finale.boss.model" data-t="sel">${S.BOSS_OPTS.map(q => `<option value="${q.v}"${q.v === (boss ? boss.model || '' : '') ? ' selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label>
      ${boss ? BOSS_FIELDS.map(f => fieldRow(f, c, o)).join('') : ''}</section>
    <section><h4>结尾</h4>${FIN_FIELDS.map(f => fieldRow(f, c, o)).join('')}</section>`;
}
function itemRow(it, i, oit, errs) {
  const T = S.TOKENS[it[0]], mod = !same(it, oit), isNew = oit === undefined;
  return `<div class="ed-it${openItems[i] ? ' open' : ''}${mod ? ' mod' : ''}${errs.length ? ' bad' : ''}" data-i="${i}">
    <div class="ed-it-h"><b>${i + 1}</b><span class="ed-sum" data-act="toggle">${esc(S.summary(it))}${isNew ? ' <i>新</i>' : mod ? ' <i>改过</i>' : ''}</span>
      <button type="button" data-act="play" title="从这一项开始">▶</button><button type="button" data-act="up" title="上移">↑</button><button type="button" data-act="down" title="下移">↓</button><button type="button" data-act="del" title="删除">✕</button><button type="button" data-act="ins" title="在后面插入">＋</button></div>
    ${errs.map(e => `<div class="ed-err">${esc(e.msg)}</div>`).join('')}
    ${openItems[i] && T ? itemForm(it, i, oit && oit[0] === it[0] ? oit : null) : ''}
  </div>${insAt === i ? insertRow(i) : ''}`;
}
function insertRow(i) {
  const groups = {};
  for (const k of S.TOKEN_ORDER) (groups[S.TOKENS[k].group] ||= []).push(k);
  return `<div class="ed-ins"><span>插入</span><select data-ins="${i}"><option value="">选一种积木…</option>${Object.entries(groups).map(([g, ks]) => `<optgroup label="${esc(g)}">${ks.map(k => `<option value="${k}">${esc(S.TOKENS[k].name)}</option>`).join('')}</optgroup>`).join('')}</select><button type="button" data-act="insCancel">取消</button></div>`;
}
function itemForm(it, i, oit) {
  const T = S.TOKENS[it[0]], o = S.optsOf(it), oo = oit ? S.optsOf(oit) : null;
  const rows = T.fields.filter(f => !f.hidden).map(f => {
    if (f.type === 'barrel') {
      const b = S.barrelOf(it, f), ob = oit ? S.barrelOf(oit, f) : b, mod = !same(b, ob);
      const K = b ? S.BARREL_KINDS[b[0]] : null;
      const p = `S:${i}:bar:${f.at}`;
      const kindSel = `<select data-p="${p}:0" data-t="sel">${f.optional ? `<option value=""${b ? '' : ' selected'}>（空）</option>` : ''}${Object.keys(S.BARREL_KINDS).map(k => `<option value="${k}"${b && b[0] === k ? ' selected' : ''}>${esc(S.BARREL_KINDS[k].label)}</option>`).join('')}</select>`;
      const val = !b ? '' : K.val === 'fish' ? widget({ type: 'fish' }, b[1], `${p}:1`) : K.val === 'skill' ? widget({ type: 'skill' }, b[1], `${p}:1`) : widget({ type: 'int', min: 0 }, b[1], `${p}:1`);
      return `<div class="ed-f ed-bar${mod ? ' mod' : ''}"><span>${esc(f.label)}</span>${kindSel}${b ? `<em>${esc(K.vlabel)}</em>${val}<em>要打几下</em>${widget({ type: 'int', min: 1 }, b[2], `${p}:2`)}` : ''}${mod ? `<small>原 ${esc(ob ? S.barrelLabel(ob) : '空')}</small>` : ''}</div>`;
    }
    const v = f.opt ? o[f.opt] : S.posVal(it, f.at), ov = oit ? (f.opt ? oo[f.opt] : S.posVal(oit, f.at)) : v, mod = !same(v ?? null, ov ?? null);
    const path = f.opt ? `S:${i}:opt:${f.opt}` : `S:${i}:pos:${f.at}`;
    return `<label class="ed-f${mod ? ' mod' : ''}"><span>${esc(f.label)}</span>${widget({ ...f, optional: f.optional || !!f.opt }, f.type === 'tri' && v !== undefined ? String(v) : v, path)}${mod ? `<small>原 ${esc(show(ov))}</small>` : ''}</label>`;
  }).join('');
  return `<div class="ed-form">${rows || '<small>这种积木没有参数</small>'}</div>`;
}
function readVal(el) {
  const t = el.dataset.t;
  if (t === 'bool') return el.checked;
  const raw = el.value.trim();
  if (raw === '') return undefined;
  if (t === 'int') return Math.round(+raw);
  if (t === 'num') return +raw;
  if (t === 'tri') return raw === 'true';
  if (t === 'list') return raw.split(/[,，\s]+/).filter(Boolean).map(Number).filter(n => isFinite(n));
  if (el.dataset.num) return +raw;
  return raw;
}
function setLevelField(c, p, v) {
  if (p === 'finale.boss.model') {
    if (!v) { delete c.finale.boss; return; }
    const b = c.finale.boss ||= { hp: 3000, sec: 8, slam: 2.6, m: c.ch >= 1 ? 150 : undefined };
    b.model = v; if (!b.name) b.name = BOSSES[v].name;
    if (b.m === undefined) delete b.m;
    return;
  }
  if (p === 'finale.after') { if (v) c.finale.after = v; else delete c.finale.after; if (v !== 'pick') delete c.finale.pick; return; }
  if (p === 'finale.ladder.steps') {
    if (!v || !v.length) { delete c.finale.ladder; return; }
    c.finale.ladder = { base: 120, ...(c.finale.ladder || {}), steps: v };
    return;
  }
  if (p === 'run.stand') { if (v) { c.run.stand = true; c.run.drift ||= 6; } else { delete c.run.stand; delete c.run.drift; } return; }
  if (v === false && /boss\.(big|dodgy)$/.test(p)) v = undefined;
  setPath(c, p, v);
}
function setItemField(c, path, v) {
  const [, si, kind, a, b] = path.split(':');
  const it = c.run.seq[+si], T = S.TOKENS[it[0]];
  if (kind === 'opt') {
    const o = S.optsOf(it, true), f = T.fields.find(q => q.opt === a);
    if (v === undefined || (v === false && f && f.type === 'bool')) delete o[a]; else o[a] = v;
    if (!Object.keys(o).length) it.pop();
    return;
  }
  if (kind === 'pos') {
    const at = +a;
    if (it[0] === 'g' && at === 3) {
      const hasThird = typeof it[3] === 'string';
      if (v === undefined) { if (hasThird) it.splice(3, 1); } else if (hasThird) it[3] = v; else it.splice(3, 0, v);
      return;
    }
    if (v === undefined) { const f = T.fields.find(q => q.at === at); if (f && f.optional && at === it.length - 1) it.pop(); else it[at] = f && f.def !== undefined && !f.optional ? f.def : null; }
    else it[at] = v;
    // positional values sit before the options object: pad with nulls if a later one was filled first
    for (let k = 1; k < it.length; k++) if (it[k] === undefined) it[k] = null;
    return;
  }
  if (kind === 'bar') {
    const f = T.fields.find(q => q.type === 'barrel' && q.at === +a);
    let bar = S.barrelOf(it, f);
    const j = +b;
    if (j === 0) {
      if (!v) { if (f.optional) it[f.at] = null; return; }
      const K = S.BARREL_KINDS[v];
      bar = [v, bar && bar[0] === v ? bar[1] : K.def, bar ? bar[2] : 30];
    } else { if (!bar) return; bar = [...bar]; bar[j] = v ?? (j === 2 ? 1 : 0); }
    S.setBarrel(it, f, bar);
  }
}

// ---------------------------------------------------------------- 全局
function pageGlobal() {
  const groups = [...new Set(PARAMS.map(p => p.group))];
  const changed = PARAMS.filter(p => Math.abs(p.get() - p.def) > 1e-9).length;
  return `<p class="ed-note">拖动时就生效的标「即时」；标「重开生效」的要点「重开本关」，标「下个 Boss 生效」的在下一个 Boss 出场时用上。改过 ${changed} 项。</p>`
    + groups.map(g => `<section><h4>${esc(g)}</h4>${PARAMS.filter(p => p.group === g).map(paramRow).join('')}</section>`).join('');
}
function paramRow(p) {
  const v = p.get(), mod = Math.abs(v - p.def) > 1e-9;
  return `<div class="ed-pr${mod ? ' mod' : ''}" data-row="${p.k}"><div class="ed-pr-h"><span>${esc(p.name)}</span><em class="w-${p.when}">${WHEN[p.when]}</em></div>
    <div class="ed-pr-c"><input type="range" data-k="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"><input type="number" data-k="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
    <small>原 ${p.def}</small><button type="button" data-preset="${p.k}" title="恢复 demo 的值"${mod ? '' : ' disabled'}>↺</button></div></div>`;
}
function onParamInput(el, final) {
  const p = PARAM[el.dataset.k];
  let v = +el.value;
  if (!isFinite(v)) return;
  v = Math.min(p.max, Math.max(p.min, v));
  setParam(p, v);
  const row = el.closest('[data-row]');
  row.querySelectorAll('[data-k]').forEach(q => { if (q !== el) q.value = v; });
  row.classList.toggle('mod', Math.abs(v - p.def) > 1e-9);
  row.querySelector('[data-preset]').disabled = Math.abs(v - p.def) < 1e-9;
  if (final && preDrag) { pushUndo(preDrag); preDrag = null; $('[data-tb="undo"]').disabled = false; }
}

// ---------------------------------------------------------------- 验关
function pageTest() {
  const bots = vt.bots || { best: true, mostly: true, random: true };
  return `<section><h4>自动验关 <small>用自动驾驶跑，跑的时候画面会快进</small></h4>
    <div class="ed-vt">
      <label>范围 <select id="vtScope"><option value="cur"${vt.scope === 'cur' ? ' selected' : ''}>本关（${esc(cur)}）</option><option value="all"${vt.scope === 'all' ? ' selected' : ''}>13 关</option></select></label>
      <span>走法 ${Object.entries(BOTS).map(([k, n]) => `<label><input type="checkbox" data-bot="${k}"${bots[k] ? ' checked' : ''}>${n}</label>`).join('')}</span>
      <label>每种 <input id="vtN" type="number" min="1" max="200" value="${vt.n || 20}"> 次</label>
      <button type="button" data-vt="go"${vt.running ? ' disabled' : ''}>开始</button><button type="button" data-vt="stop"${vt.running ? '' : ' disabled'}>停止</button>
    </div>
    <p class="ed-note">最优 = 每扇门都选最好的、会躲招；一般 = 70% 选对；乱走 = 随便走。13 关 × 3 种 × 20 次大约要 1 小时，可以先少跑几次。</p>
    <div class="ed-prog"><i style="width:${vt.total ? (100 * vt.k) / vt.total : 0}%"></i><span>${vt.total ? `${vt.k} / ${vt.total} 局${vt.eta ? ` · 约剩 ${vt.eta}` : ''}` : '还没跑'}</span></div>
    <div id="vtOut">${vtTables()}</div>
    ${vt.rows.length ? '<button type="button" data-vt="copy">复制表格（可直接贴进表格软件）</button>' : ''}</section>`;
}
const COLS = [
  ['关卡', r => r.label], ['走法', r => BOTS[r.bot]], ['局数', r => r.n], ['过关率', r => pct(r.pass)], ['带回兵', r => fmt(Math.round(r.home))],
  ['金币', r => kmb(r.coins)], ['剧本', r => (r.script ? kmb(r.script) : '—')], ['和剧本差（不含宝箱怪）', r => (r.diff === null ? '—' : (r.diff >= 0 ? '+' : '') + pct(r.diff))],
  ['打怪+Boss', r => kmb(r.kills)], ['兑换门', r => kmb(r.exch)], ['结尾', r => kmb(r.fin)], ['尸池/爆分', r => kmb(r.bonus)], ['宝箱怪', r => kmb(r.magic)],
];
function vtSums() {
  if (vt.scopeRan !== 'all') return [];
  return Object.keys(BOTS).filter(b => vt.rows.some(r => r.bot === b)).map(b => {
    const rs = vt.rows.filter(r => r.bot === b);
    return { label: `累计（${rs.length} 关）`, bot: b, n: rs[0].n, pass: rs.reduce((s, r) => s + r.pass, 0) / rs.length, home: rs.reduce((s, r) => s + r.home, 0) / rs.length,
      coins: rs.reduce((s, r) => s + r.coins, 0), script: rs.reduce((s, r) => s + r.script, 0), diff: null, kills: rs.reduce((s, r) => s + r.kills, 0),
      exch: rs.reduce((s, r) => s + r.exch, 0), fin: rs.reduce((s, r) => s + r.fin, 0), bonus: rs.reduce((s, r) => s + r.bonus, 0), magic: rs.reduce((s, r) => s + r.magic, 0) };
  });
}
function vtTables() {
  if (!vt.rows.length) return '';
  const rows = [...vt.rows, ...vtSums()];
  const maxG = Math.max(0, ...vt.rows.map(r => r.gates.length));
  return `<div class="ed-tbl"><table><thead><tr>${COLS.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.label.startsWith('累计') ? ' class="sum"' : ''}>${COLS.map(c => `<td>${esc(c[1](r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <h4>每扇门前的平均兵数</h4>
    <div class="ed-tbl"><table><thead><tr><th>关卡</th><th>走法</th>${Array.from({ length: maxG }, (_, k) => `<th>门${k + 1}</th>`).join('')}</tr></thead><tbody>${vt.rows.map(r => `<tr><td>${esc(r.label)}</td><td>${BOTS[r.bot]}</td>${Array.from({ length: maxG }, (_, k) => `<td>${r.gates[k] == null ? '' : fmt(Math.round(r.gates[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function vtTSV() {
  const rows = [...vt.rows, ...vtSums()];
  const t1 = [COLS.map(c => c[0]).join('\t'), ...rows.map(r => COLS.map(c => c[1](r)).join('\t'))];
  const maxG = Math.max(0, ...vt.rows.map(r => r.gates.length));
  const t2 = [['关卡', '走法', ...Array.from({ length: maxG }, (_, k) => `门${k + 1}`)].join('\t'), ...vt.rows.map(r => [r.label, BOTS[r.bot], ...Array.from({ length: maxG }, (_, k) => (r.gates[k] == null ? '' : Math.round(r.gates[k])))].join('\t'))];
  return t1.join('\n') + '\n\n每扇门前的平均兵数\n' + t2.join('\n');
}
async function runTests() {
  const scope = $('#vtScope').value, n = Math.max(1, Math.min(200, Math.round(+$('#vtN').value) || 20));
  const bots = Object.keys(BOTS).filter(k => root.querySelector(`[data-bot="${k}"]`).checked);
  if (!bots.length) return;
  vt = { ...vt, running: true, stop: false, rows: [], scope, scopeRan: scope, n, bots: Object.fromEntries(Object.keys(BOTS).map(k => [k, bots.includes(k)])), k: 0, total: 0, eta: '' };
  const jobs = scope === 'all' ? LEVELS.map((L, i) => ({ i, label: L.code, coins: L.coins })) : [{ i: levelIndex(cur), level: isCustom(cur) ? levelObj(cur) : null, label: cur, coins: levelObj(cur).coins }];
  const t0 = performance.now();
  runtime.pause = false;
  render();
  await runBatch(jobs, bots, n, {
    stop: () => vt.stop,
    onProgress: (k, total) => {
      vt.k = k; vt.total = total;
      const left = ((performance.now() - t0) / k) * (total - k) / 1000;
      vt.eta = left > 90 ? `${Math.round(left / 60)} 分钟` : `${Math.round(left)} 秒`;
      if (tab === 'test') { const p = $('.ed-prog'); if (p) { p.querySelector('i').style.width = `${(100 * k) / total}%`; p.querySelector('span').textContent = `${k} / ${total} 局 · 约剩 ${vt.eta}`; } }
    },
    onRow: row => { vt.rows.push(row); if (tab === 'test') { const o = $('#vtOut'); if (o) o.innerHTML = vtTables(); } },
  });
  vt.running = false; vt.eta = '';
  render();
}

// ---------------------------------------------------------------- 导入导出
function pageIO() {
  return `<section><h4>导出 <small>先过保存检查</small></h4>
      <div class="ed-btns"><button type="button" data-io="lvCopy">复制本关 JSON</button><button type="button" data-io="lvDl">下载本关</button>
      <button type="button" data-io="tuCopy">复制全局 JSON</button><button type="button" data-io="tuDl">下载全局</button><button type="button" data-io="allCopy">复制全部改动</button></div>
      <textarea id="ioOut" readonly placeholder="导出的内容会显示在这里（复制不了时可以手动全选）"></textarea></section>
    <section><h4>导入 <small>粘贴关卡 JSON、全局 JSON 或「全部改动」</small></h4>
      <textarea id="ioIn" placeholder='{"format":"gatefish-level/1","code":"T-1", ...}'></textarea>
      <div class="ed-btns"><button type="button" data-io="check">只检查</button><button type="button" data-io="import">检查并导入</button></div>
      <div id="ioMsg"></div>
      <p class="ed-note">编号和 13 关之一相同就替换那一关；不同就加成一个新关卡（下拉里带 ★）。格式见 docs/关卡配置格式.md。</p></section>
    <section><h4>新关卡</h4>
      <div class="ed-btns"><input id="ioCode" placeholder="编号，如 T-1"><input id="ioTitle" placeholder="关卡名"><button type="button" data-io="dup">复制本关为新关卡</button>${isCustom(cur) ? '<button type="button" data-io="delCustom">删除这个新关卡</button>' : ''}</div></section>
    <section><h4>恢复 demo 的数</h4>
      <div class="ed-btns"><button type="button" data-io="rsLevel">本关</button><button type="button" data-io="rsTune">全局</button><button type="button" data-io="rsAll">全部（含新关卡）</button></div></section>`;
}
const tuneJSON = () => ({ format: TUNE_FORMAT, values: Object.fromEntries(PARAMS.map(p => [p.k, p.get()])) });
function out(text, label) {
  const ta = $('#ioOut');
  ta.value = text;
  const msg = ok => { $('#ioMsg').innerHTML = `<div class="${ok ? 'ok' : ''}">${esc(label)}${ok ? ' 已复制' : '：没能自动复制，上面框里全选复制'}</div>`; };
  try { navigator.clipboard.writeText(text).then(() => msg(true), () => { ta.select(); msg(false); }); } catch (e) { ta.select(); msg(false); }
}
function download(text, name) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { /* the artifact viewer blocks downloads: copy instead */ }
  $('#ioOut').value = text;
}
function checkTune(j) {
  const errs = [];
  for (const [k, v] of Object.entries(j.values || {})) {
    const p = PARAM[k];
    if (!p) errs.push(`全局参数「${k}」不认识`);
    else if (typeof v !== 'number' || v < p.min || v > p.max) errs.push(`${p.name}（${k}）要在 ${p.min}～${p.max}，现在是 ${v}`);
  }
  return errs;
}
// what a pasted text is, and its problems
function inspect(text) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return { errs: [`不是合法的 JSON：${e.message}`] }; }
  if (j && j.format === TUNE_FORMAT) return { kind: 'tune', j, errs: checkTune(j) };
  if (j && j.format === ALL_FORMAT) {
    const errs = checkTune({ values: j.tune || {} });
    for (const c of [...(j.levels || []), ...(j.custom || [])]) for (const e of S.validate(c, (levelObj(c.code) || {}).teach)) errs.push(`${c.code}${e.at === null ? '' : ` 第 ${e.at + 1} 项`}：${e.msg}`);
    return { kind: 'all', j, errs };
  }
  const target = j && levelObj(j.code);
  return { kind: 'level', j, errs: S.validate(j, target && !isCustom(j.code) ? target.teach : []).map(e => (e.at === null ? e.msg : `第 ${e.at + 1} 项：${e.msg}`)) };
}
function importText(text, apply) {
  const r = inspect(text), msg = $('#ioMsg');
  if (r.errs.length) { msg.innerHTML = `<div class="bad">保存检查没过（${r.errs.length} 处），没有导入：</div>` + r.errs.map(e => `<div class="bad">· ${esc(e)}</div>`).join(''); return; }
  if (!apply) { msg.innerHTML = `<div class="ok">检查通过：${r.kind === 'tune' ? '全局参数' : r.kind === 'all' ? '全部改动' : `关卡 ${esc(r.j.code)}`}</div>`; return; }
  pushUndo();
  if (r.kind === 'tune') { for (const [k, v] of Object.entries(r.j.values)) setParam(PARAM[k], v); }
  else if (r.kind === 'all') {
    st.tune = { ...(r.j.tune || {}) }; st.levels = {}; st.custom = []; st.customOrig = {};
    for (const c of r.j.levels || []) st.levels[c.code] = c;
    for (const c of r.j.custom || []) { st.custom.push(c); st.customOrig[c.code] = clone(c); }
    applyAll();
  } else {
    const c = r.j;
    c.format = S.FORMAT; c.finale ||= {};
    if (!isCustom(c.code)) { if (same(c, ORIG[c.code])) delete st.levels[c.code]; else st.levels[c.code] = c; S.applyConfig(levelObj(c.code), c); }
    else {
      const k = st.custom.findIndex(q => q.code === c.code);
      if (k >= 0) st.custom[k] = c; else st.custom.push(c);
      st.customOrig[c.code] = clone(c);
      customObjs[c.code] = S.applyConfig(customObjs[c.code] || { run: {}, finale: {}, teach: [] }, c);
    }
    cur = c.code;
  }
  store(); dirty = true; render();
  $('#ioMsg').innerHTML = `<div class="ok">已导入${r.kind === 'level' ? ` ${esc(r.j.code)}，点「重开本关」试玩` : ''}</div>`;
}
function exportLevel(copy) {
  const c = cfgOf(cur), L = levelObj(cur), errs = S.validate(c, L.teach);
  if (errs.length) { $('#ioMsg').innerHTML = `<div class="bad">保存检查没过，不能导出：</div>` + errs.map(e => `<div class="bad">· ${e.at === null ? '' : `第 ${e.at + 1} 项：`}${esc(e.msg)}</div>`).join(''); return; }
  const text = JSON.stringify(c, null, 1);
  if (copy) out(text, `关卡 ${cur}`); else download(text, `level-${cur}.json`);
}

// ---------------------------------------------------------------- events
function onClick(e) {
  const t = e.target.closest('button, [data-act]');
  if (!t) return;
  const g = G.game;
  if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
  if (t.dataset.tb) {
    const k = t.dataset.tb;
    if (k === 'min') { document.body.classList.toggle('ed-min'); t.textContent = document.body.classList.contains('ed-min') ? '▴' : '▾'; return; }
    if (k === 'pause') runtime.pause = !runtime.pause;
    else if (k === 'sp') { save.speed = +t.dataset.v; G.ui.speedPill(); }
    else if (k === 'restart') { startFrom(0); return; }
    else if (k === 'from') { startFrom(Math.max(0, Math.round(+$('#edFrom').value || 1) - 1)); return; }
    else if (k === 'undo') { undo(); return; }
    render(); return;
  }
  if (t.dataset.reset) { const o = origOf(cur); edit(c => setLevelField(c, t.dataset.reset, clone(getPath(o, t.dataset.reset) ?? null) ?? undefined)); return; }
  if (t.dataset.preset) { const p = PARAM[t.dataset.preset]; pushUndo(); setParam(p, p.def); render(); return; }
  if (t.dataset.vt) {
    if (t.dataset.vt === 'go') runTests();
    else if (t.dataset.vt === 'stop') { vt.stop = true; }
    else if (t.dataset.vt === 'copy') { const text = vtTSV(); try { navigator.clipboard.writeText(text).then(() => { t.textContent = '已复制'; }, () => { t.textContent = '复制失败'; }); } catch (err) { t.textContent = '复制失败'; } }
    return;
  }
  if (t.dataset.io) {
    const k = t.dataset.io;
    if (k === 'lvCopy') exportLevel(true);
    else if (k === 'lvDl') exportLevel(false);
    else if (k === 'tuCopy') out(JSON.stringify(tuneJSON(), null, 1), '全局参数');
    else if (k === 'tuDl') download(JSON.stringify(tuneJSON(), null, 1), 'tune.json');
    else if (k === 'allCopy') out(JSON.stringify({ format: ALL_FORMAT, tune: st.tune, levels: Object.values(st.levels), custom: st.custom }, null, 1), '全部改动');
    else if (k === 'check') importText($('#ioIn').value, false);
    else if (k === 'import') importText($('#ioIn').value, true);
    else if (k === 'dup') {
      const code = $('#ioCode').value.trim(), title = $('#ioTitle').value.trim();
      if (!code || levelObj(code)) { $('#ioMsg') && ($('#ioMsg').innerHTML = `<div class="bad">${code ? `编号 ${esc(code)} 已经有了` : '先填一个新编号'}</div>`); return; }
      pushUndo();
      const c = { ...clone(cfgOf(cur)), code, title: title || cfgOf(cur).title + '（副本）' };
      st.custom.push(c); st.customOrig[code] = clone(c);
      customObjs[code] = S.applyConfig({ run: {}, finale: {}, teach: [] }, c);
      cur = code; store(); tab = 'level'; render();
    } else if (k === 'delCustom') {
      pushUndo();
      st.custom = st.custom.filter(c => c.code !== cur); delete st.customOrig[cur]; delete customObjs[cur];
      cur = LEVELS[0].code; store(); render();
    } else if (k === 'rsLevel') { pushUndo(); if (isCustom(cur)) commit(cur, clone(origOf(cur))); else { delete st.levels[cur]; S.applyConfig(levelObj(cur), ORIG[cur]); store(); dirty = true; render(); } }
    else if (k === 'rsTune') { pushUndo(); st.tune = {}; applyAll(); store(); render(); }
    else if (k === 'rsAll') { pushUndo(); st.tune = {}; st.levels = {}; st.custom = []; st.customOrig = {}; applyAll(); cur = isCustom(cur) ? LEVELS[0].code : cur; store(); dirty = true; render(); }
    return;
  }
  const act = t.dataset.act;
  if (!act) return;
  const row = t.closest('[data-i]'), i = row ? +row.dataset.i : +t.dataset.i;
  if (act === 'toggle') { openItems[i] = !openItems[i]; render(); }
  else if (act === 'play') { $('#edFrom').value = i + 1; startFrom(i); }
  else if (act === 'up' && i > 0) { edit(c => { const s = c.run.seq; [s[i - 1], s[i]] = [s[i], s[i - 1]]; }); swapOpen(i, i - 1); }
  else if (act === 'down') { const n = cfgOf(cur).run.seq.length; if (i < n - 1) { edit(c => { const s = c.run.seq; [s[i + 1], s[i]] = [s[i], s[i + 1]]; }); swapOpen(i, i + 1); } }
  else if (act === 'del') { edit(c => { c.run.seq.splice(i, 1); }); openItems = {}; }
  else if (act === 'ins') { insAt = i; render(); }
  else if (act === 'insCancel') { insAt = null; render(); }
  void g;
}
function swapOpen(a, b) { const x = openItems[a]; openItems[a] = openItems[b]; openItems[b] = x; render(); }
function onChange(e) {
  const el = e.target;
  if (el.dataset.ins !== undefined) {
    const k = el.value, at = +el.dataset.ins + 1;
    if (!k) return;
    insAt = null;
    edit(c => { c.run.seq.splice(at, 0, S.newToken(k)); });
    openItems = { [at]: true }; render();
    return;
  }
  if (el.id === 'vtScope') { vt.scope = el.value; return; }
  if (el.dataset.k) { onParamInput(el, true); return; }
  const p = el.dataset.p;
  if (!p) return;
  const v = readVal(el);
  if (p.startsWith('L:')) edit(c => setLevelField(c, p.slice(2), v));
  else if (p.startsWith('S:')) edit(c => setItemField(c, p, v));
}
function onInput(e) { if (e.target.dataset.k && e.target.type === 'range') onParamInput(e.target, false); }
