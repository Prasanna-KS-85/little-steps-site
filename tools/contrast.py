#!/usr/bin/env python3
"""WCAG contrast of every text and UI colour pair the site uses (tokens from assets/css/tokens.css).

Run: python3 tools/contrast.py   (exits 1 if a text pair is under 4.5:1 or a UI pair under 3:1)
"""
import re
import sys
from pathlib import Path

tokens = dict(re.findall(r"--(color-[a-z-]+):\s*(#[0-9a-f]{6})", (Path(__file__).parent.parent / "assets/css/tokens.css").read_text()))


def lum(hex_):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def ratio(a, b):
    la, lb = sorted((lum(tokens[a]), lum(tokens[b])), reverse=True)
    return (la + 0.05) / (lb + 0.05)


TEXT = [
    ("color-charcoal", "color-warm-cream", "body text, headings"),
    ("color-charcoal", "color-pale-sage", "body text in sage sections, Coming soon label"),
    ("color-charcoal", "color-soft-ivory", "cards, notes, small buttons, code"),
    ("color-text-brown", "color-warm-cream", "footer, CTA note, film caption"),
    ("color-text-brown", "color-pale-sage", "fine print in the companion section"),
    ("color-forest-green", "color-warm-cream", "links, eyebrows"),
    ("color-forest-green", "color-pale-sage", "eyebrows, summary in sage sections"),
    ("color-forest-green", "color-soft-ivory", "links in cards"),
    ("color-soft-ivory", "color-forest-green", "primary button, step numbers, skip link"),
    ("color-soft-ivory", "color-charcoal", "primary button hover"),
]
UI = [
    ("color-forest-green", "color-warm-cream", "focus ring, step circles"),
    ("color-forest-green", "color-pale-sage", "focus ring in sage sections"),
    ("color-bark", "color-soft-ivory", "small button border"),
]

fail = False
for fg, bg, use in TEXT:
    r = ratio(fg, bg)
    ok = r >= 4.5
    fail |= not ok
    print(f"{'ok ' if ok else 'LOW'} text {r:5.2f}:1  {fg} on {bg}  ({use})")
for fg, bg, use in UI:
    r = ratio(fg, bg)
    ok = r >= 3
    fail |= not ok
    print(f"{'ok ' if ok else 'LOW'} ui   {r:5.2f}:1  {fg} on {bg}  ({use})")
sys.exit(1 if fail else 0)
