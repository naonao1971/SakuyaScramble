// canvas 側のレトロ描画ヘルパー。色は kit.css の :root トークンを実行時に読むので、
// ゲーム側で :root { --gold: ... } を上書きすれば canvas にもそのまま反映される
// （CSSとJSで色を二重管理しない）。
const TOKEN_NAMES = ["bg", "panel", "ink", "dim", "gold", "magenta", "danger"];
const FALLBACK = {
  bg: "#06070C",
  panel: "#120E1F",
  ink: "#E8ECF5",
  dim: "#7C8BA6",
  gold: "#E8C56A",
  magenta: "#FF2D9B",
  danger: "#FF4D2E",
};

// "#RRGGBB" → "rgba(r,g,b,a)"
export function alpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function createRetro(canvas, getFrame) {
  const ctx = canvas.getContext("2d");
  const colors = { ...FALLBACK };

  function readTokens() {
    const css = getComputedStyle(document.documentElement);
    for (const k of TOKEN_NAMES) {
      const v = css.getPropertyValue(`--${k}`).trim();
      if (v) colors[k] = v;
    }
  }
  readTokens();

  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  const R = {
    colors,
    readTokens,
    alpha,
    get reduceMotion() {
      return reduceMQ.matches;
    },
    // 欧文/数字は Press Start 2P、和文は DotGothic16 へ落ちる（和欧混植: 欧文先）
    font(px) {
      return `${px}px "Press Start 2P", "DotGothic16", monospace`;
    },
    fontBody(px) {
      return `${px}px "DotGothic16", "Press Start 2P", monospace`;
    },
    // 明滅は矩形波。フェードでなく本物のアーケードの点滅にする
    blinkOn(period = 30) {
      if (reduceMQ.matches) return true;
      return Math.floor(getFrame() / period) % 2 === 0;
    },
    // テロップの下敷き。琥珀のヘアラインだけで枠を作る（面には塗らない）
    panel(x, y, w, h) {
      ctx.save();
      ctx.fillStyle = "rgba(4, 6, 12, 0.82)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = alpha(colors.gold, 0.55);
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();
    },
    // 画像やモニタ窓の琥珀の額縁
    frame(x, y, w, h, a = 0.5) {
      ctx.save();
      ctx.strokeStyle = alpha(colors.gold, a);
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();
    },
    // タイトル画面の2行見出し（主題=金、副題=マゼンタ）
    titleText(title, subtitle, y = 48) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = colors.gold;
      ctx.font = R.font(30);
      ctx.fillText(title, canvas.width / 2, y);
      if (subtitle) {
        ctx.fillStyle = colors.magenta;
        ctx.font = R.font(12);
        ctx.fillText(subtitle, canvas.width / 2, y + 18);
      }
      ctx.restore();
    },
    // 画面中央のテロップ（GAME OVER / CLEAR / STAGE 1 など）
    caption(text, sub, color) {
      ctx.save();
      ctx.font = R.font(24);
      const w = Math.max(ctx.measureText(text).width + 60, 320);
      const h = sub ? 96 : 70;
      const x = (canvas.width - w) / 2;
      const y = (canvas.height - h) / 2;
      R.panel(x, y, w, h);
      ctx.textAlign = "center";
      ctx.fillStyle = color || colors.gold;
      ctx.fillText(text, canvas.width / 2, y + 44);
      if (sub) {
        ctx.font = R.fontBody(14);
        ctx.fillStyle = colors.ink;
        ctx.fillText(sub, canvas.width / 2, y + 76);
      }
      ctx.restore();
    },
    // 走査線とビネット。背景と地形にだけ敷き、キャラやイラストの上には乗せない
    // （画像の上に走査線が乗るとレトロではなく単に低解像度に見える）
    crt() {
      ctx.save();
      ctx.fillStyle = scanPattern();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = vignette();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
    // 一時停止の幕。中央に DOM の再開ボタンが重なるので、文字は上下に離す
    pauseOverlay(isMobile) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.fillStyle = colors.gold;
      ctx.font = R.font(28);
      ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2 - 50);
      if (R.blinkOn()) {
        ctx.fillStyle = colors.ink;
        ctx.font = R.font(11);
        ctx.fillText(
          isMobile ? "中央のボタンをタップして再開" : "Pキーまたは中央のボタンで再開",
          canvas.width / 2,
          canvas.height / 2 + 50
        );
      }
      ctx.restore();
    },
  };

  let scan = null;
  let vig = null;
  function scanPattern() {
    if (scan) return scan;
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 3;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,0.30)";
    g.fillRect(0, 0, 1, 1);
    scan = ctx.createPattern(c, "repeat");
    return scan;
  }
  function vignette() {
    if (vig) return vig;
    vig = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.78
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    return vig;
  }

  return R;
}
