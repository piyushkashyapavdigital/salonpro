#!/usr/bin/env python3
"""Generate the SalonPro launcher icon set.

The mark is the same monogram the app draws at runtime: an evergreen tile, a
gold hairline ring, a serif "S" and one terracotta spark. Legacy, round and
Android 8+ adaptive icons are produced from the same drawing code so the
launcher never shows three different logos.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "apps/mobile/android/app/src/main/res"
NEXT_APP = ROOT / "apps/next/app"

FONT_PATH = "/usr/share/fonts/truetype/liberation-serif-fonts/LiberationSerif-Bold.ttf"

INK_TOP = (11, 59, 52, 255)
INK_BOTTOM = (18, 107, 88, 255)
CREAM = (247, 243, 236, 255)
GOLD = (217, 179, 130, 140)
CORAL = (217, 119, 87, 255)
WHITE_SOFT = (255, 255, 255, 90)

DENSITIES = {
    "mdpi": 1.0,
    "hdpi": 1.5,
    "xhdpi": 2.0,
    "xxhdpi": 3.0,
    "xxxhdpi": 4.0,
}

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}


def gradient(size: int, top=INK_TOP, bottom=INK_BOTTOM) -> Image.Image:
    """Diagonal evergreen gradient."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * max(1, size - 1))
            pixels[x, y] = (
                round(top[0] + (bottom[0] - top[0]) * t),
                round(top[1] + (bottom[1] - top[1]) * t),
                round(top[2] + (bottom[2] - top[2]) * t),
                255,
            )
    return image


def draw_mark(image: Image.Image, box: int, offset: tuple[int, int]) -> None:
    """Draw the ring, the serif S and the spark inside a `box` sized square."""
    draw = ImageDraw.Draw(image)
    ox, oy = offset

    cx = ox + box // 2
    cy = oy + box // 2

    ring_r = int(box * 0.35)
    ring_w = max(1, int(box * 0.012))
    draw.ellipse(
        (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
        outline=GOLD,
        width=ring_w,
    )

    font = ImageFont.truetype(FONT_PATH, int(box * 0.56))
    draw.text((cx, cy - int(box * 0.015)), "S", font=font, fill=CREAM, anchor="mm")

    dot_r = max(2, int(box * 0.055))
    dot_x = ox + int(box * 0.78)
    dot_y = oy + int(box * 0.22)
    draw.ellipse((dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r), fill=CORAL)
    draw.ellipse(
        (dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r),
        outline=WHITE_SOFT,
        width=max(1, int(box * 0.012)),
    )


def legacy_icon(size: int, round_shape: bool) -> Image.Image:
    base = gradient(size)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    if round_shape:
        md.ellipse((0, 0, size - 1, size - 1), fill=255)
    else:
        radius = int(size * 0.22)
        md.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    base.putalpha(mask)
    draw_mark(base, int(size * 0.92), (int(size * 0.04), int(size * 0.04)))
    return base


def adaptive_foreground(size: int) -> Image.Image:
    """Transparent foreground; the launcher supplies the background colour."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    box = int(size * 0.58)
    offset = ((size - box) // 2, (size - box) // 2)
    draw_mark(image, box, offset)
    return image


def main() -> None:
    for density, scale in DENSITIES.items():
        legacy = LEGACY[density]
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)

        legacy_icon(legacy, round_shape=False).save(folder / "ic_launcher.png")
        legacy_icon(legacy, round_shape=True).save(folder / "ic_launcher_round.png")

        adaptive = ADAPTIVE[density]
        adaptive_foreground(adaptive).save(folder / "ic_launcher_foreground.png")

    # A single large master for the web favicon / app icon.
    NEXT_APP.mkdir(parents=True, exist_ok=True)
    legacy_icon(512, round_shape=False).save(NEXT_APP / "icon.png")
    legacy_icon(180, round_shape=False).save(NEXT_APP / "apple-icon.png")
    legacy_icon(512, round_shape=False).save(
        NEXT_APP / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # Adaptive icon wiring for Android 8 and newer.
    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    (anydpi / "ic_launcher.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n',
        encoding="utf-8",
    )
    (anydpi / "ic_launcher_round.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n',
        encoding="utf-8",
    )

    colors = RES / "values" / "colors.xml"
    if colors.exists():
        text = colors.read_text(encoding="utf-8")
        if "ic_launcher_background" not in text:
            text = text.replace(
                "</resources>",
                '    <color name="ic_launcher_background">#0B3B34</color>\n'
                '    <color name="splash_background">#0B3B34</color>\n'
                "</resources>",
            )
            colors.write_text(text, encoding="utf-8")
    else:
        colors.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            '    <color name="ic_launcher_background">#0B3B34</color>\n'
            '    <color name="splash_background">#0B3B34</color>\n'
            "</resources>\n",
            encoding="utf-8",
        )

    print("icons written")


if __name__ == "__main__":
    main()
