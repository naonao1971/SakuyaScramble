# sakuya-kit

咲耶シリーズのブラウザゲームで共通の部品を1か所にまとめたキットです。
各タイトルは **1プレイの中身（`update` / `render`）だけ** を書き、次の部品は kit が受け持ちます。

| 部品 | 内容 |
|---|---|
| コントローラー | キーボード、左半分のバーチャルスティック（アナログ／4方向／上でボタン）、画面右半分の長押し、ジャイロ（任意）、右下のボタン群、長押しトグル、自動連射（V）、音（M） |
| お決まりの仕組み | スコア（1UP・ハイスコア保存）、残機、チェックポイント、CNP の回収管理、HUD（スコア・ロスター・残機・ゲージ） |
| ポーズ | canvas 中央のボタン、P / Esc キー、タブ切替や通知の割り込み時の入力リセット |
| スコア登録 | TOP10 入り判定、ニックネームと X ID（実在確認つき）の入力フォーム |
| ランキング | Google スプレッドシート + GAS（全タイトルで1本の GAS を共有）。タイトル別と**総合ランキング**の切り替えタブ付き |
| CNP | 11体の ID・名前・色・画像の正典、ランキングに出す救出ロスター |
| 結果の演出 | CLEAR / GAME OVER の演出動画（解錠、フォールバック、スキップ、ミュート連動）と、共通の見た目の結果画面 |
| タイトル・OGP | タイトル名・OGP画像・アイコン・manifest.json を、全タイトル同じ手順で差し替えるツール（`tools/ogp.html`）。中身はタイトルごとに自由 |
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
| `overall` | `true` | ランキングに「このゲーム / 総合」のタブを出す |
| `cnp` | `false` | `true` で `kit.cnp` を使えるようにし、ランキングに救出ロスターを出す。権利表記のフッターも出る |
| `lives` | なし | `{ start: 3, extendEvery: 20000 }`（`true` なら3機・1UPなし） |
| `hiScoreKey` | `sakuya-kit:hi:<gameId>` | 旧版のハイスコアを引き継ぐときに、旧版の localStorage のキーを指定 |
| `maxScore` | なし | これを超える記録は登録フォームを出さない（GAS の `_games` のスコア上限と同じ値にする） |
| `rankingLabels` | `{ clear: "クリア", progress: "進行" }` | ランキングの2段目の言葉（ラリーなら `progress: "踏破"`） |
| `controls.stick` | `true` | 左半分のバーチャルスティック |
| `controls.stickDigital4` | `false` | スティックを4方向に丸める（迷路系向け） |
| `controls.stickSensitivity` | `0.5` | いっぱいに倒したときの強さ（キー入力 = 1） |
| `controls.gyro` | `false` | 傾き操作。下の「ジャイロ操作」を参照 |
| `controls.keys` | 矢印 / WASD | `{ up: [...], down: [...], left: [...], right: [...] }` |
| `controls.stickUpButton` | なし | スティックを上に倒したときに押すボタンの id（ジャンプ等） |
| `controls.rightHalfButton` | なし | 画面の右半分を押している間押すボタンの id |
| `controls.autoFire` | なし | 下の「自動連射」を参照 |
| `controls.muteKey` | `"KeyM"` | 音の切り替えキー |
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
| `kit.ranking` | `load()`、`loadOverall(force)`、`setTab("game" \| "overall")`、`records`、`overall` |
| `kit.cutscene` | `playing`、`kind`（`"clear"` / `"gameOver"` / `null`）、`skip()`、`videos` |

## 自動連射

```js
controls: {
  autoFire: { onFire: (kit) => fireVulcan(), interval: 10 },          // 🔫 の長押しトグル（スクランブル方式）
  // autoFire: { onFire, button: "fire" },  // fire ボタンを短くタップで切り替え、押し続けたら通常の押下（ジャンプバグ方式）
}
```

- `defaultOn`: `"touch"`（既定。タッチ端末だけ最初からオン）/ `true` / `false`
- `key`: 切り替えキー（既定 `"KeyV"`）。`tapMs`: ボタン方式でタップとみなす長さ（既定 250ms）
- オンの間、プレイ中は `interval` フレームごとに `onFire(kit)` が呼ばれる（ポーズ中・縦持ち中は止まる）
- ボタン方式では、オンの間そのボタンをマゼンタで縁取る
- `kit.autoFire.on` / `set(bool)` / `toggle()`

## お決まりの仕組み（使う分だけ）

| | 使い方 |
|---|---|
| スコア | `kit.score.add(100)`、`kit.score.value`、`kit.score.hi`。`lives.extendEvery` ごとに残機+1（`onExtend` フック） |
| 残機 | `kit.lives.lose()`（残りを返す）、`gain()`、`value` |
| チェックポイント | `kit.checkpoint.set({ x, y }, index)`、`kit.checkpoint.value` |
| CNP の回収 | `kit.cnp.run.collect(ch.no)`（初めてなら true）、`has(no)`、`count`、`list()`、`pick(weight?)`（未回収ほど出やすい） |
| HUD | `kit.hud.score()`（左上）、`kit.hud.roster()`（上段中央）、`kit.hud.lives()`（右上）、`kit.hud.gauge({ label: "FUEL", ratio })` |

- どれもスタートのたびに kit が初期化します
- `kit.gameOver({ cleared, progress })` だけ呼べば、スコアは `kit.score.value`、救出キャラは `kit.cnp.run.list()` が使われ、ハイスコアも保存されます（明示して渡すこともできます）
- ランキングには、クリア・進行度（0〜100）・CNP の体数も記録され、2段目に表示されます

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

## タイトル名・OGP画像・アイコンの差し替え

タイトル名や絵柄はタイトルごとに違ってかまいません。全タイトルでそろえるのは**差し替えの手順と、ファイル名・サイズ・書き方**です。

OGP は X や LINE のクローラが `<head>` を直接読んで作ります。JavaScript は実行されないので、kit.js からは差し込めません。
そのため、`tools/ogp.html`（ブラウザで開くだけで使えます）でファイルを作って置く方式にしています。

### 差し替えの手順（どのタイトルも同じ）

1. `tools/ogp.html` を開き、主題、副題、日本語名、説明文、URL を入力して、キービジュアルを選ぶ
2. 「画像をまとめて保存」と「manifest.json を保存」を押し、できたファイルをリポジトリの直下に上書きで置く
3. 「`<head>` の中身」をコピーし、index.html の `<head>` の中身と丸ごと入れ替える
4. 「`createKit` の設定」の `title` / `subtitle` を、index.html の `createKit` に反映する
5. 公開後、X などのカード確認ツールで表示を確かめる（反映に時間がかかることがあります）

### そろえるもの

| 項目 | 決まり |
|---|---|
| ファイル名 | `ogp.png`、`apple-touch-icon.png`、`icon-192.png`、`icon-512.png`、`favicon-32.png`、`manifest.json`（すべてリポジトリ直下） |
| サイズ | OGP 1200x630、アイコン 180 / 192 / 512 / 32 |
| タイトル表記 | `<title>` と `og:title` は「主題 ─ 副題」（例：`SAKUYA SCRAMBLE ─ RESCUE 11 CNP`）。副題の前後の `- -` は外す |
| `<head>` | ツールが書き出す並びのまま（手で書き足さない） |

- **OGP 画像の仕上げ：** 既定は「絵をそのまま使う」（キービジュアルを 1200x630 に切り抜くだけ）です。タイトル文字や金の枠を重ねたいときだけ「タイトル文字と金の枠を重ねる」を選びます
- **アイコン：** 黒地に金の枠と中央のモチーフ。モチーフは、キービジュアルの一部か文字・絵文字をタイトルごとに選びます
- `createKit` の title/subtitle と `<title>` がずれていると、kit が開発者コンソールに警告を出します

## 色を変えたいとき

部品の寸法、配置、ベベルは変えません。変えてよいのは色トークンだけで、kit.css の後に書きます。

```html
<style>:root { --magenta: #3BD1FF; }</style>
```

canvas 側の `kit.retro.colors` も同じトークンを読むので、CSS と JS の両方を直す必要はありません。

## ランキング（GAS）と総合ランキング

[`gas/apps-script.gs`](gas/apps-script.gs) を1つのスプレッドシートにデプロイし、全タイトルでその URL を共有します。
スコアはタイトルごとのシートに入り、タイトルの一覧はスプレッドシートの `_games` シートで管理します。

| `_games` の列 | 内容 |
|---|---|
| スコア上限 | これを超える記録（と負の値）は GAS が断る。空欄なら上限なし |
| gameId | `createKit({ gameId })` と同じ値 |
| タイトル | 総合ランキングに出す名前 |
| シート名 | スコアを入れるシート（咲耶スクランブルは既存の `ranking`） |
| 総合に含める | `TRUE` のタイトルだけが総合ランキングの対象 |

- スコアのシートは、列の**位置ではなく1行目の見出し**で読み書きします。ラリーとジャンプバグの旧版のシートは、共通のスプレッドシートにそのままコピーすれば読めます（「踏破率」は「進行度」として扱う）
- 初めてスコアが届いたタイトルは、`_games` に自動で行が足されます（総合には `FALSE` の状態で入る）。公開するタイトルは手で `TRUE` にしてください。デモやテスト用は `FALSE` のままにします
- `_games` の編集に再デプロイは要りません（総合ランキングは最大1分キャッシュされます）

### 総合ランキングの計算

1. タイトルごとに、各プレイヤーの自己ベストを出す
2. **自己ベスト ÷ そのタイトルの1位 × 1000** を、そのタイトルのポイントにする（どのタイトルも満点は 1000）
3. 全タイトルのポイントの合計で順位を付ける（同点なら遊んだタイトル数が多い方が上）

- 同じ人の判定は、X ID があれば X ID（大文字と小文字は区別しない）、無ければニックネームで行います
- 救出した CNP は、全タイトル・全プレイの分を合算して表示します
- 登録したニックネームと X ID は、次回の登録フォームに自動で入ります（同じ端末・同じドメインの中だけ）

### ゲームの無いページに総合ランキングだけ出す

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.1.0/kit.css">
<section id="board"></section>
<script type="module">
  import { mountOverallRanking } from "https://cdn.jsdelivr.net/gh/naonao1971/sakuya-kit@0.1.0/kit.js";
  mountOverallRanking(document.getElementById("board"), { gasUrl: "https://script.google.com/macros/s/.../exec", limit: 50 });
</script>
```

## ディレクトリ

```
kit.js / kit.css   入口
src/               部品ごとのモジュール
assets/cnp/        CNP 画像（256x256・透過 PNG）
gas/               共通ランキング用 Apps Script
demo/              最小の動作例（テンプレートの元）
tools/ogp.html     タイトル表記・OGP画像・アイコン・<head>・manifest.json を作るツール
docs/INVENTORY.md  3作の共通部品の棚卸し（何を kit に入れ、何をタイトル側に残したか）
skills/sakuyagamesskill/SKILL.md
                   新作を作るときに Claude が従うルール（テンプレートの .claude/skills/sakuyagamesskill/ に置く）
```
