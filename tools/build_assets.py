#!/usr/bin/env python3
"""Build the site's images and videos from the app repo and the launch repo (read-only sources).

Run from the site root:  python3 tools/build_assets.py
Needs: ffmpeg (libx264, aac) and Pillow (with WebP). Writes only inside assets/.
Sources are only read, never written.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HOME = Path.home()
APP = HOME / "little-steps"
LAUNCH = HOME / "little-steps-launch"
SITE = Path(__file__).resolve().parent.parent
IMG = SITE / "assets" / "img"
VID = SITE / "assets" / "video"
ICO = SITE / "assets" / "icons"

FILM_169 = LAUNCH / "renders/drafts/v2/little-steps-v2-16x9.mp4"
HERO_SRC = LAUNCH / "renders/site-v4"  # the final hero loops and posters (32.3 s, 970 frames, no audio)
CAPS = LAUNCH / "public/captures"
FPS = 30


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def ff(*args: str) -> None:
    run("ffmpeg", "-v", "error", "-y", *args)


def frame_png(src: Path, frame: int, out: Path) -> None:
    ff("-i", str(src), "-vf", f"select=eq(n\\,{frame})", "-vsync", "0", "-frames:v", "1", str(out))


def save_webp(im: Image.Image, out: Path, q: int = 82) -> None:
    im.save(out, "WEBP", quality=q, method=6)


# ---------------------------------------------------------------- icons
def icons() -> None:
    ICO.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        run("iconutil", "--convert", "iconset", "-o", str(iconset), str(APP / "assets/icon/icon.icns"))
        big = Image.open(iconset / "icon_512x512@2x.png").convert("RGBA")
        for size, name in [(32, "favicon-32.png"), (180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
            big.resize((size, size), Image.LANCZOS).save(ICO / name, optimize=True)
        big.resize((48, 48), Image.LANCZOS).save(SITE / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
        for size in (96, 192):
            save_webp(big.resize((size, size), Image.LANCZOS), IMG / f"app-icon-{size}.webp", 90)


def sprout() -> None:
    """The app's menu-bar sprout (a black template image) in Forest Green, for the hero note."""
    tray = Image.open(APP / "assets/tray/trayTemplate@2x.png").convert("RGBA")
    green = Image.new("RGBA", tray.size, (0x52, 0x6B, 0x55, 255))
    green.putalpha(tray.getchannel("A"))
    green.save(IMG / "sprout-36.png", optimize=True)


# ---------------------------------------------------------------- captures
# Crop boxes in the app's CSS pixels (captures are 1000 x 900 at 4x, docs/capture-plan.md in the
# launch repo). Plan boxes come from the capture manifest (plan x 70, y 93, width 616).
CAPTURES = {
    # name: (source, (x, y, w, h) in CSS px, display width in CSS px)
    "step-plan": ("v2-plan-03-added-6.png", (58, 81, 640, 628), 560),
    "step-tick": ("v2-plan-04-tick-2.png", (58, 272, 640, 290), 560),
    "step-journey": ("journey-2-of-6.png", (58, 162, 884, 318), 560),
    "history-after": ("v2-history-after.png", (58, 146, 440, 702), 400),
}


def captures() -> None:
    for name, (src, (x, y, w, h), disp) in CAPTURES.items():
        im = Image.open(CAPS / src).convert("RGB").crop((x * 4, y * 4, (x + w) * 4, (y + h) * 4))
        for scale in (1, 2):
            tw = disp * scale
            th = round(im.height * tw / im.width)
            save_webp(im.resize((tw, th), Image.LANCZOS), IMG / f"{name}-{tw}.webp")
        print(name, "aspect", f"{w}x{h}")


# ---------------------------------------------------------------- film
def hero() -> None:
    """The hero loops are final renders: copied as they are, never re-encoded."""
    shutil.copyfile(HERO_SRC / "little-steps-hero-16x9.mp4", VID / "hero-16x9.mp4")
    shutil.copyfile(HERO_SRC / "little-steps-hero-4x5.mp4", VID / "hero-4x5.mp4")
    hero_posters()


def hero_posters() -> None:
    for tag, size in [("16x9", (1280, 720)), ("4x5", (720, 900))]:
        im = Image.open(HERO_SRC / f"poster-{tag}.png").convert("RGB")
        save_webp(im.resize(size, Image.LANCZOS), IMG / f"hero-poster-{tag}.webp", 80)
        if tag == "16x9":
            # Open Graph: 1200 x 630 from the poster (scale to 1200 wide, trim 22 px top and bottom).
            o = im.resize((1200, 675), Image.LANCZOS).crop((0, 22, 1200, 652))
            o.save(SITE / "og-image.jpg", "JPEG", quality=86, optimize=True, progressive=True)


# Companion loops, cut from the 16:9 film (1920 x 1080): (start, end) frames, crop x, y, size.
LOOPS = {
    # The idle stretch before the butterfly reaches the crop, played forward then back so the 1 s bob
    # and the blink loop without a jump (the app's breath is a 4 s cycle; 2 s exist in the film).
    "idle": dict(start=121, end=176, x=620, y=300, size=680, pingpong=True, poster=150),
    # The real butterfly visit (8.0 s in the app): enters right, notice, reach, hop, flies off left.
    "butterfly": dict(start=160, end=394, x=620, y=300, size=680, pingpong=False, poster=286),
    # The held doze with the rising z letters (after the cut from the yawn); text is outside the crop.
    "doze": dict(start=1188, end=1349, x=1220, y=220, size=680, pingpong=False, poster=1330),
}


def loops() -> None:
    for name, c in LOOPS.items():
        crop = f"crop={c['size']}:{c['size']}:{c['x']}:{c['y']},scale=480:480:flags=lanczos"
        trim = f"trim=start_frame={c['start']}:end_frame={c['end'] + 1},setpts=PTS-STARTPTS"
        if c["pingpong"]:
            vf = f"[0:v]{trim},{crop},split[a][b];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1[v]"
        else:
            vf = f"[0:v]{trim},{crop}[v]"
        ff("-i", str(FILM_169), "-filter_complex", vf, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryslow",
           "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "27", "-movflags", "+faststart", str(VID / f"companion-{name}.mp4"))
        with tempfile.TemporaryDirectory() as tmp:
            png = Path(tmp) / "p.png"
            frame_png(FILM_169, c["poster"], png)
            s, x, y = c["size"], c["x"], c["y"]
            im = Image.open(png).convert("RGB").crop((x, y, x + s, y + s)).resize((480, 480), Image.LANCZOS)
            save_webp(im, IMG / f"companion-{name}-poster.webp", 82)


def main() -> None:
    import sys

    for d in (IMG, VID, ICO):
        d.mkdir(parents=True, exist_ok=True)
    if sys.argv[1:] == ["posters"]:  # only the hero posters and the Open Graph image
        hero_posters()
        return
    if sys.argv[1:] == ["sprout"]:
        sprout()
        return
    icons()
    sprout()
    captures()
    hero()
    loops()
    print(json.dumps({p.name: p.stat().st_size for p in sorted(VID.iterdir())}, indent=1))


if __name__ == "__main__":
    main()
