// タイトル表記・OGP・アイコン・<head> をシリーズ共通の形にそろえる。
// tools/ogp.html から使う（ゲーム本体の実行時には読まない）。
//
// OGP は X / LINE / Discord のクローラが <head> を静的に読んで作るので、
// JavaScript で差し込んでも効かない。ここで作った <head> と画像をファイルとして置く。

export const OGP_W = 1200;
export const OGP_H = 630;

const T = {
  bg: "#06070C",
  ink: "#E8ECF5",
  dim: "#7C8BA6",
  gold: "#E8C56A",
  magenta: "#FF2D9B",
  edgeHi: "#2A3242",
  edgeLo: "#05060A",
};
const FONT_DISPLAY = '"Press Start 2P", "DotGothic16", monospace';
const FONT_BODY = '"DotGothic16", "Press Start 2P", monospace';

// "- RESCUE 11 CNP -" → "RESCUE 11 CNP"
export function bareSubtitle(sub) {
  return String(sub || "").trim().replace(/^[-‐–—─]\s*/, "").replace(/\s*[-‐–—─]$/, "").trim();
}

// <title> と og:title の表記。例: "SAKUYA SCRAMBLE ─ RESCUE 11 CNP"
export function pageTitle(meta) {
  const sub = bareSubtitle(meta.subtitle);
  return sub ? `${meta.title} ─ ${sub}` : meta.title;
}

function cover(sw, sh, dw, dh, fx = 0.5, fy = 0.5) {
  const s = Math.max(dw / sw, dh / sh);
  const w = dw / s;
  const h = dh / s;
  return { sx: (sw - w) * fx, sy: (sh - h) * fy, sw: w, sh: h };
}

function fitFont(ctx, text, family, maxPx, minPx, maxWidth) {
  let px = maxPx;
  for (; px > minPx; px -= 2) {
    ctx.font = `${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.font = `${px}px ${family}`;
  return px;
}

function scanlines(ctx, x, y, w, h, alpha = 0.22) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let yy = y; yy < y + h; yy += 3) ctx.fillRect(x, yy, w, 1);
  ctx.restore();
}

// 筐体のベゼル（金のヘアライン＋ハードな2色の縁）
function bezel(ctx, w, h, inset, line) {
  ctx.save();
  ctx.strokeStyle = T.edgeLo;
  ctx.lineWidth = line * 2;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.strokeStyle = T.gold;
  ctx.lineWidth = line;
  ctx.strokeRect(inset + line / 2, inset + line / 2, w - inset * 2 - line, h - inset * 2 - line);
  ctx.restore();
}

// OGP画像 1200x630。絵柄はタイトルごとに違ってよく、そろえるのはサイズと作り方だけ。
//   style = "plain" : キービジュアルを 1200x630 に切り抜くだけ（既定。絵をそのまま見せる）
//   style = "series": さらに左下に「主題(金)／副題(マゼンタ)」、左上にシリーズ名、
//                     右下にドメイン、外周に金の枠を重ねる
export function drawOgp(canvas, meta, image, opts = {}) {
  const { focusX = 0.5, focusY = 0.5, style = "plain" } = opts;
  canvas.width = OGP_W;
  canvas.height = OGP_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, OGP_W, OGP_H);

  if (image && (image.naturalWidth || image.width)) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const c = cover(iw, ih, OGP_W, OGP_H, focusX, focusY);
    ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, 0, 0, OGP_W, OGP_H);
  } else {
    scanlines(ctx, 0, 0, OGP_W, OGP_H, 0.35);
  }
  if (style !== "series") return canvas;

  // 文字の下敷き: 下からの暗幕＋左上の角
  let g = ctx.createLinearGradient(0, OGP_H * 0.45, 0, OGP_H);
  g.addColorStop(0, "rgba(6,7,12,0)");
  g.addColorStop(0.55, "rgba(6,7,12,0.78)");
  g.addColorStop(1, "rgba(6,7,12,0.94)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OGP_W, OGP_H);
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, 420);
  g.addColorStop(0, "rgba(6,7,12,0.7)");
  g.addColorStop(1, "rgba(6,7,12,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OGP_W, OGP_H);

  const padX = 64;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // シリーズ名（左上）
  ctx.fillStyle = T.gold;
  ctx.font = `16px ${FONT_DISPLAY}`;
  ctx.fillText(meta.series || "SAKUYA SERIES", padX, 72);
  ctx.fillStyle = T.gold;
  ctx.fillRect(padX, 84, 56, 3);

  // 主題・副題（左下）
  const sub = bareSubtitle(meta.subtitle);
  const subY = OGP_H - 70;
  const titleY = sub ? subY - 44 : OGP_H - 80;
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = T.gold;
  fitFont(ctx, meta.title, FONT_DISPLAY, 60, 26, OGP_W - padX * 2);
  ctx.fillText(meta.title, padX, titleY);
  if (sub) {
    ctx.fillStyle = T.magenta;
    fitFont(ctx, `- ${sub} -`, FONT_DISPLAY, 24, 12, OGP_W - padX * 2 - 260);
    ctx.fillText(`- ${sub} -`, padX, subY);
  }
  ctx.shadowBlur = 0;

  // ドメイン（右下）
  if (meta.url) {
    let host = meta.url;
    try {
      host = new URL(meta.url).host;
    } catch (e) {
      /* そのまま出す */
    }
    ctx.textAlign = "right";
    ctx.fillStyle = T.dim;
    ctx.font = `18px ${FONT_BODY}`;
    ctx.fillText(host, OGP_W - padX, OGP_H - 70);
  }

  // 走査線は絵に掛けず、下の文字帯にだけ薄く敷く（絵が低解像度に見えないように）
  scanlines(ctx, 0, OGP_H - 190, OGP_W, 190, 0.18);
  bezel(ctx, OGP_W, OGP_H, 14, 4);
  return canvas;
}

// アイコン（黒地・金の枠・中央のモチーフ）。
//   motif.kind = "image": 画像の一部を切り抜く（focusX/focusY/zoom）
//   motif.kind = "text" : 絵文字や1〜2文字（色はマゼンタ）
export function drawIcon(canvas, size, motif, image) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, size, size);
  const frame = Math.max(1, Math.round(size / 30)); // 180px で 6px
  const inner = size - frame * 2;

  if (motif.kind === "image" && image && (image.naturalWidth || image.width)) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const zoom = Math.max(1, motif.zoom || 1);
    const side = Math.min(iw, ih) / zoom;
    const sx = Math.max(0, Math.min(iw - side, iw * (motif.focusX ?? 0.5) - side / 2));
    const sy = Math.max(0, Math.min(ih - side, ih * (motif.focusY ?? 0.5) - side / 2));
    ctx.drawImage(image, sx, sy, side, side, frame, frame, inner, inner);
  } else {
    const text = motif.text || "▶";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = T.magenta;
    ctx.shadowColor = "rgba(255,45,155,0.6)";
    ctx.shadowBlur = size / 12;
    fitFont(ctx, text, FONT_DISPLAY, Math.round(size * 0.56), 8, inner * 0.8);
    ctx.fillText(text, size / 2, size / 2 + size * 0.02);
    ctx.shadowBlur = 0;
  }
  // 32px 以下は枠を細くしすぎると消えるので最低1px
  ctx.strokeStyle = T.gold;
  ctx.lineWidth = frame;
  ctx.strokeRect(frame / 2, frame / 2, size - frame, size - frame);
  return canvas;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function absUrl(base, file) {
  try {
    return new URL(file, base.endsWith("/") ? base : base + "/").href;
  } catch (e) {
    return file;
  }
}

// シリーズ共通の <head>。meta: { title, subtitle, nameJa, description, url, kitVersion }
export function headHTML(meta) {
  const t = esc(pageTitle(meta));
  const d = esc(meta.description);
  const url = meta.url || "https://example.com/";
  const og = esc(absUrl(url, "ogp.png"));
  const v = esc(meta.kitVersion || "0.1.0");
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#06070C" />
<!-- ホーム画面に追加したとき、Safari のバーなしの全画面で起動する -->
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${esc(meta.nameJa || meta.title)}" />
<title>${t}</title>
<meta name="description" content="${d}" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />
<link rel="apple-touch-icon" href="apple-touch-icon.png" />
<link rel="manifest" href="manifest.json" />
<!-- OGP / Twitter Card（クローラは JavaScript を実行しないので、ここに静的に書く） -->
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(meta.series || "SAKUYA SERIES")}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${og}" />
<meta property="og:image:width" content="${OGP_W}" />
<meta property="og:image:height" content="${OGP_H}" />
<meta property="og:locale" content="ja_JP" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${og}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@${v}/kit.css" />`;
}

export function manifestJSON(meta) {
  const name = meta.nameJa || meta.title;
  return JSON.stringify(
    {
      name,
      short_name: name,
      description: meta.description || "",
      start_url: "./",
      scope: "./",
      display: "standalone",
      orientation: "landscape",
      background_color: "#06070C",
      theme_color: "#06070C",
      lang: "ja",
      icons: [
        { src: "favicon-32.png", sizes: "32x32", type: "image/png" },
        { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    null,
    2
  );
}

// createKit に渡す部分（タイトル表記を <head> とそろえる）
export function kitSnippet(meta) {
  const q = (s) => JSON.stringify(String(s || ""));
  return `createKit({
  gameId: ${q(meta.gameId || "your-game")},
  title: ${q(meta.title)},
  subtitle: ${q(meta.subtitle)},
  share: { when: "clear", url: ${q(meta.url)}, text: (r) => \`${String(meta.nameJa || meta.title).replace(/`/g, "")}をクリア！\\nスコア \${r.score}${meta.hashtag ? `\\n#${String(meta.hashtag).replace(/^#/, "").replace(/`/g, "")}` : ""}\` },
  ...
});`;
}
