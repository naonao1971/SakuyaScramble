/**
 * 咲耶シリーズ 共通ランキング用 Google Apps Script (Web App)
 *
 * 1本のスクリプト・1つのスプレッドシートで全タイトルのスコアを持ち、
 * タイトル別ランキングと、タイトルをまたいだ総合ランキングを返す。
 *
 *   GET  <URL>?game=scramble                  → そのタイトルの上位記録
 *   GET  <URL>?action=overall                 → 総合ランキング
 *   POST <URL>?game=scramble  {action:"add", record:{...}}
 *
 * ── シートの構成 ──────────────────────────────────────────
 *  _games   : タイトルの一覧（このシートだけ手で編集する）
 *             gameId | タイトル | シート名 | 総合に含める
 *             初めてスコアが登録されたタイトルは自動で行が足される（総合には含めない状態で）。
 *             総合ランキングに入れるときは「総合に含める」を TRUE にする。
 *             デモやテスト用のタイトルは FALSE のままにしておく。
 *             ここを書き換えても再デプロイは要らない。
 *  <シート名>: タイトルごとのスコア。列は下の HEADERS。
 *  "_" で始まるシートはスコアのシートとして扱わない。
 *
 * game を付けない(旧版の)リクエストは "ranking" シート（咲耶スクランブル）を使うので、
 * 既存のデータと旧版のページはそのまま動く。
 *
 * ── 総合ランキングの計算 ──────────────────────────────────
 *  1. タイトルごとに、各プレイヤーの自己ベストを出す
 *  2. 自己ベスト ÷ そのタイトルの1位のスコア × 1000 をそのタイトルのポイントにする
 *     （どのタイトルも満点は1000。スコアの桁がタイトルごとに違っても公平になる）
 *  3. 全タイトルのポイントを合計した値で順位を付ける（同点は遊んだタイトル数が多い方が上）
 *  プレイヤーの同一判定: X ID があれば X ID（大文字小文字は区別しない）、無ければニックネーム。
 *  救出したCNPは全タイトル・全プレイの合算を返す。
 *
 * ── セットアップ ──────────────────────────────────────────
 * 1. 咲耶スクランブルのスプレッドシートを開く（既存の "ranking" シートをそのまま使う）
 * 2. 拡張機能 → Apps Script に、このファイルの内容を貼り付けて保存
 * 3. 「デプロイを管理」→ 既存デプロイの編集 → バージョン「新バージョン」
 *    （URLが変わらないので、咲耶スクランブルの設定はそのまま）
 *    新しく作る場合は「新しいデプロイ」→ウェブアプリ、実行ユーザー=自分、アクセス=全員
 * 4. 発行された URL を各タイトルの createKit({ gasUrl }) に入れる
 * 5. 他のタイトルの過去データを取り込むときは、このスプレッドシートにシートをコピーし、
 *    列を HEADERS の並びにそろえてから、_games に行を足す
 *
 * 「救出キャラ」は CNP の 1 始まりの番号をカンマ区切りにしたもの（例 "1,3,7"）。
 * 番号の対応は sakuya-kit/src/cnp.js の CNP_DEFS。
 */

const GAMES_SHEET = "_games";
const GAMES_HEADERS = ["gameId", "タイトル", "シート名", "総合に含める"];
// _games が無いときに最初に書く行
const INITIAL_GAMES = [["scramble", "咲耶スクランブル", "ranking", true]];
const LEGACY_SHEET = "ranking"; // game を付けない旧版リクエストの行き先
const HEADERS = ["スコア", "ニックネーム", "X ID", "登録日時", "端末", "救出キャラ"];
const MAX_RECORDS_RETURNED = 100;
const MAX_OVERALL_RETURNED = 100;
const OVERALL_POINTS = 1000; // 各タイトルの満点
const OVERALL_CACHE_KEY = "overall";
const OVERALL_CACHE_SEC = 60; // 総合は全シートを読むので、登録が無い間は1分使い回す

// ── タイトル一覧 (_games) ──────────────────────────────────

function gamesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GAMES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GAMES_SHEET);
    sh.appendRow(GAMES_HEADERS);
    INITIAL_GAMES.forEach(function (r) {
      sh.appendRow(r);
    });
  }
  return sh;
}

function readGames_() {
  const rows = gamesSheet_().getDataRange().getValues().slice(1);
  return rows
    .filter(function (r) {
      return String(r[0] || "").trim();
    })
    .map(function (r) {
      const id = String(r[0]).trim();
      return {
        id: id,
        title: String(r[1] || id).trim(),
        sheet: String(r[2] || id).trim(),
        overall: r[3] === true || String(r[3]).toUpperCase() === "TRUE",
      };
    });
}

// gameId → { id, title, sheet, overall }。未登録なら null（不正なIDも null）
function resolveGame_(game, autoRegister) {
  const g = String(game || "").trim();
  const games = readGames_();
  if (!g) {
    const legacy = games.filter(function (x) {
      return x.sheet === LEGACY_SHEET;
    })[0];
    return legacy || { id: "", title: "", sheet: LEGACY_SHEET, overall: false };
  }
  const hit = games.filter(function (x) {
    return x.id === g;
  })[0];
  if (hit) return hit;
  // シート名に使えるのは英数字・ハイフン・アンダースコアのみ。"_" 始まりは予約
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(g)) return null;
  const created = { id: g, title: g, sheet: g, overall: false };
  if (autoRegister) gamesSheet_().appendRow([g, g, g, false]);
  return created;
}

function scoreSheet_(name, create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    if (!create) return null;
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS);
    return sheet;
  }
  // 古いシートに無い見出し列を、空のときだけ補う
  const lastCol = sheet.getLastColumn();
  for (let c = lastCol + 1; c <= HEADERS.length; c++) {
    const cell = sheet.getRange(1, c);
    if (!String(cell.getValue() || "").trim()) cell.setValue(HEADERS[c - 1]);
  }
  return sheet;
}

function readRecords_(sheet) {
  if (!sheet) return [];
  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(function (r) {
      return r[1] !== "" && r[1] != null; // ニックネームが空の行は除外
    })
    .map(function (r) {
      return {
        score: Number(r[0] || 0),
        nickname: String(r[1] || ""),
        xid: String(r[2] || ""),
        created: r[3] ? new Date(r[3]).getTime() : null,
        device: String(r[4] || ""),
        rescued: String(r[5] == null ? "" : r[5]),
      };
    });
}

// ── 総合ランキング ─────────────────────────────────────────

function playerKey_(rec) {
  const xid = String(rec.xid || "").replace(/^@/, "").trim().toLowerCase();
  if (xid) return "x:" + xid;
  const name = String(rec.nickname || "").trim();
  const norm = name.normalize ? name.normalize("NFKC") : name;
  return "n:" + norm.toLowerCase();
}

function parseRescued_(s) {
  return String(s || "")
    .split(",")
    .map(function (v) {
      return Number(v);
    })
    .filter(function (v) {
      return v >= 1 && v <= 99 && Math.floor(v) === v;
    });
}

function computeOverall_() {
  const games = readGames_().filter(function (g) {
    return g.overall;
  });
  const players = {};
  const gameSummaries = [];

  games.forEach(function (g) {
    const recs = readRecords_(scoreSheet_(g.sheet, false));
    // 自己ベスト（同点なら先に出した方）
    const best = {};
    recs.forEach(function (r) {
      const key = playerKey_(r);
      const p = players[key] || (players[key] = { key: key, nickname: "", xid: "", total: 0, games: {}, rescued: {}, last: 0 });
      // 表示名は最後に登録した記録のものを使う
      if ((r.created || 0) >= p.last) {
        p.last = r.created || 0;
        p.nickname = r.nickname;
        if (r.xid) p.xid = String(r.xid).replace(/^@/, "").trim();
      }
      parseRescued_(r.rescued).forEach(function (n) {
        p.rescued[n] = true;
      });
      if (!best[key] || r.score > best[key]) best[key] = r.score;
    });
    const scores = Object.keys(best).map(function (k) {
      return best[k];
    });
    const top = scores.length ? Math.max.apply(null, scores) : 0;
    gameSummaries.push({ id: g.id, title: g.title, top: top, players: scores.length });
    if (top <= 0) return;
    Object.keys(best).forEach(function (key) {
      const pts = Math.max(0, Math.round((OVERALL_POINTS * best[key]) / top));
      players[key].games[g.id] = { score: best[key], points: pts };
      players[key].total += pts;
    });
  });

  const list = Object.keys(players)
    .map(function (k) {
      const p = players[k];
      return {
        nickname: p.nickname,
        xid: p.xid,
        total: p.total,
        played: Object.keys(p.games).length,
        games: p.games,
        rescued: Object.keys(p.rescued)
          .map(Number)
          .sort(function (a, b) {
            return a - b;
          })
          .join(","),
      };
    })
    .filter(function (p) {
      return p.played > 0;
    })
    .sort(function (a, b) {
      return b.total - a.total || b.played - a.played;
    })
    .slice(0, MAX_OVERALL_RETURNED);

  return { games: gameSummaries, players: list, maxPerGame: OVERALL_POINTS, updated: Date.now() };
}

function overall_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(OVERALL_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const data = computeOverall_();
  try {
    cache.put(OVERALL_CACHE_KEY, JSON.stringify(data), OVERALL_CACHE_SEC);
  } catch (e) {
    /* 100KBを超えたらキャッシュしないだけ */
  }
  return data;
}

// ── Web App ────────────────────────────────────────────────

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "overall") return jsonOut_(overall_());

  const game = resolveGame_(p.game, false);
  if (!game) return jsonOut_({ records: [], error: "invalid game" });
  const records = readRecords_(scoreSheet_(game.sheet, false))
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, MAX_RECORDS_RETURNED);
  return jsonOut_({ records: records, game: { id: game.id, title: game.title } });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const gameParam = (e.parameter && e.parameter.game) || body.game;

    if (body.action === "add") {
      const rec = body.record || {};
      const nickname = String(rec.nickname || "").trim().slice(0, 20);
      const xid = String(rec.xid || "").replace(/^@/, "").trim().slice(0, 20);
      const score = Number(rec.score || 0);
      const created = rec.created || Date.now();
      const device = String(rec.device || "").trim().slice(0, 20);
      // 数字とカンマ以外は落とす（"1,3,7" の形以外は入れない）
      const rescued = String(rec.rescued || "").replace(/[^0-9,]/g, "").slice(0, 40);
      if (!nickname) return jsonOut_({ success: false, error: "nickname is required" });

      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const game = resolveGame_(gameParam, true);
        if (!game) return jsonOut_({ success: false, error: "invalid game" });
        scoreSheet_(game.sheet, true).appendRow([score, nickname, xid, new Date(created), device, rescued]);
      } finally {
        lock.releaseLock();
      }
      CacheService.getScriptCache().remove(OVERALL_CACHE_KEY);
      return jsonOut_({ success: true });
    }
    return jsonOut_({ success: false, error: "unknown action" });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
