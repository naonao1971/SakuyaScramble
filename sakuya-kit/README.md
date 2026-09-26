# sakuya-kit

咲耶シリーズのブラウザゲームで共通の部品を1か所にまとめたキットです。
各タイトルは **1プレイの中身（`update` / `render`）だけ** を書き、次の部品は kit が受け持ちます。

| 部品 | 内容 |
|---|---|
| コントローラー | キーボード、左半分のバーチャルスティック、ジャイロ（任意）、右下のボタン群、長押しトグル |
| ポーズ | canvas 中央のボタン、P / Esc キー、タブ切替や通知の割り込み時の入力リセット |
| スコア登録 | TOP10 入り判定、ニックネームと X ID（実在確認つき）の入力フォーム |
| ランキング | Google スプレッドシート + GAS（全タイトルで1本の GAS を共有） |
| CNP | 11体の ID・名前・色・画像の正典、ランキングに出す救出ロスター |
| その他 | スタートボタン、縦持ち案内、全画面／ホーム画面追加の案内、効果音とミュート、シェア、60Hz 固定ループ、レトロ UI |

ビルドは不要です（素の ES Modules）。

## 使い方

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.1.0/kit.css">

<div class="sk-wrap">
  <canvas id="game" width="960" height="540"></canvas>
</div>

<script type="module">
  import { createKit } from "https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.1.0/kit.js";

  const kit = createKit({
    gameId: "scramble",                 // ランキングのシート名になる（英数字・-・_）
    title: "SAKUYA SCRAMBLE",
    subtitle: "- RESCUE 11 CNP -",
    gasUrl: "https://script.google.com/macros/s/.../exec",
    cnp: true,
    controls: {
      stick: true,
      gyro: true,
      buttons: [
        { id: "fire", label: "X", keys: ["KeyX"], primary: true,
          onPress: () => {...}, onRelease: () => {...} },
        { id: "bomb", label: "💣", keys: ["KeyZ"], onPress: () => {...} },
      ],
      toggles: [
        { id: "autofire", name: "自動連射", label: "🔫", value: true, onChange: (on) => {...} },
      ],
    },
    share: { when: "clear", text: (r) => `スコア ${r.score}` },

    onStart() { /* 1プレイ分の状態を初期化 */ },
    update(kit) { /* 60Hz 固定で呼ばれる。プレイ中かつ非ポーズ時のみ */ },
    render(ctx, kit) { /* 毎フレーム呼ばれる。kit.phase で画面を描き分ける */ },
  });

  // プレイの終わりにゲームから呼ぶ
  kit.gameOver({ score: 12345, cleared: true, rescued: [1, 4, 11] });
</script>
```

動く最小例は [`demo/index.html`](demo/index.html) です。

### バージョンは必ず固定する

`@0.1.0` のようにタグを指定して読み込みます。kit を更新しても、古いタイトルは指定したバージョンのまま動き続けます。
更新を取り込むときは、タイトル側の URL の番号を上げ、実機で確認してから公開します。

## 設定 (`createKit(cfg)`)

| キー | 既定値 | 説明 |
|---|---|---|
| `gameId` | 必須 | ランキングのシート名。GAS の `SHEET_ALIASES` で既存シートに読み替えられる |
| `title` / `subtitle` | | 縦持ち案内に出す |
| `canvas` | `#game` | |
| `gasUrl` | `""` | 空ならランキングは「まだ記録がありません」のまま |
| `cnp` | `false` | `true` で `kit.cnp` を使えるようにし、ランキングに救出ロスターを出す |
| `controls.stick` | `true` | 左半分のバーチャルスティック |
| `controls.stickDigital4` | `false` | スティックを4方向に丸める（迷路系向け） |
| `controls.stickSensitivity` | `0.5` | いっぱいに倒したときの強さ（キー入力 = 1） |
| `controls.gyro` | `false` | 傾き操作（スタート時に自動で有効化し、🕹️ のトグルで切り替え） |
| `controls.gyroSensitivity` | `0.55` | |
| `controls.keys` | 矢印 / WASD | `{ up: [...], down: [...], left: [...], right: [...] }` |
| `controls.buttons` | `[]` | `{ id, label, ariaLabel, keys, primary, onPress, onRelease }`。右端から並ぶ |
| `controls.toggles` | `[]` | 長押しトグル `{ id, name, label, labelOff, value, onChange }` |
| `controls.mute` / `controls.fullscreen` | `true` | 🔊 と ⛶ のトグル |
| `share` | なし | `{ when: "clear" \| "always", text(result), image?(result) → canvas, fileName?, url? }` |
| `startAnchor` | 下端中央 | スタートボタンを置く canvas 座標 `{ x, y }` |
| `help` | | `{ pc, mobile, playing }` の案内文 |
| `footer` | 非公式ファンアート表記 | `false` で出さない |
| `resultsBlocked()` | | `true` を返す間は結果画面（ランキング・スタート）を出さない。演出動画の再生中などに使う |

### フック

`onStart`、`onGameOver(result)`、`onPause(paused)`、`onMute(muted)`、`onInputReset`、
`onStartGesture`（スタートのタップの中で同期的に呼ばれる。動画の解錠などに使う）、
`onKeyDown(e)`（`false` を返すと kit のキー処理を止める）

`kit.on("start", fn)` の形でも登録できます。

## `kit` オブジェクト

| | |
|---|---|
| `kit.phase` | `"title"` / `"playing"` / `"over"` |
| `kit.paused` / `kit.frame` / `kit.result` | |
| `kit.input.axis()` | キー、スティック、ジャイロを合成した `{ x, y }`（各 -1..1） |
| `kit.input.up` など / `stickX` / `gyroX` / `buttons[id]` | 生の入力値 |
| `kit.sfx` | `tone()`、`noise()`、定番音 `shot` `hit` `pickup` `bonus` `explode` `stage` `gameOver` `clear` |
| `kit.retro` | `colors`、`font(px)`、`blinkOn()`、`panel()`、`frame()`、`titleText()`、`caption()`、`crt()` |
| `kit.cnp` | `chars`（`id` `label` `hue` `no` `img` `ready`）、`draw(ctx, ch, x, y, size)`、`byNo(no)` |
| `kit.status(msg)` | canvas の下の案内文 |
| `kit.gameOver(result)` / `kit.setPaused(bool)` / `kit.start()` | |

## 色を変えたいとき

部品の寸法、配置、ベベルは変えません。変えてよいのは色トークンだけで、kit.css の後に書きます。

```html
<style>:root { --magenta: #3BD1FF; }</style>
```

canvas 側の `kit.retro.colors` も同じトークンを読むので、CSS と JS の両方を直す必要はありません。

## ランキング（GAS）

[`gas/apps-script.gs`](gas/apps-script.gs) を1つのスプレッドシートにデプロイし、全タイトルでその URL を共有します。
シートはタイトルごとに `gameId` の名前で自動的に作られます。

## ディレクトリ

```
kit.js / kit.css   入口
src/               部品ごとのモジュール
assets/cnp/        CNP 画像（256x256・透過 PNG）
gas/               共通ランキング用 Apps Script
demo/              最小の動作例（テンプレートの元）
skill/SKILL.md     新作を作るときに Claude が従うルール（テンプレートに同梱する）
```
