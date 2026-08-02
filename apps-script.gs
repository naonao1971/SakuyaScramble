/**
 * ExciteByc ランキング用 Google Apps Script (Web App)
 *
 * セットアップ手順:
 * 1. Google スプレッドシートを新規作成する
 * 2. シート名を "ranking" にする（1行目はヘッダー行として自動生成されます）
 * 3. 拡張機能 → Apps Script を開き、このファイルの内容を貼り付けて保存
 * 4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選択
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. デプロイ後に発行される URL（https://script.google.com/macros/s/.../exec）を
 *    index.html の GAS_URL 定数にセットする
 *
 * スプレッドシートの列（1レコード = 1行）:
 *   スコア | ニックネーム | X ID | 登録日時 | 端末 | 救出キャラ
 *
 * ※「端末」「救出キャラ」は末尾に追加した列です。過去に登録済みの行は空欄の
 *   ままになりますが、既存の列の位置はそのままなので過去データが壊れることは
 *   ありません。
 *
 * ※「救出キャラ」は、その1プレイで救出したCNPキャラのIDをカンマ区切りにした
 *   ものです（例: "1,3,7,11"）。IDは assets/cnp/cnpNN.png の NN と対応します。
 *
 * ※ 列を増やしたため、このファイルを貼り直したうえで
 *   「デプロイ」→「デプロイを管理」→ 既存デプロイの編集 → バージョン「新バージョン」
 *   で再デプロイしてください。再デプロイしないと救出キャラは記録されません
 *   （記録されないだけで、既存のスコア登録は従来どおり動きます）。
 */

const SHEET_NAME = "ranking";
const MAX_RECORDS_RETURNED = 100; // 取得件数の上限（フロント側でTOP10に絞り込む）
const HEADERS = ["スコア", "ニックネーム", "X ID", "登録日時", "端末", "救出キャラ"];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    return sheet;
  }
  // 既存シートには「救出キャラ」の見出しが無い。空のときだけ補う
  // （既に何か入っている場合は触らない）
  const lastCol = sheet.getLastColumn();
  if (lastCol < HEADERS.length) {
    const cell = sheet.getRange(1, HEADERS.length);
    if (!String(cell.getValue() || "").trim()) {
      cell.setValue(HEADERS[HEADERS.length - 1]);
    }
  }
  return sheet;
}

function doGet(e) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1); // ヘッダー行を除く

  const records = rows
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
        rescued: String(r[5] == null ? "" : r[5])
      };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    })
    .slice(0, MAX_RECORDS_RETURNED);

  return ContentService
    .createTextOutput(JSON.stringify({ records: records }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === "add") {
      const rec = body.record || {};
      const nickname = String(rec.nickname || "").trim().slice(0, 20);
      const xid = String(rec.xid || "").replace(/^@/, "").trim().slice(0, 20);
      const score = Number(rec.score || 0);
      const created = rec.created || Date.now();
      const device = String(rec.device || "").trim().slice(0, 20);
      // 数字とカンマ以外は落とす（"1,3,7" の形以外は入れない）
      const rescued = String(rec.rescued || "").replace(/[^0-9,]/g, "").slice(0, 40);

      if (!nickname) {
        return jsonOut_({ success: false, error: "nickname is required" });
      }

      const sheet = getSheet_();
      sheet.appendRow([score, nickname, xid, new Date(created), device, rescued]);
      return jsonOut_({ success: true });
    }

    return jsonOut_({ success: false, error: "unknown action" });
  } catch (err) {
    return jsonOut_({ success: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
