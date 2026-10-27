import defaultConfig from './config.js';
export { defaultConfig };

function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new RangeError(`${name} must be a safe integer >= ${min}`);
  return value;
}

function pick(items, weightOf, random) {
  if (!Array.isArray(items) || !items.length) throw new Error('Empty weighted pool');
  const weights = items.map(item => integer(weightOf(item), 'weight'));
  const total = integer(weights.reduce((a, b) => a + b, 0), 'total weight', 1);
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('random() must return a number in [0, 1)');
  const ticket = Math.floor(value * total);
  let sum = 0;
  return items.find((_, i) => (sum += weights[i]) > ticket);
}

/** Match GetMagicConf: use the arena replacement when present, otherwise the root. */
export function getConfig(arenaId, config = defaultConfig) {
  if (arenaId !== undefined) integer(arenaId, 'arenaId');
  return config.ReplacementMap?.[arenaId] ?? config;
}

/** Generate one reward AFTER capture succeeds. No hit, wallet, or presentation logic. */
export function generateReward({ arenaId, cannon = 1, bulletMulti = 1, random = Math.random, config = defaultConfig } = {}) {
  integer(cannon, 'cannon', 1);
  integer(bulletMulti, 'bulletMulti', 1);
  const conf = getConfig(arenaId, config);
  const stage = pick(conf.stagesInfo, item => item.weight, random);
  let ratioCard = 0;
  let cardTotal = 0;
  let multiple;
  const cards = [];
  if (stage.level === 1) {
    multiple = integer(stage.score, 'stage score');
  } else if (stage.level === 2) {
    // Go GetWeight uses int(ratio * 1000), i.e. truncation, not rounding.
    const weight = item => {
      if (!Number.isFinite(item.ratio) || item.ratio < 0) throw new RangeError('Invalid ratio');
      return Math.trunc(item.ratio * 1000);
    };
    ratioCard = integer(pick(conf.ratioCardList, weight, random).value, 'ratio card');
    integer(conf.fishCardNum, 'fishCardNum', 1);
    for (let i = 0; i < conf.fishCardNum; i++) {
      const card = pick(conf.fishCardList, weight, random);
      cardTotal = integer(cardTotal + integer(card.value, 'card value'), 'card total');
      cards.push({ cardId: card.id, value: card.value, label: card.label });
    }
    multiple = integer(cardTotal * ratioCard, 'multiple');
  } else {
    throw new Error(`Invalid stage: ${stage.level}`);
  }
  const reward = integer(integer(cannon * bulletMulti, 'effective cannon') * multiple, 'reward');
  return { stage: stage.level, multiple, cannon, bulletMulti, reward, ratioCard, cardTotal, cards, cardIds: cards.map(card => card.cardId) };
}
