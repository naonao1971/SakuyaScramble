// CLEAR / GAME OVER の演出動画。
//  - preload="none"。読み込みはスタートのタップ(unlock)まで遅らせる
//    （結果画面まで到達しないプレイヤーに通信を強いない）
//  - iOSはユーザー操作を経ていない動画の音声再生を拒むので、スタートのタップで
//    一度無音で再生→即停止して解錠しておく
//  - 音は動画側のものを使い、再生できたときはゲーム内ジングルを鳴らさない
//  - 読み込めない/再生できない/間に合っていないときはジングルと静止画(または文字)に落とす
//  - canvas へ drawImage() で描くので、動画要素自体は1pxに畳んで隠す
//    （display:none や visibility:hidden だとコマの更新が止まる環境がある）
export function createCutscene({ wrap, src, image, loop = false, skippable = false, blockResults = false, sfx }) {
  const el = document.createElement("video");
  el.className = "sk-video";
  el.playsInline = true;
  el.setAttribute("playsinline", "");
  el.preload = "none";
  el.loop = !!loop;
  el.setAttribute("aria-hidden", "true");
  wrap.appendChild(el);

  // 動画が無い/流し終えた後に出す静止画（任意）
  let img = null;
  if (image) {
    img = new Image();
    img.src = image;
  }

  let failed = !src;
  let unlocked = false;
  let playing = false;
  const endedListeners = [];
  el.addEventListener("error", () => {
    if (!el.src) return;
    failed = true;
    playing = false;
  });
  el.addEventListener("ended", () => {
    playing = false;
    for (const fn of endedListeners) fn();
  });

  const cs = {
    el,
    skippable,
    blockResults,
    unlock() {
      if (!src || unlocked) return;
      unlocked = true;
      if (!el.src) el.src = src;
      el.muted = true; // 解錠のための再生は無音で通す
      const p = el.play();
      if (p && p.then) {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
        }).catch(() => {});
      }
    },
    // 途切れずに流し切れる見込みがあるか(HAVE_FUTURE_DATA以上)。
    // 1回きりの演出なので、間に合っていないなら挟まずフォールバックする
    canPlayThrough() {
      return !failed && el.readyState >= 3 && el.videoWidth > 0;
    },
    // 描画に使えるコマを持っているか(HAVE_CURRENT_DATA以上)
    hasFrame() {
      return !failed && el.readyState >= 2 && el.videoWidth > 0;
    },
    // 音付きで再生し、拒否されたら無音で映像だけ出して音はジングルで補う
    // (iOSの低電力モード等で起こりうる)。効果音オフの間は動画の音も鳴らさない
    play(jingle) {
      if (failed || !el.src) {
        playing = false;
        jingle();
        return false;
      }
      try {
        el.currentTime = 0;
      } catch (e) {
        /* 未読み込みなら無視 */
      }
      el.muted = sfx.muted;
      playing = true;
      const p = el.play();
      if (p && p.catch) {
        p.catch(() => {
          el.muted = true;
          const q = el.play();
          if (q && q.catch)
            q.catch(() => {
              failed = true;
              playing = false;
            });
          jingle();
        });
      }
      return true;
    },
    stop() {
      playing = false;
      el.pause();
      try {
        el.currentTime = 0;
      } catch (e) {
        /* 未読み込みなら無視 */
      }
    },
    isPlaying() {
      return playing;
    },
    // 今フレームに描くもの: 再生中の動画 → 静止画 → なし
    media() {
      if (playing && cs.hasFrame()) return { src: el, w: el.videoWidth, h: el.videoHeight, video: true };
      if (img && img.complete && img.naturalWidth) return { src: img, w: img.naturalWidth, h: img.naturalHeight, video: false };
      return null;
    },
    syncMuted() {
      el.muted = sfx.muted;
    },
    onEnded(fn) {
      endedListeners.push(fn);
    },
  };
  return cs;
}
