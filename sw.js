// 咲耶シリーズ共通のオフライン対応（sakuya-kit F1）。中身は kit の sw-core.js。
// kit が sw.js?kit=<版> で登録するので、kit の版を上げてもこのファイルは書き換えなくてよい
importScripts(`https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@${new URL(location).searchParams.get("kit")}/sw-core.js`);
