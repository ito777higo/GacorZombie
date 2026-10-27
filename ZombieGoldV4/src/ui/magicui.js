// 宝箱怪战利品：开奖模块和数值沿用 V9.5，界面使用演员表中的 Spine 头像和补给卡。
// 四张战利品牌先相加，中间倍率牌最后相乘；另一种开奖模式直接给 ×50。
import { generateReward, defaultConfig } from '../magic/seal.js';
import { targetCard, targetCardName } from '../view/cast.js';
import { fmt, kmb, easeOut } from '../sim/util.js';
import { sfx, duck, unduck } from '../platform/audio.js';
import { gameSpeed } from '../platform/save.js';

const $ = s => document.querySelector(s);
const SP = gameSpeed;
const wait = ms => new Promise(r => setTimeout(r, ms / SP()));

// 一星 follows a fixed script (策划案: 一星按固定剧本送): mode 2, one card of each colour, ratio ×3 → ×1,419
const SCRIPT = { ratio: 3, cards: [6, 17, 56, 70] };

const card = id => defaultConfig.fishCardList.find(c => c.id === id);
export function magicResult({ cannon, scripted }) {
  if (!scripted) return generateReward({ cannon });
  const cards = SCRIPT.cards.map(id => { const c = card(id); return { cardId: c.id, value: c.value, label: c.label }; });
  const cardTotal = cards.reduce((a, c) => a + c.value, 0), multiple = cardTotal * SCRIPT.ratio;
  return { stage: 2, multiple, cannon, bulletMulti: 1, reward: multiple * cannon, ratioCard: SCRIPT.ratio, cardTotal, cards, cardIds: cards.map(c => c.cardId) };
}
const lootTitle = () => '<div class="mg-title"><small>失落补给</small><strong>宝箱怪战利品</strong></div>';
const chestPortrait = cls => `<img class="${cls}" src="${targetCard(69)}" alt="宝箱怪">`;

export function magicIntro() {
  let el = $('#mgIntro');
  if (!el) { el = document.createElement('div'); el.id = 'mgIntro'; el.className = 'mg-intro'; $('#frame').appendChild(el); }
  el.innerHTML = `${chestPortrait('mi-chest')}<b class="mi-title">发现宝箱怪</b><span>击败它，夺回物资 · 最高 ×6000</span>`;
  el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  sfx('boss');
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600 / SP());
}

// res: magicResult(); cannon: coins per ×1 (the 炮倍). Resolves when the board shows the final score.
export function magicFlip(res, { cannon, where = '' } = {}) {
  // the cards and the win screen have the stage: the music steps back until they are done
  duck(60, 0.35);
  return new Promise(r => {
    const resolve = v => { unduck(); r(v); };
    const ov = $('#ovMagic') || (() => { const d = document.createElement('div'); d.id = 'ovMagic'; d.className = 'ov ov-magic'; $('#frame').appendChild(d); return d; })();
    if (res.stage === 1) {
      // mode 1: the 宝箱怪 spits out ×50; no cards
      ov.innerHTML = `<div class="mg mg-one">${lootTitle()}
        ${chestPortrait('mg-chest')}<div class="mg-x">×50</div>
        <div class="mg-board"><small>回收金币</small><b id="mgScore">0</b></div>
        <p class="mg-tip">宝箱怪吐出 ×50 · 炮倍 ${kmb(cannon)}</p></div>`;
      ov.hidden = false; sfx('bigwin', 0);
      roll(ov.querySelector('#mgScore'), 0, res.reward, 1100).then(() => wait(900)).then(async () => { ov.hidden = true; await magicWin(res); resolve(res); });
      return;
    }
    // as the 二人捕鱼 screen: five cards in one row, the ratio card (rainbow) in the middle. A fish card opens on
    // its name (top), its fish and what it pays at this 炮倍 (bottom); the board above adds them up as they open.
    const slots = [res.cards[0], res.cards[1], { ratio: res.ratioCard }, res.cards[2], res.cards[3]];
    const cardHtml = (c, i) => {
      const front = c.ratio
        ? `<span class="mg-star" aria-hidden="true">✦</span><b class="mg-v ratio">×${c.ratio}</b><small class="mg-nm">补给倍率</small>`
        : `<small class="mg-nm">${targetCardName(c.cardId)}</small><img class="mg-fish" src="${targetCard(c.cardId)}" alt=""><b class="mg-v">${fmt(c.value * cannon)}</b><em class="mg-x1">×${c.value}</em>`;
      return `<button class="mg-card ${c.ratio ? 'ratio' : ''}" data-i="${i}" type="button" aria-label="翻开第 ${i + 1} 张补给卡" style="--d:${i * 0.09}s;--loot:${c.ratio ? 6 : c.label}">
        <div class="mg-in"><div class="mg-back"><span>✚</span><small>待回收</small></div>
        <div class="mg-front">${front}</div></div></button>`;
    };
    ov.innerHTML = `<div class="mg mg5">${lootTitle()}${chestPortrait('mg-chest small')}<div class="mg-board top"><small>已回收金币</small><b id="mgScore">0</b></div>
      <div class="mg-row5">${slots.map(cardHtml).join('')}</div>
      <em class="mg-sum" id="mgSum">怪牌 0 · 炮倍 ${kmb(cannon)}</em>
      <p class="mg-tip">点牌翻开 · <b id="mgCd">15</b> 秒内不选就自动翻开${where ? ` · ${where}` : ''}</p>
      <div class="mg-acts"><button class="btn btn-yellow" id="mgAuto" type="button">自动翻牌</button><button class="btn btn-dark" id="mgSkip" type="button">跳过</button></div></div>`;
    ov.hidden = false;
    sfx('whoosh');
    const els = [...ov.querySelectorAll('.mg-card')], score = ov.querySelector('#mgScore'), sumEl = ov.querySelector('#mgSum'), cdEl = ov.querySelector('#mgCd');
    let shown = 0, fishSum = 0, opened = 0, finished = false;
    let busy = Promise.resolve();
    // the countdown, as the game shows it under the cards
    let cd = 15;
    const tick = setInterval(() => { cd = Math.max(0, cd - 1); if (cdEl) cdEl.textContent = cd; }, 1000 / SP());
    const flip = i => {
      const el = els[i];
      if (!el || el.classList.contains('open')) return;
      el.classList.add('open'); opened++;
      sfx('pop', 6 + i);
      const c = slots[i];
      if (c.ratio) el.classList.add('glow');
      else {
        // the card's score flies to the board and rolls in, one after another
        busy = busy.then(async () => {
          await wait(260);
          const add = c.value * cannon;
          el.classList.add('fly');
          fishSum += c.value;
          sumEl.textContent = `怪牌 ${fishSum} · 炮倍 ${kmb(cannon)}`;
          await roll(score, shown, shown + add, 520); shown += add;
          sfx('coinTick', 10);
        });
      }
      if (opened === 5) finish();
    };
    const finish = async () => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearInterval(tick);
      ov.querySelector('.mg-tip').hidden = true; ov.querySelector('.mg-acts').hidden = true;
      await busy;
      // the ratio card goes last: the board flashes the fish total, then multiplies
      const r = els[2]; r.classList.add('fly', 'big');
      await wait(450);
      sfx('bigwin', 1);
      const board = ov.querySelector('.mg-board'); board.classList.add('boom');
      sumEl.textContent = `怪牌 ${res.cardTotal} × 倍率 ${res.ratioCard} = ×${fmt(res.multiple)}`;
      await roll(score, shown, res.reward, 900);
      await wait(700);
      ov.hidden = true;
      await magicWin(res);
      resolve(res);
    };
    const autoAll = async () => { for (const i of [0, 1, 3, 4, 2]) { if (!els[i].classList.contains('open')) { flip(i); await wait(380); } } };
    els.forEach((el, i) => el.addEventListener('click', () => flip(i)));
    ov.querySelector('#mgAuto').onclick = () => { sfx('ui'); autoAll(); };
    ov.querySelector('#mgSkip').onclick = () => { sfx('ui'); for (const i of [0, 1, 3, 4, 2]) flip(i); };
    // as in the game: 15 s without a tap flips the rest automatically
    const timer = setTimeout(autoAll, 15000 / SP());
    window.__gfMagicAuto = autoAll;    // test hook
  });
}

// 回收完成：同一笔开奖，只替换末日题材画面。
export function magicWin(res) {
  return new Promise(resolve => {
    let el = $('#mgWin');
    if (!el) { el = document.createElement('div'); el.id = 'mgWin'; el.className = 'ov mg-win'; $('#frame').appendChild(el); }
    const coins = Array.from({ length: 26 }, (_, i) => `<i class="mw-coin" style="left:${(i * 37) % 100}%;--d:${((i * 0.13) % 1.2).toFixed(2)}s;--s:${(0.7 + (i % 5) * 0.12).toFixed(2)}"></i>`).join('');
    el.innerHTML = `<div class="mw-rain">${coins}</div><div class="mw">${chestPortrait('mw-chest')}
      <div class="mw-ribbon"><span>物资回收成功</span><small>宝箱怪战利品</small><b id="mwNum">0</b></div>
      <p class="mw-sub">${res.stage === 1 ? '×50' : `怪牌 ${res.cardTotal} × 倍率 ${res.ratioCard}`} = ×${fmt(res.multiple)} · 炮倍 ${kmb(res.cannon)}</p><p class="mw-tap">点击收下</p></div>`;
    el.hidden = false;
    sfx('bigwin', 2);
    let closed = false;
    const close = () => { if (closed) return; closed = true; el.hidden = true; el.onclick = null; clearTimeout(t); resolve(); };
    roll(el.querySelector('#mwNum'), 0, res.reward, 1400).then(() => { t = setTimeout(close, 1600 / SP()); });
    let t = setTimeout(close, 6000 / SP());
    el.onclick = close;
    window.__gfMagicWin = close;
  });
}

function roll(el, from, to, ms) {
  return new Promise(r => {
    const t0 = performance.now(), dur = ms / SP();
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(from + (to - from) * easeOut(k));
      if (k < 1) requestAnimationFrame(step); else r();
    };
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = fmt(to); r(); }, dur + 400);   // rAF is throttled in a hidden tab
  });
}
