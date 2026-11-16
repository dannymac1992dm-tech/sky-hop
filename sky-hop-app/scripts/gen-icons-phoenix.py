#!/usr/bin/env python3
"""Sky Hop 1.12: launcher icons from icon option H (Phoenix launch), /workspace/sky-hop-1.12-test/icon-options-v4/.
Adaptive layers come straight from the 432 px H layers (already designed for the 108dp canvas / 72dp visible area);
legacy round + squircle icons and the splash art come from the 1024 composite (H bg + H fg)."""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(HERE)
RES = os.path.join(APP, "android/app/src/main/res"); SRC_DIR = os.path.join(APP, "icon-src")
V4 = "/workspace/sky-hop-1.12-test/icon-options-v4"; N = "H-phoenix-launch"
SKY = (110, 198, 255)  # splash background stays the game sky colour
DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
fg432 = Image.open(f"{V4}/{N}-adaptive-foreground-432.png").convert("RGBA")
bg432 = Image.open(f"{V4}/{N}-adaptive-background-432.png").convert("RGB")
mono432 = Image.open(f"{V4}/{N}-adaptive-monochrome-432.png").convert("RGBA")
# 1024 full-bleed art = same composition as the 512 store icon (bird 1.12x the adaptive layer)
sys.path.insert(0, V4); import make_icons_v4 as mv
bgi = Image.open(f"{V4}/src/H-bg.jpg").convert("RGB").resize((1024, 1024), Image.LANCZOS).convert("RGBA")
fg_big = mv.fit_fg(mv.key_out(f"{V4}/src/H-fg.jpg").resize((2048, 2048), Image.LANCZOS), 136)
fgs = mv.with_shadow(fg_big).resize((1024, 1024), Image.LANCZOS)
z = 1.12; f2 = fgs.resize((int(1024 * z), int(1024 * z)), Image.LANCZOS); o = (1024 - f2.width) // 2
bgi.alpha_composite(f2.crop((-o, -o, -o + 1024, -o + 1024)))
art_img = bgi.convert("RGB"); art_img.save(os.path.join(SRC_DIR, "art-phoenix-1024.png"))

def rounded(img, size, radius_frac, inset_frac, circle=False):
    S = size * 4; inset = round(S * inset_frac)
    big = img.resize((S - 2 * inset, S - 2 * inset), Image.LANCZOS)
    m = Image.new("L", (S, S), 0); dr = ImageDraw.Draw(m)
    if circle: dr.ellipse([inset, inset, S - inset - 1, S - inset - 1], fill=255)
    else: dr.rounded_rectangle([inset, inset, S - inset - 1, S - inset - 1], radius=round((S - 2 * inset) * radius_frac), fill=255)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0)); canvas.paste(big.convert("RGBA"), (inset, inset)); canvas.putalpha(m)
    return canvas.resize((size, size), Image.LANCZOS)

for d, k in DENS.items():
    mip = os.path.join(RES, "mipmap-" + d); L = round(48 * k); A = round(108 * k)
    rounded(art_img, L, 0.18, 0.04).save(os.path.join(mip, "ic_launcher.png"), optimize=True)
    rounded(art_img, L, 0, 0.04, circle=True).save(os.path.join(mip, "ic_launcher_round.png"), optimize=True)
    fg432.resize((A, A), Image.LANCZOS).save(os.path.join(mip, "ic_launcher_foreground.png"), optimize=True)
    bg432.resize((A, A), Image.LANCZOS).save(os.path.join(mip, "ic_launcher_background.png"), optimize=True)
    mono432.resize((A, A), Image.LANCZOS).save(os.path.join(mip, "ic_launcher_monochrome.png"), optimize=True)

def framed_icon(size, circle=False):
    S = size * 2; out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); pad = round(S * 0.06); body = S - 2 * pad
    sh = Image.new("L", (S, S), 0); dd = ImageDraw.Draw(sh); off = round(S * 0.015)
    dd.rounded_rectangle([pad, pad + off, S - pad, S - pad + off], radius=round(body * 0.2), fill=90)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.02))
    out.paste(Image.new("RGBA", (S, S), (0, 40, 80, 255)), (0, 0), sh)
    out.alpha_composite(rounded(Image.new("RGB", (64, 64), (255, 255, 255)), body, 0.2, 0, circle=circle), (pad, pad))
    ring = round(body * 0.035)
    out.alpha_composite(rounded(art_img, body - 2 * ring, 0.18, 0, circle=circle), (pad + ring, pad + ring))
    return out.resize((size, size), Image.LANCZOS)
icon_f = framed_icon(1024)
for f in ["drawable/splash.png"] + ["drawable-%s-%s/splash.png" % (o_, d) for o_ in ("port", "land") for d in DENS]:
    p = os.path.join(RES, f); w, h = Image.open(p).size
    s_ = Image.new("RGBA", (w, h), SKY + (255,)); isz = round(min(w, h) * 0.42)
    s_.alpha_composite(icon_f.resize((isz, isz), Image.LANCZOS), ((w - isz) // 2, (h - isz) // 2)); s_.convert("RGB").save(p, optimize=True)
rounded(art_img, 704, 0, 0, circle=True).save(os.path.join(RES, "drawable-nodpi", "splash_icon_art.png"), optimize=True)
pv = Image.new("RGBA", (576, 576), SKY + (255,)); ImageDraw.Draw(pv).ellipse([96, 96, 480, 480], fill=(255, 255, 255, 255))
pv.alpha_composite(rounded(art_img, 352, 0, 0, circle=True), (112, 112)); pv.save(os.path.join(SRC_DIR, "splash-android12-preview.png"))
# preview: adaptive composite, circle mask, squircle mask, monochrome, legacy round/squircle
comp = bg432.convert("RGBA"); comp.alpha_composite(fg432)
def mask_prev(shape):
    m = Image.new("L", (432 * 4,) * 2, 0); dm = ImageDraw.Draw(m); a, b = 72 * 4, 360 * 4
    if shape == "circle": dm.ellipse([a, a, b, b], fill=255)
    else: dm.rounded_rectangle([a, a, b, b], radius=int((b - a) * 0.28), fill=255)
    m = m.resize((432, 432), Image.LANCZOS); o_ = Image.new("RGBA", (432, 432), (0, 0, 0, 0)); o_.paste(comp, (0, 0), m); return o_
pv = Image.new("RGBA", (432 * 5 + 80, 432), (40, 40, 40, 255))
pv.paste(comp, (0, 0)); c = mask_prev("circle"); pv.paste(c, (452, 0), c); s2 = mask_prev("squircle"); pv.paste(s2, (904, 0), s2)
mono = Image.new("RGBA", (432, 432), (0, 0, 0, 0)); mono.alpha_composite(mono432); mb = Image.new("RGBA", (432, 432), (60, 90, 160, 255)); mb.alpha_composite(mono)
pv.paste(mb, (1356, 0)); pv.paste(Image.open(os.path.join(RES, "mipmap-xxxhdpi/ic_launcher_round.png")).resize((192, 192)), (1808, 0), Image.open(os.path.join(RES, "mipmap-xxxhdpi/ic_launcher_round.png")).resize((192, 192)))
lg = Image.open(os.path.join(RES, "mipmap-xxxhdpi/ic_launcher.png")); pv.paste(lg.resize((192, 192)), (1808, 220), lg.resize((192, 192)))
pv.save(os.path.join(SRC_DIR, "adaptive-preview.png")); print("done")
