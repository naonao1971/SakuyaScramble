/**
 * 咲耶シリーズ 共通ランキング用 Google Apps Script (Web App)
 *
 * 1本のスクリプト・1つのスプレッドシートで全タイトルのランキングを持つ。
 * タイトルごとにシートを分け、シート名は ?game=<gameId> で決まる。
 *   GET  <URL>?game=scramble            → そのタイトルの上位記録(JSON)
 *   POST <URL>?game=scramble  {action:"add", record:{...}}
 *
 * game を付けない(旧版の)リクエストは "ranking" シートを使うので、
 * 咲耶スクランブルの既存データはそのまま読める。
 * 既存シートをそのまま使いたいタイトルは、下の SHEET_ALIASES に書く。
 *
 * セットアップ手順:
 * 1. Google スプレッドシートを用意する（咲耶スクランブルのものを流用してよい）
 * 2. 拡張機能 → Apps Script を開き、このファイルの内容を貼り付けて保存
 * 3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *    - 実行するユーザー: 自分 / アクセスできるユーザー: 全員
 *    既存デプロイを更新する場合は「デプロイを管理」→編集→バージョン「新バージョン」
 *    （URLが変わらないので各タイトルの設定はそのまま）
 * 4. 発行された URL を各タイトルの createKit({ gasUrl }) に入れる
 *
 * シートの列（1レコード = 1行）:
 *   スコア | ニックネーム | X ID | 登録日時 | 端末 | 救出キャラ
 * 「救出キャラ」は CNP の 1 始まりの番号をカンマ区切りにしたもの（例 "1,3,7"）。
 * 番号の対応は sakuya-kit/src/cnp.js の CNP_DEFS。
 */

const DEFAULT_SHEET = "ranking";
// gameId → シート名 の読み替え。既存シートを流用するタイトルだけ書く
const SHEET_ALIASES = {
  scramble: "ranking",
};
const MAX_RECORDS_RETURNED = 100;
const HEADERS = ["スコア", "ニックネーム", "X ID", "登録日時", "端末", "救出キャラ"];

function sheetNameFor_(game) {
  const g = String(game || "").trim();
  if (!g) return DEFAULT_SHEET;
  if (SHEET_ALIASES[g]) return SHEET_ALIASES[g];
  // シート名に使えるのは英数字・ハイフン・アンダースコアのみ（勝手なシートを量産させない）
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(g)) return null;
  return g;
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
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

function doGet(e) {
  const name = sheetNameFor_(e && e.parameter && e.parameter.game);
  if (!name) return jsonOut_({ records: [], error: "invalid game" });
  const sheet = getSheet_(name);
  const rows = sheet.getDataRange().getValues().slice(1);
  const records = rows
    .filter(function (r) {
      return r[1] !== "" && r[1] != null;
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
    })
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, MAX_RECORDS_RETURNED);
  return jsonOut_({ records: records });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const game = (e.parameter && e.parameter.game) || body.game;
    const name = sheetNameFor_(game);
    if (!name) return jsonOut_({ success: false, error: "invalid game" });

    if (body.action === "add") {
      const rec = body.record || {};
      const nickname = String(rec.nickname || "").trim().slice(0, 20);
      const xid = String(rec.xid || "").replace(/^@/, "").trim().slice(0, 20);
      const score = Number(rec.score || 0);
      const created = rec.created || Date.now();
      const device = String(rec.device || "").trim().slice(0, 20);
      const rescued = String(rec.rescued || "").replace(/[^0-9,]/g, "").slice(0, 40);
      if (!nickname) return jsonOut_({ success: false, error: "nickname is required" });

      getSheet_(name).appendRow([score, nickname, xid, new Date(created), device, rescued]);
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
