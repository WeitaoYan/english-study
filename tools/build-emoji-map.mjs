// 从 emojilib 关键词 + Unicode emoji-test 分组，生成单词 → Twemoji 表情映射（卡通优先第一路）。
// 只收允许的分组（去掉 Flags / Symbols 等容易错配的组），另有手工 DENYLIST 剔错配。
// 用法：node tools/build-emoji-map.mjs   （读 /tmp/emojilib.json、/tmp/emoji-test.txt、/tmp/words.json，
//   写 tools/emoji-word-map.json，并打印映射表供人工复核）
import fs from 'node:fs';

const ALLOWED_GROUPS = new Set([
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
]);

// 人工剔除：功能词、抽象词、颜色词之外的错配（关键词对上但图不对题，
// 或没法用一张卡通图讲清的词）。这些词不走 Twemoji，直接进插画/照片兜底。
// 2026-11-13 通读 974 条映射后定稿。
const DENYLIST = new Set([
  'a', 'above', 'accident', 'activity', 'add', 'address', 'alone', 'amount',
  'an', 'and', 'away', 'back', 'band', 'behind', 'best', 'between', 'big',
  'board', 'bottom', 'branch', 'but', 'button', 'cancer', 'card', 'casual', 'catch',
  'cause', 'century', 'ceremony', 'chinese', 'circle', 'classroom', 'clean',
  'club', 'comic', 'corner', 'cover', 'cross', 'curious', 'dairy', 'dark',
  'data', 'december', 'desk', 'dial', 'die', 'direct', 'dirt', 'disaster',
  'display', 'dot', 'double', 'down', 'early', 'edge', 'eighth', 'emergency',
  'empty', 'engine', 'exam', 'expensive', 'express', 'fail', 'fall', 'fashion',
  'fast', 'field', 'fight', 'first', 'flat', 'floor', 'fresh', 'from', 'front',
  'future', 'gate', 'go', 'golden', 'good', 'great', 'ground', 'hard', 'harm',
  'help', 'hide', 'high', 'horn', 'hour', 'i', 'improve', 'in', 'information',
  'ink', 'iron', 'keep', 'kick', 'kitchen', 'knee', 'landscape', 'large',
  'last', 'lawn', 'lead', 'left', 'life', 'line', 'little', 'load', 'lonely',
  'long', 'machine', 'mark', 'market', 'me', 'medium', 'merry', 'metal',
  'middle', 'mug', 'national', 'neck', 'net', 'note', 'not', 'off', 'on', 'or',
  'order', 'out', 'over', 'part', 'passenger', 'place', 'pool', 'price',
  'primary', 'print', 'progress', 'public', 'push', 'quiz', 'record', 'regular',
  'remove', 'rise', 'roll', 'roof', 'room', 'round', 'rude', 'save', 'score',
  'season', 'set', 'side', 'sign', 'silly', 'size', 'small', 'sport', 'square',
  'step', 'stick', 'still', 'table', 'team', 'teenager', 'text', 'the',
  'thirty', 'this', 'throw', 'thumb', 'tidy', 'top', 'tour', 'transport',
  'turn', 'twenty', 'ugly', 'under', 'warm', 'way', 'wear', 'well', 'what',
  'when', 'wide', 'with', 'without', 'year', 'you',
]);

// 人工纠正：打分也救不回来的，指定正确的表情。2026-11-13 通读后定稿。
const OVERRIDES = {
  arm: '💪', art: '🎨', autumn: '🍂', bad: '👎', ball: '⚽', bamboo: '🎋',
  bath: '🛁', boat: '⛵', body: '🧍', break: '💔', bubble: '🫧',
  cabbage: '🥬', cake: '🎂', cap: '🧢', car: '🚗', cash: '💵', chain: '⛓️',
  cherry: '🍒', children: '🧒', coffee: '☕', computer: '💻', country: '🌍',
  cry: '😭', cut: '✂️', cute: '🥰', cycle: '🚲', dancer: '💃',
  delicious: '😋', diamond: '💎', dish: '🍽️', exercise: '🏃', eye: '👁️',
  farm: '🚜', festival: '🎊', finger: '☝️', fire: '🔥', fisherman: '🎣',
  flag: '🚩', flower: '🌸', food: '🍔', football: '⚽', four: '🕓',
  friend: '🤝', glove: '🧤', gold: '🥇', harvest: '🌾', head: '🙂',
  hello: '👋', home: '🏠', horse: '🐴', human: '🧑', hurt: '🤕', ice: '🧊',
  instrument: '🎻', kid: '🧒', lady: '👩', lantern: '🏮', library: '📚',
  light: '💡', lock: '🔒', luck: '🍀', map: '🗺️', mask: '😷', moon: '🌙',
  mother: '👩', nation: '🌍', nature: '🌳', no: '🙅', ocean: '🌊',
  paper: '📄', parent: '🧑', people: '👥', photo: '📸', plane: '✈️',
  play: '🎮', rice: '🍚', sea: '🌊', shirt: '👕', shop: '🏬', smile: '😊',
  son: '👦', sound: '🔊', soup: '🍲', spring: '🌷', swim: '🏊',
  teach: '🧑‍🏫', thanks: '🙏', tie: '👔', treasure: '💰', two: '🕑',
  walk: '🚶', water: '💧', weather: '🌤️', worker: '👷',
};

function stripFe0f(s) {
  return [...s].filter((ch) => ch.codePointAt(0) !== 0xfe0f).join('');
}

// 解析 emoji-test.txt：fully-qualified 表情 → 分组
const groupOf = new Map();
{
  let group = '';
  for (const line of fs.readFileSync('/tmp/emoji-test.txt', 'utf8').split('\n')) {
    const g = line.match(/^# group: (.+)$/);
    if (g) {
      group = g[1].trim();
      continue;
    }
    const m = line.match(/^([0-9A-F ]+)\s+;\s+fully-qualified\s+#\s+(\S+)/);
    if (!m) continue;
    const emoji = String.fromCodePoint(...m[1].trim().split(/\s+/).map((h) => parseInt(h, 16)));
    groupOf.set(emoji, group);
    groupOf.set(stripFe0f(emoji), group);
  }
}

const emojilib = JSON.parse(fs.readFileSync('/tmp/emojilib.json', 'utf8'));
const words = JSON.parse(fs.readFileSync('/tmp/words.json', 'utf8'));

const map = {};
const byGroup = {};
let noGroup = 0;
for (const w of words) {
  const key = w.toLowerCase().trim();
  if (DENYLIST.has(key)) continue;
  if (OVERRIDES[key]) {
    map[key] = OVERRIDES[key];
    continue;
  }
  // 打分：关键词是 red_apple、drop_of_blood 这类下划线短语，先拆成词再匹配；
  // 分 = 关键词序号 × 10 + 词在短语里的位置，越小越准。
  // 如 apple：🍎 的 "red_apple" 得 1 分，📱 的 "apple" 得 20 分，🍎 胜出。
  let best = null;
  let bestScore = Infinity;
  for (const [emoji, kws] of Object.entries(emojilib)) {
    for (let ki = 0; ki < kws.length; ki++) {
      const tokens = String(kws[ki]).toLowerCase().split(/[_\s]+/);
      const ti = tokens.indexOf(key);
      if (ti < 0) continue;
      const score = ki * 10 + ti;
      if (score >= bestScore) break; // 同一表情内后面的关键词只会更差
      const group = groupOf.get(emoji) || groupOf.get(stripFe0f(emoji));
      if (!group || !ALLOWED_GROUPS.has(group)) break; // 不允许的组（如国旗/符号）直接跳过
      best = emoji;
      bestScore = score;
    }
  }
  if (best) {
    map[key] = best;
    const group = groupOf.get(best) || groupOf.get(stripFe0f(best));
    byGroup[group] = (byGroup[group] || 0) + 1;
  }
}

fs.writeFileSync(
  '/home/hatch/workspace/english-study/tools/emoji-word-map.json',
  JSON.stringify(map, null, 2) + '\n',
);
console.log(`单词总数: ${words.length}，映射到卡通表情: ${Object.keys(map).length}`);
console.log('按分组：', JSON.stringify(byGroup));
console.log('--- 映射表（供人工复核）---');
for (const [w, e] of Object.entries(map)) console.log(`${w} ${e}`);
