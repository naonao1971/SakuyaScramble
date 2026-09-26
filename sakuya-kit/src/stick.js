// 移動用バーチャルスティック。画面の左半分のどこを押しても、指の下に出る浮動式。
// 倒した量に応じたアナログ入力(stickX/stickY, -1..1)を input に書く。
// digital4 = true で4方向に丸める（迷路系タイトル向け。咲耶Nounラリー方式）。
//   - 中心付近では今の向きを保つ（指を少し戻しただけで止まらない）
//   - 別の軸へ乗り換えるには、その軸が HYST 倍優勢になる必要がある（斜めでぶれない）
// onUp(bool): 上に倒したかどうか（ジャンプ等に使う。咲耶ジャンプバグ方式）
const JOY_DEAD = 6; // 中心からこれ未満は無入力(置いただけで動き出さない)
const JOY_DEAD_DIGITAL = 12;
const JOY_R = 24; // 原点が指を追う半径。ここまで倒すと最大入力
const JOY_HYST = 1.2;
const JOY_UP = 14; // これ以上上に倒すと「上」

export function createStick({ dom, canvas, input, isPlayable, digital4 = false, onUp = null }) {
  const { joyRing, joyKnob, joyHint, joyHintCap } = dom;
  let joy = null; // { id, ox, oy }
  let taught = false; // 一度でも倒したら、そのプレイではもう影を出さない
  let hintShown = false;
  let enabled = true;
  let upOn = false;
  const setUp = (v) => {
    if (v === upOn) return;
    upOn = v;
    if (onUp) onUp(v);
  };

  function show(ox, oy, kx, ky) {
    joyRing.style.left = `${ox}px`;
    joyRing.style.top = `${oy}px`;
    joyKnob.style.left = `${kx}px`;
    joyKnob.style.top = `${ky}px`;
    joyRing.classList.add("on");
    joyKnob.classList.add("on");
  }

  function release() {
    joy = null;
    setUp(false);
    input.stickX = 0;
    input.stickY = 0;
    joyRing.classList.remove("on");
    joyKnob.classList.remove("on");
  }

  function playable() {
    return enabled && isPlayable();
  }

  // 影は左下(親指が自然に来る位置)に出すが、文字では「左側のどこでも」と言う
  function positionHint() {
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + 72;
    const y = rect.bottom - 60;
    joyHint.style.left = `${x}px`;
    joyHint.style.top = `${y}px`;
    const cw = joyHintCap.offsetWidth || 130;
    joyHintCap.style.left = `${Math.max(x, rect.left + cw / 2 + 8)}px`;
    joyHintCap.style.top = `${y - 52}px`;
  }

  function updateHint() {
    const want = playable() && !taught && !joy;
    if (want === hintShown) return;
    document.body.classList.toggle("sk-joyhint-on", want);
    if (want) positionHint();
    hintShown = want;
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (joy || !playable()) return;
      if (e.clientX >= window.innerWidth / 2) return;
      // ボタン(ポーズ等)の上では出さない。ボタン自身の操作を優先する
      if (e.target && e.target.closest && e.target.closest("button, input, a")) return;
      e.preventDefault();
      joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      show(joy.ox, joy.oy, joy.ox, joy.oy);
      updateHint();
    },
    { passive: false }
  );

  window.addEventListener("pointermove", (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox;
    let dy = e.clientY - joy.oy;
    // 原点を指から半径 JOY_R 以内へ引きずる。固定だと切り返しに指を大きく戻す必要がある
    let len = Math.hypot(dx, dy);
    if (len > JOY_R) {
      joy.ox = e.clientX - (dx / len) * JOY_R;
      joy.oy = e.clientY - (dy / len) * JOY_R;
      dx = (dx / len) * JOY_R;
      dy = (dy / len) * JOY_R;
      len = JOY_R;
    }
    show(joy.ox, joy.oy, joy.ox + dx, joy.oy + dy);
    setUp(dy <= -JOY_UP);
    if (digital4) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) >= JOY_DEAD_DIGITAL) {
        const horiz = input.stickX !== 0;
        const vert = input.stickY !== 0;
        let useH;
        if (!horiz && !vert) useH = ax > ay;
        else if (horiz) useH = !(ay > ax * JOY_HYST);
        else useH = ax > ay * JOY_HYST;
        input.stickX = useH ? Math.sign(dx) : 0;
        input.stickY = useH ? 0 : Math.sign(dy);
      }
      // 中心付近では今の向きを保つ
    } else if (len < JOY_DEAD) {
      input.stickX = 0;
      input.stickY = 0;
      return;
    } else {
      const mag = (len - JOY_DEAD) / (JOY_R - JOY_DEAD);
      // 円の中で斜めいっぱいに倒すと各軸0.71にしかならない。√2倍して各軸1で頭打ちに
      const ux = dx / len;
      const uy = dy / len;
      input.stickX = Math.max(-1, Math.min(1, ux * mag * Math.SQRT2));
      input.stickY = Math.max(-1, Math.min(1, uy * mag * Math.SQRT2));
    }
    if (!taught) {
      taught = true;
      updateHint();
    }
  });

  const end = (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    release();
    updateHint();
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);

  return {
    release,
    updateHint,
    reposition() {
      if (hintShown) positionHint();
    },
    resetTeaching() {
      taught = false;
    },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) release();
    },
    get enabled() {
      return enabled;
    },
  };
}
