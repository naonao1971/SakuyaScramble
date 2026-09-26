// sakuya-kit — 咲耶シリーズのブラウザゲーム共通キット
//
// ゲーム側は「1プレイの中身(update/render)」だけを書き、それ以外は kit が持つ:
//   スタート / ポーズ / 縦持ち案内 / 60Hz固定ループ / キーボード・スティック・
//   ジャイロ・ボタン / 効果音とミュート / 全画面 / スコア登録・ランキング /
//   CNPキャラ / シェア / レトロUI / CLEAR・GAME OVER の演出動画と結果画面
//
// 使い方は README.md。公開APIを変えるときは CHANGELOG.md に書き、
// 破壊的変更ならメジャー番号を上げる（各タイトルはバージョン固定で読んでいる）。
import { injectDom } from "./src/dom.js";
import { createSfx } from "./src/sfx.js";
import { createGyro } from "./src/gyro.js";
import { createStick } from "./src/stick.js";
import { bindPress, bindHold } from "./src/buttons.js";
import { createRanking } from "./src/ranking.js";
import { createRetro, alpha } from "./src/retro.js";
import { createCnp, CNP_DEFS } from "./src/cnp.js";
import { shareResult, openXIntent } from "./src/share.js";
import { createCutscene } from "./src/cutscene.js";
import {
  setupFullscreenUi,
  supportsFullscreen,
  requestFullscreen,
  exitFullscreen,
  isFullscreenActive,
} from "./src/fullscreen.js";

export const VERSION = "0.1.0";
export { CNP_DEFS, alpha, openXIntent };

const DEFAULT_KEYS = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
};

const TARGET_FRAME_MS = 1000 / 60;
const MAX_CATCHUP_STEPS = 5;

export function createKit(cfg) {
  if (!cfg || !cfg.gameId) throw new Error("sakuya-kit: gameId は必須です");
  const canvas = cfg.canvas || document.getElementById("game");
  if (!canvas) throw new Error("sakuya-kit: canvas が見つかりません");
  const ctx = canvas.getContext("2d");
  const controls = {
    stick: true,
    stickDigital4: false,
    stickSensitivity: 0.5, // いっぱいに倒したときの推力(キー入力=1)
    gyro: false,
    gyroSensitivity: 0.55,
    mute: true,
    fullscreen: true,
    keys: DEFAULT_KEYS,
    buttons: [],
    toggles: [],
    ...(cfg.controls || {}),
  };
  const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const portraitMQ = window.matchMedia("(orientation: portrait)");

  // ---- 状態 ----
  let phase = "title"; // "title" | "playing" | "over"
  let paused = false;
  let frame = 0;
  let result = null; // { score, cleared, rescued }
  let resultHandled = false;
  let orientationBlocked = false;
  const listeners = {};

  const dom = injectDom(cfg, canvas);
  const status = (msg) => {
    dom.status.textContent = msg || "";
  };

  // up/down/left/right: デジタル(キー)。stickX/Y・gyroX/Y: アナログ -1..1
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    stickX: 0,
    stickY: 0,
    gyroX: 0,
    gyroY: 0,
    buttons: {}, // id -> 押下中か
    // キー・スティック・ジャイロを合成した移動量。各軸 -1..1
    axis() {
      const x =
        (input.right ? 1 : 0) - (input.left ? 1 : 0) +
        input.stickX * controls.stickSensitivity +
        input.gyroX * controls.gyroSensitivity;
      const y =
        (input.down ? 1 : 0) - (input.up ? 1 : 0) +
        input.stickY * controls.stickSensitivity +
        input.gyroY * controls.gyroSensitivity;
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    },
  };

  const sfx = createSfx();
  const retro = createRetro(canvas, () => frame);
  const cnp = cfg.cnp ? createCnp() : null;
  const ranking = createRanking({
    dom,
    gasUrl: cfg.gasUrl || "",
    gameId: cfg.gameId,
    cnp,
    isMobile,
    getResult: () => result,
  });

  // ---- CLEAR / GAME OVER の演出動画 ----
  // 既定: GAME OVER は死ぬたびに流れるので飛ばせる＆流している間は結果画面を出さない。
  //       CLEAR は1回きりのご褒美なので飛ばせず、流しながらランキングも出す。
  const csCfg = cfg.cutscenes || {};
  const cutscenes = {};
  for (const [kind, defaults] of [
    ["gameOver", { skippable: true, blockResults: true }],
    ["clear", { skippable: false, blockResults: false }],
  ]) {
    const c = csCfg[kind];
    if (!c) continue;
    cutscenes[kind] = createCutscene({ wrap: dom.wrap, sfx, ...defaults, ...c });
  }
  let activeCutscene = null;
  for (const cs of Object.values(cutscenes)) {
    cs.onEnded(() => {
      if (activeCutscene === cs) activeCutscene = null;
    });
  }
  function skipCutscene() {
    if (!activeCutscene || !activeCutscene.skippable) return false;
    activeCutscene.stop();
    activeCutscene = null;
    return true;
  }
  function stopCutscenes() {
    activeCutscene = null;
    for (const cs of Object.values(cutscenes)) cs.stop();
  }
  // 結果画面を止めている演出があるか（コマが出ている間だけ。出ないなら待たせない）
  const cutsceneBlocking = () =>
    !!activeCutscene && activeCutscene.blockResults && activeCutscene.isPlaying() && activeCutscene.hasFrame();
  // ゲームオーバー演出はいつでも飛ばせる。飛ばしても流し終えたのと同じ結果画面へ進む
  canvas.addEventListener("pointerdown", () => {
    if (phase === "over") skipCutscene();
  });

  function emit(name, ...args) {
    for (const fn of listeners[name] || []) fn(...args);
    const hook = cfg["on" + name[0].toUpperCase() + name.slice(1)];
    if (typeof hook === "function") hook(...args);
  }

  const isPlayable = () => phase === "playing" && !paused && !orientationBlocked;

  // ---- 操作系（タッチ端末のみ） ----
  const stick = controls.stick
    ? createStick({ dom, canvas, input, isPlayable, digital4: controls.stickDigital4 })
    : null;

  const holdButtons = [];
  const pressButtons = [];

  function makeBtn(className, label, aria) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    if (aria) b.setAttribute("aria-label", aria);
    dom.pad.appendChild(b);
    return b;
  }

  // 主ボタン・副ボタン（右端から並ぶ）
  const buttonDefs = controls.buttons.map((def) => ({ keys: [], ...def }));
  for (const def of buttonDefs) {
    input.buttons[def.id] = false;
    const b = makeBtn("sk-btn" + (def.primary ? " sk-primary" : ""), def.label, def.ariaLabel || def.label);
    def.el = b;
    bindPress(b, () => pressButton(def, true), () => pressButton(def, false));
    pressButtons.push(b);
  }

  function pressButton(def, down) {
    if (input.buttons[def.id] === down) return;
    input.buttons[def.id] = down;
    if (phase !== "playing" || paused) return;
    if (down && def.onPress) def.onPress();
    if (!down && def.onRelease) def.onRelease();
  }

  // 長押しトグル（ゲーム固有 → ミュート → 全画面 → ジャイロ の順に内側へ）
  const toggleState = {};
  function addToggle({ id, label, labelOff, ariaOn, ariaOff, value, iconState, onChange }) {
    const b = makeBtn("sk-btn sk-hold" + (iconState ? " sk-icon-state" : ""), label);
    toggleState[id] = !!value;
    const render = () => {
      const on = toggleState[id];
      b.classList.toggle("on", on);
      b.textContent = on || !labelOff ? label : labelOff;
      b.setAttribute("aria-label", on ? ariaOn : ariaOff);
    };
    render();
    bindHold(
      b,
      async () => {
        toggleState[id] = !toggleState[id];
        render();
        if (onChange) await onChange(toggleState[id]);
        render();
      },
      () => status(`長押しで${ariaOn.split(":")[0]}を切り替えます`)
    );
    holdButtons.push(b);
    return { el: b, render, set: (v) => ((toggleState[id] = !!v), render()) };
  }

  for (const t of controls.toggles) {
    addToggle({
      ariaOn: `${t.name || t.id}:オン(長押しでオフ)`,
      ariaOff: `${t.name || t.id}:オフ(長押しでオン)`,
      ...t,
      onChange: async (v) => {
        if (t.onChange) await t.onChange(v);
        status(`${t.name || t.id}: ${v ? "オン" : "オフ"}`);
      },
    });
  }

  if (controls.mute) {
    addToggle({
      id: "sound",
      label: "🔊",
      labelOff: "🔇",
      ariaOn: "効果音:オン(長押しでオフ)",
      ariaOff: "効果音:オフ(長押しでオン)",
      value: true,
      onChange: async (on) => {
        await sfx.unlock(); // オンに戻した直後から鳴るよう、ここでも起こしておく
        sfx.setMuted(!on);
        for (const cs of Object.values(cutscenes)) cs.syncMuted(); // 再生中の演出動画にも即反映
        emit("mute", !on);
        status(on ? "効果音: オン" : "効果音: オフ");
        if (on) sfx.pickup(); // 音量の確認用に一発鳴らす
      },
    });
  }

  let fsToggle = null;
  if (controls.fullscreen && supportsFullscreen && isMobile) {
    fsToggle = addToggle({
      id: "fullscreen",
      label: "⛶",
      ariaOn: "全画面表示:オン(長押しでオフ)",
      ariaOff: "全画面表示:オフ(長押しでオン)",
      value: false,
      onChange: async (on) => {
        if (on) await requestFullscreen();
        else await exitFullscreen();
        fsToggle.set(isFullscreenActive());
      },
    });
  }

  let gyro = null;
  let gyroToggle = null;
  if (controls.gyro) {
    gyro = createGyro({
      input,
      status,
      onActiveChange: (usingTilt) => {
        // 傾きが効いている間はスティックを受け付けない（足し合わさると勝手に流れる）
        if (stick) stick.setEnabled(!usingTilt);
        if (gyroToggle) gyroToggle.set(gyro.active || !gyro.userChoiceMade);
      },
    });
    if (gyro.available && isMobile) {
      // アイコンが今のモードを表す: 🕹️ = タップでキー/タッチへ、📱 = タップで傾きへ
      gyroToggle = addToggle({
        id: "gyro",
        label: "🕹️",
        labelOff: "📱",
        ariaOn: "傾き操作:オン(長押しでキー/タッチ操作へ)",
        ariaOff: "傾き操作:オフ(長押しで傾き操作へ)",
        iconState: true,
        value: true,
        onChange: async () => {
          await gyro.toggle();
          gyroToggle.set(gyro.active);
        },
      });
    }
  }

  const fsUi = setupFullscreenUi({
    dom,
    onChange: (active) => {
      if (fsToggle) fsToggle.set(active);
      repositionAll();
    },
  });

  // ---- 位置合わせ（すべて canvas の実寸基準） ----
  const startAnchor = cfg.startAnchor || { x: canvas.width / 2, y: canvas.height - 34 };
  let startShown = false;
  let pauseShown = null;
  let padShown = null;

  function positionStart() {
    const rect = canvas.getBoundingClientRect();
    let left = startAnchor.x * (rect.width / canvas.width);
    let top = startAnchor.y * (rect.height / canvas.height);
    // 中心合わせなので、縁に近いと半分がはみ出す。実寸で内側へクランプする
    const halfW = dom.start.offsetWidth / 2;
    const halfH = dom.start.offsetHeight / 2;
    const inset = 6;
    left = Math.max(halfW + inset, Math.min(rect.width - halfW - inset, left));
    top = Math.max(halfH + inset, Math.min(rect.height - halfH - inset, top));
    dom.start.style.left = `${left}px`;
    dom.start.style.top = `${top}px`;
  }
  function positionPause() {
    const rect = canvas.getBoundingClientRect();
    dom.pause.style.left = `${rect.width / 2}px`;
    dom.pause.style.top = `${rect.height / 2}px`;
  }
  const PAD_INSET = 8;
  function positionPad() {
    const rect = canvas.getBoundingClientRect();
    dom.pad.style.setProperty("--pad-right", `${window.innerWidth - rect.right + PAD_INSET}px`);
    dom.pad.style.setProperty("--pad-bottom", `${window.innerHeight - rect.bottom + PAD_INSET}px`);
  }
  function positionOrientation() {
    const rect = canvas.getBoundingClientRect();
    const o = dom.orientation;
    o.style.left = "0px";
    o.style.top = "0px";
    o.style.width = `${rect.width}px`;
    o.style.height = "auto";
    // heightで固定するとSafariのアドレスバー分縮んだときに中身がはみ出す
    o.style.minHeight = `${rect.height}px`;
  }
  function repositionAll() {
    if (startShown) positionStart();
    if (pauseShown) positionPause();
    if (padShown) positionPad();
    if (orientationBlocked) positionOrientation();
    if (stick) stick.reposition();
  }
  window.addEventListener("resize", repositionAll);

  // ---- 縦持ち案内（スマホのみ。毎フレーム引き直す） ----
  // iOS の orientationchange はメディアクエリ更新より先に発火することがあるので、
  // イベントだけに頼らず loop から毎フレーム評価する
  let orientationApplied = null;
  function updateOrientation() {
    const block = isMobile && portraitMQ.matches;
    orientationBlocked = block;
    if (block === orientationApplied) return;
    if (block) positionOrientation();
    dom.orientation.classList.toggle("visible", block);
    orientationApplied = block;
  }

  // ---- 表示の切り替え（毎フレーム。DOMに触るのは変化した時だけ） ----
  const resultsBlocked = () =>
    cutsceneBlocking() || (typeof cfg.resultsBlocked === "function" ? !!cfg.resultsBlocked() : false);

  function updateUi() {
    const waiting = phase !== "playing";
    const blocked = resultsBlocked();
    const showStart = waiting && !blocked;
    dom.start.style.display = showStart ? "" : "none";
    dom.fsPlay.hidden = !(showStart && !fsUi.standalone) || orientationBlocked;
    if (showStart && !startShown) positionStart();
    startShown = showStart;

    const showPause = phase === "playing";
    if (showPause !== pauseShown) {
      dom.pause.style.display = showPause ? "" : "none";
      if (showPause) positionPause();
      pauseShown = showPause;
    }

    const showPad = isMobile && phase === "playing" && !orientationBlocked;
    if (showPad !== padShown) {
      dom.pad.classList.toggle("visible", showPad);
      if (showPad) positionPad();
      if (!showPad && stick) stick.release();
      padShown = showPad;
    }
    if (stick) stick.updateHint();

    // ランキングはタイトル・結果画面で出す。結果が出たら一度だけ登録フォームを判定する
    const showBoard = waiting && !blocked;
    ranking.setVisible(showBoard);
    if (phase === "over" && !blocked && !resultHandled) {
      resultHandled = true;
      if (result && ranking.qualifies(result.score)) ranking.showForm();
      else ranking.hideForm();
    }
    if (!showBoard) ranking.hideForm();

    const shareOn = !!cfg.share && phase === "over" && !blocked && result &&
      (cfg.share.when === "always" || result.cleared);
    dom.share.classList.toggle("visible", !!shareOn);

    // プレイ中(タッチ端末)だけページのスクロール/pull-to-refreshを止める
    document.body.classList.toggle("sk-playing-lock", isMobile && phase === "playing");
  }

  // ---- ポーズ ----
  function setPaused(p) {
    if (phase !== "playing") return;
    paused = !!p;
    dom.pause.textContent = paused ? "▶" : "⏸";
    dom.pause.classList.toggle("paused", paused);
    dom.pause.setAttribute("aria-label", paused ? "再開" : "一時停止");
    // 押したままポーズすると、再開直後に押しっぱなし扱いになるのを防ぐ
    if (paused) resetInputs();
    status(paused ? "一時停止中" : "");
    emit("pause", paused);
  }
  dom.pause.addEventListener("click", () => setPaused(!paused));

  // ---- 入力のリセット（ポーズ・タブ切替・通知の割り込み） ----
  function resetInputs() {
    input.up = input.down = input.left = input.right = false;
    input.gyroX = input.gyroY = 0;
    if (stick) stick.release();
    for (const def of buttonDefs) {
      if (def.el && def.el._skReset) def.el._skReset();
      input.buttons[def.id] = false;
    }
    for (const b of holdButtons) if (b._skReset) b._skReset();
    emit("inputReset");
  }
  window.addEventListener("blur", resetInputs);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetInputs();
  });

  // ---- キーボード ----
  // 入力欄にフォーカスがある間はゲーム操作キーを奪わない
  const isTyping = (e) => {
    const t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  };
  const dirOf = (code) => Object.keys(controls.keys).find((k) => controls.keys[k].includes(code));
  window.addEventListener("keydown", (e) => {
    if (cfg.onKeyDown && cfg.onKeyDown(e) === false) return;
    if (isTyping(e)) return;
    if (phase === "over" && skipCutscene()) {
      e.preventDefault();
      return;
    }
    const dir = dirOf(e.code);
    if (dir) {
      input[dir] = true;
      e.preventDefault();
      return;
    }
    const btn = buttonDefs.find((d) => d.keys.includes(e.code));
    if (btn) {
      if (!e.repeat) pressButton(btn, true);
      e.preventDefault();
      return;
    }
    if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat) {
      setPaused(!paused);
      e.preventDefault();
    } else if ((e.code === "Enter" || e.code === "Space") && phase !== "playing" && !resultsBlocked()) {
      requestStart();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (isTyping(e)) return;
    const dir = dirOf(e.code);
    if (dir) {
      input[dir] = false;
      return;
    }
    const btn = buttonDefs.find((d) => d.keys.includes(e.code));
    if (btn) pressButton(btn, false);
  });

  // ---- ピンチズーム封じ（プレイ中のみ） ----
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
    document.addEventListener(type, (e) => {
      if (isMobile && phase === "playing") e.preventDefault();
    });
  });
  document.addEventListener(
    "touchmove",
    (e) => {
      if (isMobile && phase === "playing" && e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  // ---- スタート ----
  // AudioContext の再開も iOS のジャイロ許可も「ユーザー操作の延長」でないと効かない。
  // resume() を先に await すると操作由来の許可が切れるので、呼び出しだけ同期的に出す。
  let starting = false;
  async function requestStart() {
    if (starting) return;
    starting = true;
    try {
      const audio = sfx.unlock();
      // 演出動画もユーザー操作が必要なので、ここが唯一の解錠点（読み込みもここから始まる）
      for (const cs of Object.values(cutscenes)) cs.unlock();
      emit("startGesture"); // その他、ユーザー操作の中で済ませたい処理
      if (isMobile && controls.fullscreen) requestFullscreen().then(() => fsUi.sync());
      if (gyro && gyro.available && isMobile) {
        if (!gyro.userChoiceMade) {
          await gyro.enableIfAvailable();
          // iOSの許可ダイアログ表示中に AudioContext が suspended に戻ることがある
          await sfx.unlock();
        } else if (gyro.active) {
          gyro.recalibrate();
        }
      }
      await audio;
      start();
    } finally {
      starting = false;
    }
  }
  dom.start.addEventListener("click", requestStart);

  function start() {
    result = null;
    resultHandled = false;
    paused = false;
    dom.pause.classList.remove("paused");
    dom.pause.textContent = "⏸";
    dom.pause.setAttribute("aria-label", "一時停止");
    dom.shareStatus.textContent = "";
    stopCutscenes();
    ranking.hideForm();
    resetInputs();
    if (stick) stick.resetTeaching();
    phase = "playing";
    if (!gyro || !gyro.active) {
      status(cfg.help && cfg.help.playing ? cfg.help.playing : isMobile ? "画面の左側を押したまま倒すと移動できます" : "");
    }
    emit("start");
  }

  // ---- ゲームから呼ぶ: 1プレイの終了 ----
  function gameOver(r = {}) {
    if (phase !== "playing") return;
    result = {
      score: Math.floor(r.score || 0),
      cleared: !!r.cleared,
      rescued: r.rescued || [],
    };
    phase = "over";
    paused = false;
    resetInputs();
    status("");
    // 音は動画側を使う。動画が無い/間に合わない/再生できないときだけジングルを鳴らす
    const jingle = () => {
      if (cfg.jingle === false) return;
      if (result.cleared) sfx.clear();
      else sfx.gameOver();
    };
    const cs = cutscenes[result.cleared ? "clear" : "gameOver"];
    if (cs && cs.canPlayThrough()) {
      activeCutscene = cs;
      cs.play(jingle);
    } else {
      jingle();
    }
    emit("gameOver", result);
  }

  // ---- シェア ----
  if (cfg.share) {
    dom.shareBtn.addEventListener("click", async () => {
      dom.shareBtn.disabled = true;
      dom.shareStatus.textContent = "";
      try {
        await shareResult({
          text: cfg.share.text(result),
          canvas: cfg.share.image ? cfg.share.image(result) : canvas,
          fileName: cfg.share.fileName || `${cfg.gameId}-result.png`,
          pageUrl: cfg.share.url,
          status: (m) => (dom.shareStatus.textContent = m),
        });
      } finally {
        dom.shareBtn.disabled = false;
      }
    });
  }

  // ---- 結果画面（全タイトル共通の見た目） ----
  // GAME OVER: 暗幕 → 演出動画(再生中のみ) → 流し終えたら「GAME OVER / PUSH START」
  // CLEAR    : 暗幕 → 上に動画(流し終えたら静止画) → 下に「CLEAR / SCORE」
  //            ここに PUSH START は描かない（真下に明滅するスタートボタンが出るため）
  const rs = { clearTitle: "CLEAR", gameOverTitle: "GAME OVER", mediaWidth: 560, ...(cfg.resultScreen || {}) };
  function drawMedia(m, y) {
    const w = rs.mediaWidth;
    const h = w * (m.h / m.w);
    const x = (canvas.width - w) / 2;
    const top = y == null ? (canvas.height - h) / 2 : y;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    ctx.drawImage(m.src, x, top, w, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = retro.colors.gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, top + 1, w - 2, h - 2);
    ctx.restore();
    return { x, y: top, w, h, video: m.video };
  }
  function drawResultScreen() {
    const c = retro.colors;
    const cleared = result.cleared;
    const cs = cutscenes[cleared ? "clear" : "gameOver"];
    ctx.save();
    ctx.fillStyle = cleared ? "rgba(6, 20, 16, 0.75)" : "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center";
    if (!cleared) {
      const m = cs && activeCutscene === cs ? cs.media() : null;
      if (m && m.video) {
        // 演出中は動画だけを見せ、文字は流し終えてから出す
        const rect = drawMedia(m);
        if (rs.decorate) rs.decorate(ctx, { kind: "gameOver", rect, result, playing: true, kit });
        ctx.restore();
        return;
      }
      ctx.fillStyle = c.danger;
      ctx.font = retro.font(34);
      ctx.fillText(rs.gameOverTitle, canvas.width / 2, canvas.height / 2 - 16);
      if (retro.blinkOn()) {
        ctx.fillStyle = c.ink;
        ctx.font = retro.font(12);
        ctx.fillText("PUSH START", canvas.width / 2, canvas.height / 2 + 32);
      }
      if (rs.decorate) rs.decorate(ctx, { kind: "gameOver", rect: null, result, playing: false, kit });
    } else {
      let textTop = canvas.height / 2 - 30;
      const m = cs ? cs.media() : null;
      let rect = null;
      if (m) {
        rect = drawMedia(m, 20);
        textTop = rect.y + rect.h + 42;
      }
      ctx.fillStyle = c.gold;
      ctx.font = retro.font(30);
      ctx.fillText(rs.clearTitle, canvas.width / 2, textTop);
      ctx.fillStyle = c.ink;
      ctx.font = retro.font(14);
      ctx.fillText(`SCORE ${String(result.score).padStart(7, "0")}`, canvas.width / 2, textTop + 36);
      // 画像の左右の余白に救出ロスターを並べる等は decorate で足す
      if (rs.decorate) rs.decorate(ctx, { kind: "clear", rect, result, playing: !!(m && m.video), kit });
    }
    ctx.restore();
  }

  // ---- 60Hz 固定ステップのループ ----
  // 30fpsしか出ない端末でもゲーム内時間が遅れないよう、足りない分は update を追加で回す
  let acc = 0;
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!Number.isFinite(ts)) ts = last || 0;
    if (!last) last = ts;
    let elapsed = ts - last;
    last = ts;
    if (elapsed > 1000) elapsed = TARGET_FRAME_MS; // タブ復帰時は追いつこうとしない
    acc += elapsed;
    updateOrientation();
    let steps = 0;
    while (acc >= TARGET_FRAME_MS && steps < MAX_CATCHUP_STEPS) {
      frame++;
      if (phase === "playing" && !paused && !orientationBlocked && cfg.update) cfg.update(kit);
      acc -= TARGET_FRAME_MS;
      steps++;
    }
    if (steps === MAX_CATCHUP_STEPS) acc = 0;
    updateUi();
    if (cfg.render) cfg.render(ctx, kit);
    if (phase === "over" && result && cfg.resultScreen !== false) drawResultScreen();
    if (phase === "playing" && paused) retro.pauseOverlay(isMobile);
  }

  // ---- 初期表示 ----
  if (isMobile) {
    status(
      cfg.help && cfg.help.mobile
        ? cfg.help.mobile
        : gyro && gyro.available
          ? "スタートを押すと、対応端末では傾き操作に切り替わります"
          : "画面の左側を押したまま倒すと移動、右下のボタンで操作できます"
    );
  } else {
    status(cfg.help && cfg.help.pc ? cfg.help.pc : "キーボードで操作できます（Pキーで一時停止）");
  }

  // canvas はCSSのfont-familyを見ないので、描画前にレトロ書体を明示ロードする
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('16px "DotGothic16"')])
      .then(() => {
        if (startShown) positionStart();
      })
      .catch(() => {});
  }

  const kit = {
    VERSION,
    canvas,
    ctx,
    input,
    sfx,
    retro,
    cnp,
    ranking,
    gyro,
    isMobile,
    status,
    gameOver,
    setPaused,
    start: requestStart,
    resetInputs,
    toggle: (id) => toggleState[id],
    cutscene: {
      get playing() {
        return !!activeCutscene && activeCutscene.isPlaying();
      },
      get kind() {
        return activeCutscene ? (activeCutscene === cutscenes.clear ? "clear" : "gameOver") : null;
      },
      skip: skipCutscene,
      videos: cutscenes,
    },
    on(name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return kit;
    },
    get phase() {
      return phase;
    },
    get paused() {
      return paused;
    },
    get frame() {
      return frame;
    },
    get result() {
      return result;
    },
    get orientationBlocked() {
      return orientationBlocked;
    },
  };

  ranking.load();
  requestAnimationFrame(loop);
  return kit;
}
