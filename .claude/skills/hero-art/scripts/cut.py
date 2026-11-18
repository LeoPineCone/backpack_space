"""Cut out a hero's full body and head picture and make a phone-size preview.

Usage: python3 -I cut.py <hero-folder>   (expects raw/<hero>-ganzkoerper.png and raw/<hero>-kopf.png,
generated on flat light grey; the hero name is the folder name)
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HEAD_CENTER = (0.47, 0.47)  # centre of the round crop, as a share of width/height
HEAD_RADIUS = 0.47  # radius of the round crop, as a share of the width
PANEL = (18, 22, 42, 255)  # dark UI panel colour behind the round head
BACKDROP = (14, 17, 33, 255)
RING = (110, 190, 225, 255)


def cut_out(path):
    """Flood-fill the flat background from the border; also clear enclosed background holes."""
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    close = np.abs(a - bg).sum(2) < 45
    m = np.zeros((h, w), bool)
    q = deque([(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)])
    while q:
        y, x = q.popleft()
        if m[y, x] or not close[y, x]:
            continue
        m[y, x] = True
        if y > 0: q.append((y - 1, x))
        if y < h - 1: q.append((y + 1, x))
        if x > 0: q.append((y, x - 1))
        if x < w - 1: q.append((y, x + 1))
    tight = np.abs(a - bg).max(2) < 10
    seen = m.copy()
    for sy, sx in zip(*np.nonzero(tight & ~m)):
        if seen[sy, sx]:
            continue
        comp, q = [], deque([(sy, sx)])
        while q:
            y, x = q.popleft()
            if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not tight[y, x]:
                continue
            seen[y, x] = True
            comp.append((y, x))
            q.extend([(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)])
        if len(comp) > 150:
            ys, xs = zip(*comp)
            m[list(ys), list(xs)] = True
    alpha = Image.fromarray(((~m) * 255).astype("uint8")).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def main(folder):
    d = Path(folder)
    hero = d.name
    body = cut_out(d / "raw" / f"{hero}-ganzkoerper.png")
    body = body.crop(body.getbbox())
    body.save(d / f"{hero}-ganzkoerper.png")

    head = cut_out(d / "raw" / f"{hero}-kopf.png")
    n = head.width
    cx, cy, r = int(n * HEAD_CENTER[0]), int(head.height * HEAD_CENTER[1]), int(n * HEAD_RADIUS)
    sq = head.crop((cx - r, cy - r, cx + r, cy + r)).resize((512, 512), Image.LANCZOS)
    sq.save(d / f"{hero}-kopf-freigestellt.png")
    disc = Image.new("RGBA", (512, 512), PANEL)
    disc.alpha_composite(sq)
    mask = Image.new("L", (2048, 2048), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 2047, 2047], fill=255)
    disc.putalpha(mask.resize((512, 512), Image.LANCZOS))
    disc.save(d / f"{hero}-kopf-rund.png")

    s = 3
    W, H = 390 * s, 460 * s
    p = Image.new("RGBA", (W, H), BACKDROP)
    draw = ImageDraw.Draw(p)
    bw, bh = 200 * s, 240 * s
    k = min(bw / body.width, bh / body.height)
    b = body.resize((int(body.width * k), int(body.height * k)), Image.LANCZOS)
    p.alpha_composite(b, (95 * s + (bw - b.width) // 2, 20 * s + (bh - b.height) // 2))
    x = 16 * s
    for rr in (40, 30, 26, 22, 18):
        c = disc.resize((2 * rr * s, 2 * rr * s), Image.LANCZOS)
        y = (370 - rr) * s
        draw.ellipse([x - 2 * s, y - 2 * s, x + 2 * rr * s + 2 * s, y + 2 * rr * s + 2 * s], fill=RING)
        p.alpha_composite(c, (x, y))
        x += 2 * rr * s + 12 * s
    p.save(d / "vorschau-handy-3x.png")
    p.resize((W // s, H // s), Image.LANCZOS).save(d / "vorschau-1x.png")


if __name__ == "__main__":
    main(sys.argv[1])
