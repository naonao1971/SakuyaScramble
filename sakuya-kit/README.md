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
| 結果の演出 | CLEAR / GAME OVER の演出動画（解錠、フォールバック、スキップ、ミュート連動）と、共通の見た目の結果画面 |
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
    cutscenes: {
      clear: { src: "clear.mp4", image: "clear.png" }, // 流し終えたら静止画に戻る
      gameOver: { src: "gameover.mp4" },               // タップ・キーで飛ばせる
    },

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
| `controls.gyro` | `false` | 傾き操作。下の「ジャイロ操作」を参照 |
| `controls.keys` | 矢印 / WASD | `{ up: [...], down: [...], left: [...], right: [...] }` |
| `controls.buttons` | `[]` | `{ id, label, ariaLabel, keys, primary, onPress, onRelease }`。右端から並ぶ |
| `controls.toggles` | `[]` | 長押しトグル `{ id, name, label, labelOff, value, onChange }` |
| `controls.mute` / `controls.fullscreen` | `true` | 🔊 と ⛶ のトグル |
| `share` | なし | `{ when: "clear" \| "always", text(result), image?(result) → canvas, fileName?, url? }` |
| `startAnchor` | 下端中央 | スタートボタンを置く canvas 座標 `{ x, y }` |
| `help` | | `{ pc, mobile, playing }` の案内文 |
| `footer` | 非公式ファンアート表記 | `false` で出さない |
| `cutscenes.clear` / `cutscenes.gameOver` | なし | `{ src, image?, skippable?, blockResults?, loop? }`。下の「結果の演出」を参照 |
| `resultScreen` | 標準の結果画面 | `{ clearTitle, gameOverTitle, mediaWidth, decorate(ctx, info) }`。`false` にすると kit は描かない |
| `jingle` | `true` | 動画が無い、または再生できないときに `sfx.clear()` / `sfx.gameOver()` を鳴らす |
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
| `kit.gyro` | ジャイロ無効なら `null`。`active`、`recalibrate()`、`toggle()` |
| `kit.cutscene` | `playing`、`kind`（`"clear"` / `"gameOver"` / `null`）、`skip()`、`videos` |

## ジャイロ操作（使うタイトルだけ）

既定では使いません。使うタイトルは `controls.gyro` を指定します。

| 指定 | 動き |
|---|---|
| `gyro: true` | スタート時に自動で傾き操作に切り替える（咲耶スクランブル方式）。🕹️ を長押しするとスティックに戻る |
| `gyro: { autoStart: false }` | 最初はスティック。📱 を長押しした人だけ傾き操作に切り替わる |
| `gyro: { sensitivity: 0.55, deadzoneDeg: 4, maxDeg: 28 }` | 効き具合の調整（全開時の強さ、無視する傾き、最大入力になる傾き） |

- 傾きは `kit.input.axis()` に合成されるので、ゲーム側の移動処理は変わりません。生の値は `kit.input.gyroX` / `gyroY` です
- 基準（水平）は、傾き操作を始めたときの持ち方です。端末を回転させると取り直します
- 傾き操作中はスティックを無効にします（両方が足し合わさると、左側に触れただけで流れるため）
- iOS の許可ダイアログはスタートのタップ、またはトグルの長押しから出します
- 許可されても傾きデータが届かない端末では、1.5 秒後に自動でスティックへ戻します
- タッチ端末でない場合（PC）は何も起きません

## 結果の演出（CLEAR / GAME OVER）

`kit.gameOver({ cleared })` を呼ぶと、kit が次の順で処理します。

1. `cutscenes` に動画があり、途切れずに流せる状態なら、動画を再生する（音は動画のものを使う）
2. 動画が無い、読み込みが間に合わない、再生できない場合は、ジングル（`sfx.clear` / `sfx.gameOver`）を鳴らす
3. 結果画面を共通の見た目で描く

| | GAME OVER（既定） | CLEAR（既定） |
|---|---|---|
| 飛ばせるか (`skippable`) | タップ・キーで飛ばせる | 飛ばせない |
| 再生中の結果画面 (`blockResults`) | 隠す（流し終えるか飛ばしてから出す） | 出す（ランキング入力と並行） |
| 画面 | 動画だけ → 終わったら「GAME OVER / PUSH START」 | 上に動画 → 終わったら `image` の静止画、下に「CLEAR / SCORE」 |

- 動画は `preload="none"` で、スタートのタップのときに解錠と読み込みを始めます（iOS 対策）
- 🔊 のトグルは、再生中の動画の音にもすぐ反映されます
- 再スタートすると動画は止まり、先頭に戻ります
- 救出ロスターなど、タイトル独自の飾りは `resultScreen.decorate(ctx, { kind, rect, result, playing, kit })` で描き足します。`rect` は動画または静止画を描いた枠です
- 再生中かどうかは `kit.cutscene.playing` / `kit.cutscene.kind` で分かります（パイロット窓を隠すときなど）

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
