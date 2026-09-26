// 結果のシェア。対応端末は OS の共有シートへ画像とテキストを渡す。
// 非対応なら画像を保存してから X の投稿画面を開く（X は URL 経由の画像添付に非対応）。
export function openXIntent(text, pageUrl) {
  const params = new URLSearchParams({ text, url: pageUrl || location.origin + location.pathname });
  window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank", "noopener");
}

export async function shareResult({ text, canvas, fileName = "result.png", pageUrl, status }) {
  const openXIntentFor = (t) => openXIntent(t, pageUrl);
  try {
    const blob = canvas ? await new Promise((resolve) => canvas.toBlob(resolve, "image/png")) : null;
    const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ text, files: [file] });
    } else if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      openXIntentFor(text);
      status("画像を保存しました。投稿画面に添付してください");
    } else {
      openXIntentFor(text);
    }
  } catch (e) {
    // 共有シートをキャンセルしたときも AbortError で reject されるので、それはエラー扱いしない
    if (e && e.name !== "AbortError") {
      status("画像の作成に失敗しました。テキストのみ投稿します");
      openXIntentFor(text);
    }
  }
}
