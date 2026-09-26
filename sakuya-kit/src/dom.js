// 共通UIのDOMを組み立てる。ゲーム側のHTMLは
//   <div class="sk-wrap"><canvas id="game" width="960" height="540"></canvas></div>
// だけ置けばよく、残り(ポーズ・ボタン群・スティック・ランキング・案内幕)はここで足す。

export function escapeHTML(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function injectDom(cfg, canvas) {
  const wrap = canvas.closest(".sk-wrap") || canvas.parentElement;
  wrap.classList.add("sk-wrap");

  const orientation = el(`
    <div class="sk-orientation" role="alert" aria-live="assertive">
      <p class="sk-orientation-title">${escapeHTML(cfg.title || "")}</p>
      ${cfg.subtitle ? `<p class="sk-orientation-sub">${escapeHTML(cfg.subtitle)}</p>` : ""}
      <div class="sk-orientation-icon">📱⤾</div>
      <p>横向きにしてね ⌐◨-◨</p>
      <button class="sk-fsbtn" type="button" hidden>🎮 全画面で遊ぶ</button>
    </div>`);
  wrap.appendChild(orientation);

  const pause = el(`<button class="sk-pause" type="button" aria-label="一時停止" style="display:none">⏸</button>`);
  wrap.appendChild(pause);

  const start = el(`<button class="sk-start" type="button">${escapeHTML(cfg.startLabel || "スタート")}</button>`);
  wrap.appendChild(start);

  const status = el(`<div class="sk-status"></div>`);
  wrap.appendChild(status);

  const fsPlay = el(`<button class="sk-fsbtn" type="button" hidden>🎮 全画面で遊ぶ</button>`);
  wrap.appendChild(fsPlay);

  const pad = el(`<div class="sk-pad" aria-label="操作ボタン"></div>`);
  wrap.appendChild(pad);

  const joyHint = el(`<div class="sk-joyhint" aria-hidden="true"></div>`);
  const joyHintCap = el(`<div class="sk-joyhintcap" aria-hidden="true">左側を押したまま倒す</div>`);
  const joyRing = el(`<div class="sk-joyring" aria-hidden="true"></div>`);
  const joyKnob = el(`<div class="sk-joyknob" aria-hidden="true"></div>`);
  document.body.append(joyHint, joyHintCap, joyRing, joyKnob);

  const leaderboard = el(`
    <section class="sk-leaderboard" aria-label="ランキング TOP10">
      <div class="sk-register">
        <p class="sk-register-msg">TOP10入り！ニックネームを登録してください</p>
        <input class="sk-nick" type="text" placeholder="ニックネーム（必須）" maxlength="20" autocomplete="off" />
        <input class="sk-xid-input" type="text" placeholder="XのユーザーID（任意・@なし）" maxlength="20" autocomplete="off" />
        <div class="sk-xid"></div>
        <button class="sk-cta sk-submit" type="button">登録する</button>
        <p class="sk-note sk-submit-status"></p>
      </div>
      <div class="sk-share">
        <button class="sk-cta sk-share-btn" type="button">シェア</button>
        <p class="sk-note sk-share-status"></p>
      </div>
      <h2 class="sk-lb-title">🏆 TOP10 ランキング</h2>
      <div class="sk-lb-tabs" role="tablist" hidden>
        <button class="sk-lb-tab" type="button" role="tab" data-tab="game" aria-selected="true">このゲーム</button>
        <button class="sk-lb-tab" type="button" role="tab" data-tab="overall" aria-selected="false">総合</button>
      </div>
      <ol class="sk-lb-list"></ol>
      <div class="sk-lb-overall" hidden>
        <p class="sk-lb-note"></p>
        <ol class="sk-lb-list sk-lb-overall-list"></ol>
      </div>
    </section>`);
  wrap.after(leaderboard);

  let footer = null;
  if (cfg.footer !== false) {
    footer = el(`<footer class="sk-footer"></footer>`);
    footer.textContent = cfg.footer || "本作は CryptoNinja / CryptoNinja Partners の非公式ファンアートです";
    leaderboard.after(footer);
  }

  const host = escapeHTML(location.host || "sakuya.naoblock.jp");
  const fsModal = el(`
    <div class="sk-fsmodal" role="dialog" aria-modal="true" aria-label="全画面で遊ぶ" hidden>
      <div class="sk-fsbox">
        <h3>&#x1F3AE; 全画面で遊ぶ</h3>
        <p class="sk-fs-lead">iPhone では、<b>ホーム画面に追加</b>すると<br>
          Safari のアドレスバーなしで遊べます。</p>
        <div class="sk-fs-step">
          <div class="sk-fs-step-n">1</div>
          <div class="sk-fs-step-t">画面の下にある <em>共有</em> ボタンをタップ
            <svg viewBox="0 0 210 78" role="img" aria-label="画面下のツールバーにある共有ボタン">
              <rect x="1" y="1" width="208" height="76" rx="9" fill="#120c18" stroke="rgba(242,233,239,.18)"/>
              <rect x="12" y="14" width="186" height="30" rx="6" fill="#241b2d"/>
              <text x="105" y="34" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="rgba(242,233,239,.45)">${host}</text>
              <rect x="12" y="52" width="186" height="16" rx="5" fill="#241b2d"/>
              <circle cx="105" cy="60" r="13" fill="none" stroke="#ff2d9b" stroke-width="2"/>
              <path d="M105 54 v9 M101 57 l4-4 4 4" stroke="#ff2d9b" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="99" y="62" width="12" height="2" fill="#ff2d9b"/>
            </svg>
          </div>
        </div>
        <div class="sk-fs-step">
          <div class="sk-fs-step-n">2</div>
          <div class="sk-fs-step-t">出てきた一覧から <em>ホーム画面に追加</em> をタップ
            <svg viewBox="0 0 210 78" role="img" aria-label="共有シートのホーム画面に追加の項目">
              <rect x="1" y="1" width="208" height="76" rx="9" fill="#120c18" stroke="rgba(242,233,239,.18)"/>
              <rect x="12" y="10" width="186" height="17" rx="5" fill="#241b2d"/>
              <rect x="22" y="16" width="72" height="5" rx="2.5" fill="rgba(242,233,239,.22)"/>
              <rect x="12" y="31" width="186" height="20" rx="5" fill="#2e2338" stroke="#ff2d9b" stroke-width="1.6"/>
              <rect x="21" y="36" width="10" height="10" rx="2" fill="none" stroke="#ff2d9b" stroke-width="1.5"/>
              <path d="M26 39 v4 M24 41 h4" stroke="#ff2d9b" stroke-width="1.4" stroke-linecap="round"/>
              <text x="39" y="45" font-size="9.5" font-family="sans-serif" fill="#f2e9ef">ホーム画面に追加</text>
              <rect x="12" y="55" width="186" height="17" rx="5" fill="#241b2d"/>
              <rect x="22" y="61" width="58" height="5" rx="2.5" fill="rgba(242,233,239,.22)"/>
            </svg>
          </div>
        </div>
        <div class="sk-fs-step">
          <div class="sk-fs-step-n">3</div>
          <div class="sk-fs-step-t"><em>Webアプリとして開く</em> をオンにして <em>追加</em>
            <svg viewBox="0 0 210 78" role="img" aria-label="Webアプリとして開くをオンにして追加">
              <rect x="1" y="1" width="208" height="76" rx="9" fill="#120c18" stroke="rgba(242,233,239,.18)"/>
              <rect x="12" y="10" width="120" height="16" rx="5" fill="#241b2d"/>
              <rect x="21" y="15" width="46" height="6" rx="3" fill="rgba(242,233,239,.28)"/>
              <rect x="146" y="9" width="52" height="18" rx="9" fill="#ff2d9b"/>
              <text x="172" y="22" text-anchor="middle" font-size="10" font-family="sans-serif" font-weight="700" fill="#150f1a">追加</text>
              <rect x="12" y="38" width="186" height="28" rx="6" fill="#2e2338" stroke="#ff2d9b" stroke-width="1.6"/>
              <text x="22" y="56" font-size="9.5" font-family="sans-serif" fill="#f2e9ef">Webアプリとして開く</text>
              <rect x="158" y="45" width="30" height="16" rx="8" fill="#49e0d8"/>
              <circle cx="180" cy="53" r="6" fill="#ffffff"/>
            </svg>
          </div>
        </div>
        <p class="sk-fs-note" hidden></p>
        <p class="sk-fs-foot">追加したら、<b>ホーム画面のアイコンからゲームを起動</b>してください。<br>
          Safari から開いたままでは全画面になりません。</p>
        <button class="sk-fs-close" type="button">閉じる</button>
      </div>
    </div>`);
  document.body.appendChild(fsModal);

  const q = (root, sel) => root.querySelector(sel);
  return {
    wrap,
    orientation,
    pause,
    start,
    status,
    fsPlay,
    pad,
    joyHint,
    joyHintCap,
    joyRing,
    joyKnob,
    footer,
    fsModal,
    fsNote: q(fsModal, ".sk-fs-note"),
    fsClose: q(fsModal, ".sk-fs-close"),
    leaderboard,
    lbList: q(leaderboard, ".sk-lb-list"),
    lbTitle: q(leaderboard, ".sk-lb-title"),
    lbTabs: q(leaderboard, ".sk-lb-tabs"),
    lbOverall: q(leaderboard, ".sk-lb-overall"),
    lbOverallList: q(leaderboard, ".sk-lb-overall-list"),
    lbOverallNote: q(leaderboard, ".sk-lb-note"),
    register: q(leaderboard, ".sk-register"),
    nick: q(leaderboard, ".sk-nick"),
    xidInput: q(leaderboard, ".sk-xid-input"),
    xidPreview: q(leaderboard, ".sk-xid"),
    submit: q(leaderboard, ".sk-submit"),
    submitStatus: q(leaderboard, ".sk-submit-status"),
    share: q(leaderboard, ".sk-share"),
    shareBtn: q(leaderboard, ".sk-share-btn"),
    shareStatus: q(leaderboard, ".sk-share-status"),
  };
}

// canvas の実寸矩形（CSS px）。位置合わせは全部これを基準にする
export function canvasRect(canvas) {
  return canvas.getBoundingClientRect();
}
