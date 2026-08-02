#!/usr/bin/env python3
"""CNP キャラ画像を、咲耶スクランブルの救出対象アセットに変換する。

やること:
  1. 背景除去   … 四隅の色を背景色とみなし、近い色を透明にする（透過済みなら素通り）
  2. 余白トリム … 不透明ピクセルの外接矩形まで切り詰める
  3. 正方形化   … 中央寄せ + 一定の余白（ゲーム内で拡縮しても比率が崩れない）
  4. リサイズ   … 既定 256x256 の PNG として assets/cnp/ に書き出す

使い方:
    python3 tools/make_rescue_assets.py 元画像1.png 元画像2.jpg ...

  与えた順に cnp01.png, cnp02.png, ... という名前で出力する。
  出力名を自分で決めたい場合は --name を使う（入力と同数を並べる）:

    python3 tools/make_rescue_assets.py a.png b.png --name leelee luna

  背景が複雑で四隅から拾えない場合は --no-bg-removal を付けて、
  透過済みの画像だけを渡すこと。

必要: Pillow  (pip install pillow)
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が必要です:  pip install pillow")

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "cnp"


def remove_flat_background(img, tolerance):
    """四隅から背景色を推定し、それに近いピクセルを透明にする。

    四隅の色がばらついている場合（＝背景が単色でない）は、誤って
    キャラ本体を削るほうが害が大きいので、何もせずに返す。
    """
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]

    # 既に四隅が透明なら、透過済みの画像とみなして触らない
    if all(c[3] == 0 for c in corners):
        return img

    for i in range(1, 4):
        if sum(abs(corners[i][k] - corners[0][k]) for k in range(3)) > tolerance:
            print("  ! 四隅の色がばらついているため背景除去をスキップしました", file=sys.stderr)
            return img

    bg = corners[0]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and sum(abs(v - c) for v, c in zip((r, g, b), bg[:3])) <= tolerance:
                px[x, y] = (r, g, b, 0)
    return img


def trim_and_square(img, pad_ratio):
    """不透明部分まで切り詰め、余白付きの正方形キャンバスに中央配置する。"""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    side = int(max(img.size) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources", nargs="+", type=Path, help="元画像のパス")
    ap.add_argument("--name", nargs="*", default=None, help="出力名（拡張子なし）。入力と同数")
    ap.add_argument("--size", type=int, default=256, help="出力の一辺(px)。既定 256")
    ap.add_argument("--pad", type=float, default=0.06, help="キャラ周囲の余白比率。既定 0.06")
    ap.add_argument("--tolerance", type=int, default=30, help="背景色とみなす許容差。既定 30")
    ap.add_argument("--no-bg-removal", action="store_true", help="背景除去をせず、透過済みとして扱う")
    args = ap.parse_args()

    if args.name and len(args.name) != len(args.sources):
        sys.exit(f"--name は入力と同数にしてください（入力 {len(args.sources)} / 名前 {len(args.name)}）")

    missing = [p for p in args.sources if not p.exists()]
    if missing:
        sys.exit("見つかりません: " + ", ".join(str(p) for p in missing))

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for i, src in enumerate(args.sources):
        name = args.name[i] if args.name else f"cnp{i + 1:02d}"
        img = Image.open(src).convert("RGBA")
        print(f"{src.name}  {img.width}x{img.height}")

        if not args.no_bg_removal:
            img = remove_flat_background(img, args.tolerance)

        img = trim_and_square(img, args.pad)
        img = img.resize((args.size, args.size), Image.LANCZOS)

        out = OUT_DIR / f"{name}.png"
        img.save(out)
        print(f"  -> {out.relative_to(OUT_DIR.parent.parent)}  {args.size}x{args.size}")

    print(f"\n{len(args.sources)} 件を書き出しました。index.html をリロードすれば反映されます。")


if __name__ == "__main__":
    main()
