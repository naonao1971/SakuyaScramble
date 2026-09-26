// CNP キャラクターの正典。全タイトルで同じID・名前・色を使う。
//
// 画像は kit の assets/cnp/<id>.png（256x256・背景透過）を読む。kit を CDN から
// 読み込んでいる場合は画像も CDN から来るので、各タイトルに画像を置く必要はない。
// crossOrigin="anonymous" を付けているので、canvas に描いても toBlob() できる
// （シェア画像の作成が汚染エラーにならない）。
//
// ランキングに記録する「救出キャラ」は 1 始まりの番号（下の並び順 +1）。
// 並び順を変えると過去の記録が別キャラを指すようになるので、追加は末尾のみ。
export const CNP_DEFS = [
  { id: "cnp_sotai_leelee", label: "リーリー", hue: 196 },
  { id: "cnp_sotai_mitama", label: "ミタマ", hue: 150 },
  { id: "cnp_sotai_narukami", label: "ナルカミ", hue: 46 },
  { id: "cnp_sotai_orochi", label: "オロチ", hue: 24 },
  { id: "cnp_sotai_luna", label: "ルナ", hue: 220 },
  { id: "cnp_sotai_yama", label: "ヤマ", hue: 92 },
  { id: "cnp_sotai_makami", label: "マカミ", hue: 322 },
  { id: "cnp_sotai_towa", label: "トワ", hue: 262 },
  { id: "cnp_sotai_setsuna", label: "セツナ", hue: 174 },
  { id: "cnp_sotai_ema", label: "エマ", hue: 292 },
  { id: "cnp_sotai_taruto", label: "タルト", hue: 352 },
];

const ASSET_BASE = new URL("../assets/cnp/", import.meta.url).href;

export function createCnp() {
  const chars = CNP_DEFS.map((def, i) => {
    const ch = { ...def, index: i, no: i + 1, src: ASSET_BASE + def.id + ".png", img: new Image(), ready: false };
    ch.img.crossOrigin = "anonymous";
    ch.img.onload = () => {
      ch.ready = ch.img.naturalWidth > 0;
    };
    ch.img.onerror = () => {
      ch.ready = false;
    };
    ch.img.src = ch.src;
    return ch;
  });

  // 画像が無い/読み込み前のときの色付きシルエット
  function drawPlaceholder(ctx, ch, x, y, size) {
    ctx.save();
    ctx.fillStyle = `hsl(${ch.hue}, 60%, 40%)`;
    ctx.strokeStyle = `hsl(${ch.hue}, 85%, 62%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.12, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.26, size * 0.3, size * 0.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(size * 0.25)}px "Press Start 2P", monospace`;
    ctx.fillText("?", x, y - size * 0.1);
    ctx.restore();
  }

  // 中心(x,y)・一辺sizeで描く
  function draw(ctx, ch, x, y, size) {
    if (ch.ready) ctx.drawImage(ch.img, x - size / 2, y - size / 2, size, size);
    else drawPlaceholder(ctx, ch, x, y, size);
  }

  // まだ取っていないキャラの影（ロスターの空き枠用）。絵の形だけを暗い色で塗る。
  // 画像の読み込み後に一度だけ作って使い回す
  const SIL_PX = 64;
  function silhouette(ch) {
    if (ch.sil !== undefined) return ch.sil;
    if (!ch.ready) return null;
    const c = document.createElement("canvas");
    c.width = c.height = SIL_PX;
    const g = c.getContext("2d");
    g.drawImage(ch.img, 0, 0, SIL_PX, SIL_PX);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgba(60,52,80,0.9)";
    g.fillRect(0, 0, SIL_PX, SIL_PX);
    ch.sil = c;
    return c;
  }
  function drawSilhouette(ctx, ch, x, y, size) {
    const s = silhouette(ch);
    if (s) ctx.drawImage(s, x - size / 2, y - size / 2, size, size);
    else {
      ctx.save();
      ctx.fillStyle = "rgba(232,197,106,0.18)";
      ctx.fillRect(x - size / 2 + 3, y - size / 2 + 3, size - 6, size - 6);
      ctx.restore();
    }
  }

  return { chars, draw, drawPlaceholder, drawSilhouette, byNo: (no) => chars[no - 1] || null };
}

// "1,3,7" / [1,3,7] → Set(1,3,7)（範囲外は捨てる）
export function parseRescued(rescued, count) {
  const list = Array.isArray(rescued) ? rescued : String(rescued == null ? "" : rescued).split(",");
  return new Set(list.map((s) => Number(s)).filter((v) => Number.isInteger(v) && v >= 1 && v <= count));
}
