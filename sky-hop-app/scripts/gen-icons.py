#!/usr/bin/env python3
"""Sky Hop 1.7: launcher icons (legacy + adaptive + monochrome) and splash screens
from /workspace/sky-hop-publishing/store-assets/icon-1024.png (store icon art).
Writes into android/app/src/main/res and previews into icon-src/."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
RES = os.path.join(APP, "android/app/src/main/res")
SRC_DIR = os.path.join(APP, "icon-src")
STORE = "/workspace/sky-hop-publishing/store-assets"
SKY = (110, 198, 255)  # #6ec6ff = game sky / canvas background
PALETTE_BG = [SKY, (90, 190, 90), (70, 170, 80), (255, 230, 120)]  # sky, hills, sun
BIRD = [(255, 210, 60), (255, 180, 40), (255, 245, 200), (255, 255, 255), (30, 30, 30), (255, 140, 40)]
DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

os.makedirs(SRC_DIR, exist_ok=True)
src = np.array(Image.open(os.path.join(STORE, "icon-1024.png")).convert("RGB")).astype(np.int32)
N = src.shape[0]


def nearest(px, pal):
    d = np.stack([((px - np.array(c)) ** 2).sum(-1) for c in pal], -1)
    return d.min(-1), d.argmin(-1)


# 1) Full-bleed square art: the store PNG has black rounded corners (radius ~150 px).
#    Everything outside the rounded shape (eroded 8 px past the antialiased rim) is
#    refilled with the flat colour of that corner: sky on top, the two hills below.
art = src.copy()
inside = Image.fromarray(((src.sum(-1) > 30) * 255).astype(np.uint8), "L").filter(ImageFilter.MinFilter(17))
inside = np.array(inside) > 0
inside[200:N - 200, :] = True  # corners only (the art reaches the edges between them)
inside[:, 200:N - 200] |= True
H2 = N // 2
fills = {(0, 0): SKY, (0, 1): SKY, (1, 0): (90, 190, 90), (1, 1): (70, 170, 80)}
for (qy, qx), col in fills.items():
    ys = slice(qy * H2, (qy + 1) * H2); xs = slice(qx * H2, (qx + 1) * H2)
    sub = art[ys, xs]; ins = inside[ys, xs]
    sub[~ins] = col
    art[ys, xs] = sub
art_img = Image.fromarray(art.astype(np.uint8), "RGB")
art_img.save(os.path.join(SRC_DIR, "art-fullbleed-1024.png"))

# 2) Bird mask (foreground layer) by colour class inside the bird's box.
d_bird, _ = nearest(art, BIRD)
d_bg, _ = nearest(art, PALETTE_BG)
box = np.zeros((N, N), bool)
box[330:710, 230:830] = True
bird = (d_bird < d_bg) & box
# keep the largest blob only (drop stray antialias pixels on the sun etc.)
from collections import deque
lab = np.zeros((N, N), np.int32)
best, best_n, cur = 0, 0, 0
for y0, x0 in zip(*np.nonzero(bird)):
    if lab[y0, x0]:
        continue
    cur += 1
    q = deque([(y0, x0)]); lab[y0, x0] = cur; n = 0
    while q:
        y, x = q.popleft(); n += 1
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < N and 0 <= xx < N and bird[yy, xx] and not lab[yy, xx]:
                lab[yy, xx] = cur; q.append((yy, xx))
    if n > best_n:
        best, best_n = cur, n
bird = lab == best
# fill interior holes (none expected) and soften the 1px edge
mask = Image.fromarray((bird * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.8))
ys, xs = np.nonzero(bird)
print("bird bbox x", xs.min(), xs.max(), "y", ys.min(), ys.max(), "px", best_n)

fg = Image.new("RGBA", (N, N), (0, 0, 0, 0))
fg.paste(art_img, (0, 0), mask)
# background layer = art with the bird painted out in sky colour
grow = Image.fromarray((bird * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(9))
bg_img = art_img.copy()
bg_img.paste(Image.new("RGB", (N, N), SKY), (0, 0), grow)
# monochrome (themed icon) = bird silhouette with the eye punched out
eye = np.zeros((N, N), bool)
dd, idx = nearest(art, BIRD)
eye = bird & ((idx == 3) | (idx == 4)) & (dd < 200)
mono_a = Image.fromarray(((bird & ~eye) * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.8))
mono = Image.new("RGBA", (N, N), (255, 255, 255, 0))
mono.putalpha(mono_a)


def adaptive_layer(img, size, fill_edges):
    """Place 1024 art into the visible 72dp of a 108dp layer (scale 72/108)."""
    inner = round(size * 72 / 108)
    off = (size - inner) // 2
    small = img.resize((inner, inner), Image.LANCZOS)
    if fill_edges:  # extend the flat art outward (sky up top, hills below)
        a = np.array(small)
        a = np.pad(a, ((off, size - inner - off), (off, size - inner - off), (0, 0)), mode="edge")
        return Image.fromarray(a, small.mode)
    out = Image.new(img.mode, (size, size), (0, 0, 0, 0))
    out.paste(small, (off, off))
    return out


def rounded(img, size, radius_frac, inset_frac, circle=False):
    S = size * 4
    inset = round(S * inset_frac)
    big = img.resize((S - 2 * inset, S - 2 * inset), Image.LANCZOS)
    m = Image.new("L", (S, S), 0)
    dr = ImageDraw.Draw(m)
    if circle:
        dr.ellipse([inset, inset, S - inset - 1, S - inset - 1], fill=255)
    else:
        dr.rounded_rectangle([inset, inset, S - inset - 1, S - inset - 1], radius=round((S - 2 * inset) * radius_frac), fill=255)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(big.convert("RGBA"), (inset, inset))
    canvas.putalpha(m)
    return canvas.resize((size, size), Image.LANCZOS)


for d, k in DENS.items():
    mip = os.path.join(RES, "mipmap-" + d)
    os.makedirs(mip, exist_ok=True)
    L = round(48 * k)
    A = round(108 * k)
    rounded(art_img, L, 0.18, 0.04).save(os.path.join(mip, "ic_launcher.png"), optimize=True)
    rounded(art_img, L, 0, 0.04, circle=True).save(os.path.join(mip, "ic_launcher_round.png"), optimize=True)
    adaptive_layer(fg, A, False).save(os.path.join(mip, "ic_launcher_foreground.png"), optimize=True)
    adaptive_layer(bg_img, A, True).save(os.path.join(mip, "ic_launcher_background.png"), optimize=True)
    adaptive_layer(mono, A, False).save(os.path.join(mip, "ic_launcher_monochrome.png"), optimize=True)

# 3) Splash: sky background + centred icon. The icon's own sky matches the splash
#    sky, so it gets a white rim and a soft shadow to read as an icon.
def framed_icon(size, circle=False):
    S = size * 2
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pad = round(S * 0.06)
    body = S - 2 * pad
    sh = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(sh)
    off = round(S * 0.015)
    if circle:
        d.ellipse([pad, pad + off, S - pad, S - pad + off], fill=90)
    else:
        d.rounded_rectangle([pad, pad + off, S - pad, S - pad + off], radius=round(body * 0.2), fill=90)
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.02))
    out.paste(Image.new("RGBA", (S, S), (0, 40, 80, 255)), (0, 0), sh)
    rim = rounded(Image.new("RGB", (64, 64), (255, 255, 255)), body, 0.2, 0, circle=circle)
    out.alpha_composite(rim, (pad, pad))
    ring = round(body * 0.035)
    ic = rounded(art_img, body - 2 * ring, 0.18, 0, circle=circle)
    out.alpha_composite(ic, (pad + ring, pad + ring))
    return out.resize((size, size), Image.LANCZOS)

icon_f = framed_icon(1024)
splash_sizes = {}
for f in ["drawable/splash.png"] + ["drawable-%s-%s/splash.png" % (o, d) for o in ("port", "land") for d in DENS]:
    p = os.path.join(RES, f)
    w, h = Image.open(p).size
    s_ = Image.new("RGBA", (w, h), SKY + (255,))
    isz = round(min(w, h) * 0.42)
    ic = icon_f.resize((isz, isz), Image.LANCZOS)
    s_.alpha_composite(ic, ((w - isz) // 2, (h - isz) // 2))
    s_.convert("RGB").save(p, optimize=True)
    splash_sizes[f] = (w, h)

# Android 12+ system splash icon (windowSplashScreenAnimatedIcon): drawn in a 288dp box and
# masked to a 192dp circle. drawable-nodpi PNG sized in px for xxxhdpi (176dp * 4).
nodpi = os.path.join(RES, "drawable-nodpi")
os.makedirs(nodpi, exist_ok=True)
rounded(art_img, 704, 0, 0, circle=True).save(os.path.join(nodpi, "splash_icon_art.png"), optimize=True)
# preview of the 12+ splash: sky + white 192dp disc + 176dp round art
pv = Image.new("RGBA", (576, 576), SKY + (255,))
d = ImageDraw.Draw(pv); d.ellipse([96, 96, 480, 480], fill=(255, 255, 255, 255))
art_c = rounded(art_img, 352, 0, 0, circle=True); pv.alpha_composite(art_c, (112, 112))
pv.save(os.path.join(SRC_DIR, "splash-android12-preview.png"))

# previews
prev = Image.new("RGBA", (432 * 3 + 40, 432), (40, 40, 40, 255))
fgx = adaptive_layer(fg, 432, False); bgx = adaptive_layer(bg_img, 432, True)
comp = bgx.convert("RGBA"); comp.alpha_composite(fgx)
cm = Image.new("L", (432, 432), 0); ImageDraw.Draw(cm).ellipse([72, 72, 360, 360], fill=255)
circ = Image.new("RGBA", (432, 432), (0, 0, 0, 0)); circ.paste(comp, (0, 0), cm)
prev.paste(comp, (0, 0)); prev.paste(circ, (452, 0), circ)
mono_prev = adaptive_layer(mono, 432, False)
prev.paste(mono_prev, (904, 0), mono_prev)
prev.save(os.path.join(SRC_DIR, "adaptive-preview.png"))
print("splash", splash_sizes)
