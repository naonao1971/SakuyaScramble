// 1プレイの中で使う、シリーズお決まりの仕組み。どれも使わなくてよい（使う分だけ呼ぶ）。
//   kit.score      スコア・エクステンド(1UP)・ハイスコア保存
//   kit.lives      残機
//   kit.checkpoint 復活地点
//   kit.cnp.run    このプレイで回収した CNP（ロスターの光り方まで）
//   kit.hud        上の4つを、全タイトル同じ見た目で描く
// start() のたびに kit が reset する。

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}
function readNum(key) {
  try {
    return Number(storage().getItem(key)) || 0;
  } catch (e) {
    return 0;
  }
}
function writeNum(key, v) {
  try {
    storage().setItem(key, String(v));
  } catch (e) {
    /* 保存できない環境でも遊べる */
  }
}

// extendEvery: この点数ごとに残機+1（0なら無し）。hiScoreKey: 旧版のキーを引き継ぐとき指定
export function createScore({ gameId, hiScoreKey, extendEvery = 0, onExtend }) {
  const key = hiScoreKey || `sakuya-kit:hi:${gameId}`;
  const S = {
    value: 0,
    hi: readNum(key),
    newRecord: false,
    _nextExtend: extendEvery,
    add(n) {
      S.value = Math.max(0, S.value + Math.floor(n));
      if (extendEvery > 0) {
        while (S.value >= S._nextExtend) {
          S._nextExtend += extendEvery;
          if (onExtend) onExtend();
        }
      }
      return S.value;
    },
    set(v) {
      S.value = Math.max(0, Math.floor(v));
    },
    // ハイスコアを更新したら保存する（gameOver で kit が呼ぶ）
    commit(finalScore = S.value) {
      if (finalScore > S.hi) {
        S.hi = finalScore;
        S.newRecord = true;
        writeNum(key, finalScore);
      }
      return S.newRecord;
    },
    reset() {
      S.value = 0;
      S.newRecord = false;
      S._nextExtend = extendEvery;
    },
  };
  return S;
}

export function createLives({ start = 3, max = 9 } = {}) {
  const L = {
    start,
    value: start,
    lose() {
      L.value = Math.max(0, L.value - 1);
      return L.value;
    },
    gain(n = 1) {
      L.value = Math.min(max, L.value + n);
      return L.value;
    },
    reset() {
      L.value = start;
    },
  };
  return L;
}

export function createCheckpoint() {
  const C = {
    value: null,
    index: 0,
    set(v, index) {
      C.value = v;
      if (typeof index === "number") C.index = index;
    },
    reset() {
      C.value = null;
      C.index = 0;
    },
  };
  return C;
}

// このプレイで回収したCNP。ch.no（1始まり）で扱う
export function createCnpRun(cnp, { flashFrames = 45, uncollectedBoost = 5 } = {}) {
  const n = cnp.chars.length;
  const R = {
    got: new Array(n).fill(false),
    flash: new Array(n).fill(0),
    // 新しく回収したら true（2回目以降は false）。取った瞬間にロスターの枠が光る
    collect(no) {
      const i = no - 1;
      if (i < 0 || i >= n) return false;
      R.flash[i] = flashFrames;
      if (R.got[i]) return false;
      R.got[i] = true;
      return true;
    },
    has: (no) => !!R.got[no - 1],
    get count() {
      return R.got.filter(Boolean).length;
    },
    get complete() {
      return R.count === n;
    },
    list() {
      const out = [];
      R.got.forEach((g, i) => g && out.push(i + 1));
      return out;
    },
    // 出現させるキャラを選ぶ。weight(ch) を渡せばレア度などで重み付けできる。
    // まだ取っていないキャラは uncollectedBoost 倍出やすい（同じキャラばかり出て集まらないのを防ぐ）
    pick(weight) {
      const w = (ch) => (weight ? weight(ch) : 1) * (R.got[ch.index] ? 1 : uncollectedBoost);
      let total = 0;
      for (const ch of cnp.chars) total += w(ch);
      let r = Math.random() * total;
      for (const ch of cnp.chars) {
        r -= w(ch);
        if (r <= 0) return ch;
      }
      return cnp.chars[0];
    },
    tick() {
      for (let i = 0; i < n; i++) if (R.flash[i] > 0) R.flash[i]--;
    },
    reset() {
      R.got.fill(false);
      R.flash.fill(0);
    },
  };
  return R;
}

// HUD。位置は 960x540 の既定配置（引数で変えられる）
export function createHud({ ctx, canvas, retro, score, lives, cnp, run }) {
  const c = retro.colors;
  const H = {
    // 左上: SCORE（金）/ 数字（白・7桁）/ HI（減光）
    score({ x = 16, y = 24, value = score.value, hi = true } = {}) {
      ctx.save();
      ctx.textAlign = "left";
      ctx.font = retro.font(12);
      ctx.fillStyle = c.gold;
      ctx.fillText("SCORE", x, y);
      ctx.fillStyle = c.ink;
      ctx.fillText(String(Math.floor(value)).padStart(7, "0"), x, y + 18);
      if (hi) {
        ctx.fillStyle = c.dim;
        ctx.font = retro.font(8);
        ctx.fillText("HI " + String(Math.max(score.hi, Math.floor(value))).padStart(7, "0"), x, y + 34);
      }
      ctx.restore();
    },
    // 上段中央: CNP 11体の額縁。取った枠は絵とキャラ色の縁、まだの枠はシルエット
    roster({ y = 10, slot = 30, gap = 4, count = true } = {}) {
      if (!cnp || !run) return;
      const n = cnp.chars.length;
      const total = n * slot + (n - 1) * gap;
      const x0 = Math.round((canvas.width - total) / 2);
      ctx.save();
      cnp.chars.forEach((ch, i) => {
        const x = x0 + i * (slot + gap);
        const got = run.got[i];
        ctx.fillStyle = "rgba(4,6,12,0.7)";
        ctx.fillRect(x, y, slot, slot);
        if (got) cnp.draw(ctx, ch, x + slot / 2, y + slot / 2, slot - 2);
        else cnp.drawSilhouette(ctx, ch, x + slot / 2, y + slot / 2, slot - 2);
        ctx.strokeStyle = got ? `hsl(${ch.hue},80%,60%)` : retro.alpha(c.gold, 0.35);
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, slot - 2, slot - 2);
        if (run.flash[i] > 0 && Math.floor(run.flash[i] / 4) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillRect(x, y, slot, slot);
        }
      });
      if (count) {
        ctx.font = retro.font(8);
        ctx.fillStyle = c.gold;
        ctx.textAlign = "center";
        ctx.fillText(`CNP ${run.count}/${n}`, canvas.width / 2, y + slot + 14);
      }
      ctx.restore();
    },
    // 残機: アイコン(文字) × 数
    lives({ x = canvas.width - 16, y = 30, icon = "♥", value = lives ? lives.value : 0 } = {}) {
      ctx.save();
      ctx.textAlign = "right";
      ctx.font = retro.font(12);
      ctx.fillStyle = c.magenta;
      const t = `×${Math.max(0, value)}`;
      ctx.fillText(t, x, y);
      const w = ctx.measureText(t).width;
      ctx.fillText(icon, x - w - 6, y);
      ctx.restore();
    },
    // 燃料などのゲージ。残り25%未満で橙赤に変わる
    gauge({ label = "FUEL", ratio = 1, x = canvas.width - 176, y = 44, w = 160, h = 10, warnBelow = 0.25 } = {}) {
      const r = Math.max(0, Math.min(1, ratio));
      ctx.save();
      ctx.textAlign = "left";
      ctx.font = retro.font(8);
      ctx.fillStyle = c.dim;
      ctx.fillText(label, x, y - 3);
      ctx.fillStyle = "rgba(4,6,12,0.7)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = r < warnBelow ? c.danger : c.gold;
      ctx.fillRect(x + 2, y + 2, Math.round((w - 4) * r), h - 4);
      ctx.strokeStyle = retro.alpha(c.gold, 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.restore();
    },
  };
  return H;
}
