// ボタンの押し方の共通実装。Pointer Events だけで統一し、setPointerCapture で
// 指が要素の外へ滑っても pointerup/pointercancel を必ず受け取る。
// 各ボタン・各指(pointerId)は独立して捕捉されるので、スティックとの同時押しも効く。

export const HOLD_MS = 600; // kit.css の --hold-ms と一致させること

export function capture(button, e) {
  if (button.setPointerCapture) {
    try {
      button.setPointerCapture(e.pointerId);
    } catch (err) {
      /* すでに解放済み等は無視 */
    }
  }
}

// 押している間だけ効くボタン（射撃・ジャンプ等）
export function bindPress(button, onPress, onRelease) {
  let down = false;
  const press = (e) => {
    e.preventDefault();
    capture(button, e);
    if (down) return;
    down = true;
    button.classList.add("active");
    if (onPress) onPress();
  };
  const release = (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (!down) return;
    down = false;
    button.classList.remove("active");
    if (onRelease) onRelease();
  };
  button.addEventListener("pointerdown", press, { passive: false });
  button.addEventListener("pointerup", release, { passive: false });
  button.addEventListener("pointercancel", release, { passive: false });
  button.addEventListener("lostpointercapture", release, { passive: false });
  button._skReset = () => release();
}

// 長押しトグル。主ボタンの隣に並ぶので、指がかすめただけで作動すると誤爆になる。
// 押している間だけ琥珀が下から満ち、満ちてから指を離したときだけ切り替える。
// 閾値到達の瞬間でなく pointerup で実行するのは、iOSのジャイロ許可ダイアログが
// ユーザー操作起点でないと出せないため。
export function bindHold(button, action, onShortTap) {
  let startedAt = 0;
  let readyTimer = null;
  const clearHold = () => {
    clearTimeout(readyTimer);
    readyTimer = null;
    startedAt = 0;
    button.classList.remove("holding", "hold-ready", "active");
  };
  button.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      capture(button, e);
      startedAt = performance.now();
      button.classList.add("holding");
      readyTimer = setTimeout(() => button.classList.add("hold-ready"), HOLD_MS);
    },
    { passive: false }
  );
  button.addEventListener(
    "pointerup",
    (e) => {
      e.preventDefault();
      const heldLongEnough = startedAt > 0 && performance.now() - startedAt >= HOLD_MS;
      clearHold();
      // 短いタップは切り替えず、操作方法を伝える（「押しても効かない」と誤解させない）
      if (heldLongEnough) action();
      else if (onShortTap) onShortTap();
    },
    { passive: false }
  );
  button.addEventListener("pointercancel", clearHold, { passive: false });
  button.addEventListener("lostpointercapture", clearHold, { passive: false });
  button._skReset = clearHold;
}
