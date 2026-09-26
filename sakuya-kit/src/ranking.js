// ランキング (Google スプレッドシート + Apps Script) とスコア登録フォーム。
// 1本の Apps Script を全タイトルで共有し、?game=<gameId> でシートを分ける
// （gas/apps-script.gs）。
import { escapeHTML } from "./dom.js";
import { parseRescued } from "./cnp.js";

// モバイルだとフォームがcanvasより下にあり、スクロールしないと気づけない。
// ただし即スクロールするとCLEAR画面を見る前に飛ぶので、少し見せてから誘導する
const FORM_SCROLL_DELAY_MS = 2000;
const X_ID_RE = /^[A-Za-z0-9_]{1,15}$/;

export function createRanking({ dom, gasUrl, gameId, cnp, isMobile, getResult }) {
  let cache = [];
  let xidState = "empty"; // "empty" | "loading" | "found" | "error"
  let xidToken = 0;
  let scrollTimer = null;

  function endpoint(extra) {
    if (!gasUrl) return "";
    const u = new URL(gasUrl);
    u.searchParams.set("game", gameId);
    if (extra) for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return u.toString();
  }

  // ランキング1行ぶんのCNPロスター。救出キャラを持たない記録では出さない
  function rosterHTML(rescued) {
    if (!cnp) return "";
    const got = parseRescued(rescued, cnp.chars.length);
    if (!got.size) return "";
    const slots = cnp.chars
      .map((ch) => {
        const on = got.has(ch.no);
        const img = on ? `<img src="${escapeHTML(ch.src)}" alt="" onerror="this.remove()">` : "";
        return `<span class="sk-lb-slot${on ? " got" : ""}" style="--h:${ch.hue}" title="${escapeHTML(ch.label)}">${img}</span>`;
      })
      .join("");
    return `<span class="sk-lb-roster">${slots}<span class="sk-lb-roster-count">${got.size}/${cnp.chars.length}</span></span>`;
  }

  function render() {
    if (!cache.length) {
      dom.lbList.innerHTML = '<li class="sk-lb-empty">まだ記録がありません</li>';
      return;
    }
    dom.lbList.innerHTML = cache
      .slice(0, 10)
      .map((r, i) => {
        const rank = i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
        const xid = String(r.xid || "").replace(/^@/, "").trim();
        const xPart = X_ID_RE.test(xid)
          ? `<img class="sk-lb-avatar" src="https://unavatar.io/x/${encodeURIComponent(xid)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
             <a class="sk-lb-xlink" href="https://x.com/${encodeURIComponent(xid)}" target="_blank" rel="noopener noreferrer">@${escapeHTML(xid)}</a>`
          : "";
        const deviceIcon = r.device === "モバイル" ? "📱" : r.device === "PC" ? "💻" : "";
        return `<li class="sk-lb-row">
            <span class="sk-lb-rank">${medal}</span>
            <span class="sk-lb-name">${deviceIcon ? `<span title="${escapeHTML(r.device)}">${deviceIcon}</span> ` : ""}${escapeHTML(r.nickname)}</span>
            <span class="sk-lb-xname">${xPart}</span>
            <span class="sk-lb-score">${Math.floor(Number(r.score) || 0)}</span>
            ${rosterHTML(r.rescued)}
          </li>`;
      })
      .join("");
  }

  function load() {
    if (!gasUrl) {
      render();
      return Promise.resolve();
    }
    return fetch(endpoint(), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        cache = (d.records || []).slice().sort((a, b) => b.score - a.score);
        render();
      })
      .catch(() => render());
  }

  function qualifies(score) {
    if (!(score > 0)) return false;
    if (cache.length < 10) return true;
    return score > cache[9].score;
  }

  function setVisible(v) {
    dom.leaderboard.classList.toggle("visible", !!v);
  }

  function scrollToForm() {
    if (!dom.register.classList.contains("visible")) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dom.register.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    try {
      dom.nick.focus({ preventScroll: true });
    } catch (e) {
      /* preventScroll未対応は無視 */
    }
  }

  function showForm() {
    dom.register.classList.add("visible");
    dom.nick.value = "";
    dom.xidInput.value = "";
    dom.submitStatus.textContent = "";
    xidState = "empty";
    setXidPreview(null, "");
    updateSubmit();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(scrollToForm, FORM_SCROLL_DELAY_MS);
  }

  function hideForm() {
    // 待たずに再スタートされたとき、ゲーム中に誘導スクロールが割り込まないよう必ず取り消す
    clearTimeout(scrollTimer);
    scrollTimer = null;
    dom.register.classList.remove("visible");
  }

  // ニックネーム入力済み かつ (X IDが空 または 確認済み) のときだけ登録できる
  function updateSubmit() {
    const xidOk = xidState === "empty" || xidState === "found";
    dom.submit.disabled = !dom.nick.value.trim() || !xidOk;
  }

  function setXidPreview(mode, html) {
    dom.xidPreview.className = "sk-xid" + (mode ? " visible xid-" + mode : "");
    dom.xidPreview.innerHTML = html || "";
  }

  // unavatar.io のアバター読み込み成否で、Xアカウントが実在するかを簡易検証する
  function verifyXid(raw) {
    const username = String(raw || "").replace(/^@/, "").trim();
    const token = ++xidToken;
    if (!username) {
      xidState = "empty";
      setXidPreview(null, "");
      updateSubmit();
      return;
    }
    if (!X_ID_RE.test(username)) {
      xidState = "error";
      setXidPreview("error", "形式エラー：半角英数字・アンダースコアのみ、最大15文字で入力してください");
      updateSubmit();
      return;
    }
    xidState = "loading";
    setXidPreview("loading", "確認中...");
    updateSubmit();
    const img = new Image();
    img.onload = () => {
      if (token !== xidToken) return;
      xidState = "found";
      setXidPreview(
        "found",
        `<img src="https://unavatar.io/x/${encodeURIComponent(username)}" alt="" class="sk-xid-avatar">` +
          `<a href="https://x.com/${encodeURIComponent(username)}" target="_blank" rel="noopener noreferrer">@${escapeHTML(username)}</a>` +
          `<span>を確認しました</span>`
      );
      updateSubmit();
    };
    img.onerror = () => {
      if (token !== xidToken) return;
      xidState = "error";
      setXidPreview("error", "このXアカウントの名称を取得できませんでした。IDを確認してください");
      updateSubmit();
    };
    img.src = "https://unavatar.io/x/" + encodeURIComponent(username);
  }

  dom.xidInput.addEventListener("input", () => {
    xidState = dom.xidInput.value.trim() ? "loading" : "empty";
    setXidPreview(null, "");
    updateSubmit();
  });
  dom.xidInput.addEventListener("blur", () => verifyXid(dom.xidInput.value));
  dom.nick.addEventListener("input", updateSubmit);

  dom.submit.addEventListener("click", () => {
    const nickname = dom.nick.value.trim();
    if (!nickname) {
      dom.submitStatus.textContent = "ニックネームを入力してください";
      dom.nick.focus();
      return;
    }
    if (xidState !== "empty" && xidState !== "found") {
      dom.submitStatus.textContent = "XのIDを確認できるまで登録できません";
      dom.xidInput.focus();
      return;
    }
    if (!gasUrl) {
      dom.submitStatus.textContent = "ランキング機能が未設定です（gasUrl 未設定）";
      return;
    }
    const result = getResult() || {};
    const record = {
      nickname,
      xid: dom.xidInput.value.trim().replace(/^@/, ""),
      score: Math.floor(result.score || 0),
      created: Date.now(),
      device: isMobile ? "モバイル" : "PC",
      rescued: Array.isArray(result.rescued) ? result.rescued.join(",") : String(result.rescued || ""),
    };
    dom.submit.disabled = true;
    dom.submitStatus.textContent = "登録中...";
    fetch(endpoint(), { method: "POST", body: JSON.stringify({ action: "add", game: gameId, record }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          dom.submitStatus.textContent = "登録しました！";
          hideForm();
          load();
        } else {
          dom.submitStatus.textContent = "登録に失敗しました: " + (d.error || "");
          updateSubmit();
        }
      })
      .catch((e) => {
        dom.submitStatus.textContent = "通信エラー: " + e.message;
        updateSubmit();
      });
  });

  return {
    load,
    render,
    qualifies,
    setVisible,
    showForm,
    hideForm,
    rosterHTML,
    get records() {
      return cache;
    },
  };
}
