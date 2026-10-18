"""Builds the kiith badges from the games' own badge stencils (story #836).

Homeworld Remastered has stencils for five kiithid and the Kushan emblem; Homeworld Mobile adds
Somtaaw and Kaalel, and the Deserts of Kharak expedition guide (its TechnicalManual/package.nw)
adds Hraal, Siidim and Gaalsien, all in the same white style. No game has a badge for Sagald,
Jaraci or Tambuur, so this tool draws simple ones of our own for them (see DRAWN). Tints each
white-with-alpha stencil the launcher's cyan (#2ec4d6), sizes it to 128 pixels and writes the
badges and the index the app reads into the private folder:
    reference/badges/<kiith>.webp
    reference/badges/index.json   {"kiith": {"Paktu": "paktu.webp", ...}, "kushan": "kushan.webp"}

The game art is licensed and stays on this PC (git-ignored reference/). Only this mapping of
kiith names to stencil files is committed. Re-running replaces the badges.

    D:\\ComfyUI_windows_portable\\python_embeded\\python.exe tools/branding/badges.py ["D:\\Modding Tools\\Source Files"]
"""
import io
import json
import math
import os
import shutil
import sys
import zipfile

from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "reference", "badges")
DEFAULT_SOURCE = r"D:\Modding Tools\Source Files"
DOK_MANUAL = r"D:\Program Files (x86)\Steam\steamapps\common\Deserts of Kharak\TechnicalManual\package.nw"
DOK_IMAGES = "book/assets/resources/MuseScrollingContent/images"
HWRM = "Homeworld RM/badges"
MOBILE = "Homeworld Mobile/Client/Assets/Texture2D"

TINT = (0x2E, 0xC4, 0xD6)
SIZE = 128

# kiith name as the app spells it -> stencil file under the source folder, or ("dok", member of the
# Deserts of Kharak guide's package)
KIITHID: dict[str, str | tuple[str, str]] = {
    "Paktu": f"{HWRM}/kiith paktu.tga",
    "Manaan": f"{HWRM}/kiith manaan.tga",
    "S'jet": f"{HWRM}/kiith sjet.tga",
    "Soban": f"{HWRM}/kiith soban.tga",
    "Naabal": f"{HWRM}/kiith naabal.tga",
    "Somtaaw": f"{MOBILE}/kiith_logo_somtaaw_01_256px.png",
    "Kaalel": f"{MOBILE}/kiith_logo_kaalel_01_256px.png",
    "Hraal": ("dok", f"{DOK_IMAGES}/hraal_512_white.png"),
    "Siidim": ("dok", f"{DOK_IMAGES}/siidim_512_white.png"),
    "Gaalsien": ("dok", f"{DOK_IMAGES}/gaalsien_512_white.png"),
}
KUSHAN = f"{HWRM}/kushan.tga"


def _canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("L", (1024, 1024), 0)
    return im, ImageDraw.Draw(im)


def _ring(d: ImageDraw.ImageDraw, r: float, width: int, start: float = 0, end: float = 360) -> None:
    d.arc((512 - r, 512 - r, 512 + r, 512 + r), start, end, fill=255, width=width)


def draw_sagald() -> Image.Image:
    """Vehicle builders and diggers: a cog with a spade blade pointing down through it."""
    im, d = _canvas()
    teeth = 10
    for i in range(teeth):
        a = math.radians(i * 360 / teeth - 90)
        cx, cy = 512 + 360 * math.cos(a), 512 + 360 * math.sin(a)
        d.regular_polygon((cx, cy, 70), 4, rotation=-math.degrees(a) + 45, fill=255)
    _ring(d, 360, 90)
    d.ellipse((512 - 150, 512 - 150, 512 + 150, 512 + 150), fill=0)
    d.polygon([(512, 900), (400, 560), (400, 330), (624, 330), (624, 560)], fill=255)
    d.rectangle((488, 120, 536, 330), fill=255)
    return im


def draw_jaraci() -> Image.Image:
    """Sensor specialists: a dish with its feed spike, listening to two faint arcs."""
    im, d = _canvas()
    _ring(d, 330, 90, 15, 165)
    d.polygon([(512, 330), (548, 420), (530, 600), (494, 600), (476, 420)], fill=255)
    d.polygon([(512, 840), (430, 960), (594, 960)], fill=255)
    for r in (150, 250):
        d.arc((512 - r, 400 - r, 512 + r, 400 + r), 230, 310, fill=255, width=48)
    return im


def draw_tambuur() -> Image.Image:
    """Surgeons of the very small: a fine blade through a ring, with two small wings."""
    im, d = _canvas()
    _ring(d, 250, 56)
    d.polygon([(512, 60), (562, 420), (536, 960), (488, 960), (462, 420)], fill=255)
    d.polygon([(512, 60), (530, 420), (512, 440), (494, 420)], fill=0)
    for side in (-1, 1):
        d.polygon([(512 + side * 300, 470), (512 + side * 470, 380), (512 + side * 440, 470), (512 + side * 300, 560)], fill=255)
    return im


# Kiithid no game has a badge for, drawn here in the same style so none is left blank.
DRAWN = {"Sagald": draw_sagald, "Jaraci": draw_jaraci, "Tambuur": draw_tambuur}


def tint(im: Image.Image, dest: str) -> None:
    """Keeps the stencil's shape and paints it cyan. Dark detail inside a white stencil becomes
    see-through, so lines drawn in black stay visible on the app's dark panels."""
    im = im.convert("RGBA")
    alpha = ImageChops.multiply(im.getchannel("A"), im.convert("L"))
    out = Image.new("RGBA", im.size, TINT + (0,))
    out.putalpha(alpha)
    out = out.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(dest, "WEBP", lossless=True)


def slug(name: str) -> str:
    return "".join(c for c in name.lower() if c.isalnum())


def load(source: str, file: str | tuple[str, str]) -> Image.Image | None:
    if isinstance(file, tuple):
        if not os.path.exists(DOK_MANUAL):
            return None
        with zipfile.ZipFile(DOK_MANUAL) as z:
            return Image.open(io.BytesIO(z.read(file[1])))
    path = os.path.join(source, file)
    return Image.open(path) if os.path.exists(path) else None


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    kiith = {}
    for name, file in KIITHID.items():
        im = load(source, file)
        if im is None:
            print("missing", name, file)
            continue
        kiith[name] = f"{slug(name)}.webp"
        tint(im, os.path.join(OUT, kiith[name]))
    for name, draw in DRAWN.items():
        # A white stencil on black, as the games' are: the drawing is its own alpha.
        mask = draw()
        kiith[name] = f"{slug(name)}.webp"
        tint(Image.merge("RGBA", (mask, mask, mask, mask)), os.path.join(OUT, kiith[name]))
    index = {"kiith": kiith}
    kushan = load(source, KUSHAN)
    if kushan is not None:
        tint(kushan, os.path.join(OUT, "kushan.webp"))
        index["kushan"] = "kushan.webp"
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
    print(f"wrote {len(kiith)} kiith badges to {OUT}")


if __name__ == "__main__":
    main()
