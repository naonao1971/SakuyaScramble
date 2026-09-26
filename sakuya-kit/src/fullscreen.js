// 全画面表示。Fullscreen API はユーザー操作を経ないと呼べない。
// iPhone には Fullscreen API が無いので「ホーム画面に追加」を図で案内する。
// 機種判定は UA に頼らず API の有無で決める（iPadOS が Mac を名乗る問題を避ける）。
const fsEl = document.documentElement;
export const supportsFullscreen = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);

export function requestFullscreen() {
  const req = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
  if (!req) return Promise.resolve();
  try {
    const r = req.call(fsEl);
    return r && r.catch ? r.catch(() => {}) : Promise.resolve();
  } catch (e) {
    return Promise.resolve();
  }
}

export function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exit) return Promise.resolve();
  try {
    const r = exit.call(document);
    return r && r.catch ? r.catch(() => {}) : Promise.resolve();
  } catch (e) {
    return Promise.resolve();
  }
}

export function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function isStandaloneApp() {
  try {
    return !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
  } catch (e) {
    return false;
  }
}

// iOSのChrome/Firefox/Edge/Operaは共有シートからの追加に失敗することがある
const IOS_OTHER_BROWSER =
  /iP(hone|od)/.test(navigator.userAgent) && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

export function setupFullscreenUi({ dom, onChange }) {
  const standalone = isStandaloneApp();

  function openModal() {
    if (IOS_OTHER_BROWSER) {
      dom.fsNote.textContent = "このブラウザでは追加できないことがあります。うまくいかないときは Safari で開いてください。";
      dom.fsNote.hidden = false;
    }
    dom.fsModal.hidden = false;
    dom.fsModal.classList.add("show");
    dom.fsModal.scrollTop = 0;
  }
  function closeModal() {
    dom.fsModal.classList.remove("show");
    dom.fsModal.hidden = true;
  }

  function sync() {
    document.body.classList.toggle("sk-fullscreen", isFullscreenActive());
    onChange(isFullscreenActive());
  }

  if (!standalone) {
    const overlayBtn = dom.orientation.querySelector(".sk-fsbtn");
    if (overlayBtn) overlayBtn.hidden = false;
    for (const b of [dom.fsPlay, overlayBtn]) {
      if (!b) continue;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (supportsFullscreen) {
          // 本物の全画面。断られたときも黙って終わらせず、案内幕へ切り替える
          requestFullscreen().then(() => {
            sync();
            if (!isFullscreenActive()) openModal();
          });
          return;
        }
        openModal();
      });
    }
  }
  dom.fsClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closeModal();
  });
  dom.fsModal.addEventListener("click", (e) => {
    if (e.target === dom.fsModal) closeModal();
  });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);

  return { standalone, sync, openModal, closeModal };
}
