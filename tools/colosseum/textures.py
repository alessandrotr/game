"""
Colosseum tileable textures (albedo + normal) — run INSIDE Blender (needs numpy + bpy.images).
Writes JPGs into tools/colosseum/tex/ ; gen.py calls this automatically when they are missing
(delete tools/colosseum/tex to regenerate).

Warm golden-hour palette to match the arena reference: cream marble with gold-grey veins,
honey limestone masonry, sun-baked flagstones, golden sand, woven cloth.
Wood / timber / dirt are shared with the lobby set (copied from tools/lobby/tex).
"""
import os
import shutil

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else '/Users/alessandro/Developer/game/tools/colosseum'
TEX_DIR = os.path.join(HERE, 'tex')
LOBBY_TEX = os.path.join(HERE, '..', 'lobby', 'tex')
os.makedirs(TEX_DIR, exist_ok=True)
S = 512
YS, XS = np.mgrid[0:S, 0:S] / S


def pnoise(freq, seed, octaves=4, persistence=0.5):
    """Tileable value noise in [0,1]."""
    r = np.random.default_rng(seed)
    out, amp, tot = np.zeros((S, S)), 1.0, 0.0
    for o in range(octaves):
        f = freq * (2 ** o)
        g = r.random((f, f))
        fx, fy = XS * f, YS * f
        x0, y0 = np.floor(fx).astype(int) % f, np.floor(fy).astype(int) % f
        x1, y1 = (x0 + 1) % f, (y0 + 1) % f
        tx, ty = fx - np.floor(fx), fy - np.floor(fy)
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        v = (g[y0, x0] * (1 - tx) + g[y0, x1] * tx) * (1 - ty) + (g[y1, x0] * (1 - tx) + g[y1, x1] * tx) * ty
        out += v * amp
        tot += amp
        amp *= persistence
    return out / tot


def voronoi(n, seed):
    r = np.random.default_rng(seed)
    pts = ((np.stack(np.meshgrid(np.arange(n), np.arange(n)), -1) + 0.15 + 0.7 * r.random((n, n, 2))) / n).reshape(-1, 2)
    best, second, idx = np.full((S, S), 9.0), np.full((S, S), 9.0), np.zeros((S, S), int)
    for k, (px, py) in enumerate(pts):
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                d = np.hypot(XS - (px + ox), YS - (py + oy))
                m = d < best
                second = np.where(m, best, np.minimum(second, d))
                idx = np.where(m, k, idx)
                best = np.where(m, d, best)
    return best, second, idx, len(pts)


def lerp(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return np.array(a)[None, None, :] * (1 - t) + np.array(b)[None, None, :] * t


def normal_from_height(h, strength):
    dhdu = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * 24
    dhdv = -(np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * 24
    n = np.stack([-dhdu * strength, -dhdv * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def save(name, arr):
    img = bpy.data.images.new(name + '_tmp', S, S, alpha=False)
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((S, S, 1))], -1)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    path = f'{TEX_DIR}/{name}.jpg'
    img.filepath_raw = path
    img.file_format = 'JPEG'
    img.save()
    bpy.data.images.remove(img)


def emit(name, albedo, height, nstrength=3.0, normal=True):
    save(name, albedo)
    if normal:
        save(name + '_n', normal_from_height(height, nstrength))


# ───────────────────────────────────────────── marble: cream, gold-grey veins
def marble(name, seed, tone=0.0):
    m1, m2 = pnoise(3, seed), pnoise(9, seed + 1, 4)
    vein = np.abs(np.sin((XS * 4 + YS * 3) * np.pi + m2 * 9 + m1 * 5))
    vein = np.clip(1 - vein * 6, 0, 1) ** 1.5
    vein2 = np.clip(1 - np.abs(np.sin((XS * 7 - YS * 5) * np.pi + m1 * 12)) * 14, 0, 1) ** 2 * 0.5
    col = lerp((0.80 + tone, 0.74 + tone, 0.64 + tone), (0.97, 0.94, 0.86), 0.5 + 0.9 * (m1 - 0.5))
    vcol = np.array((0.58, 0.50, 0.38))[None, None, :]
    v = np.clip(vein + vein2, 0, 1)[..., None]
    col = col * (1 - 0.8 * v) + vcol * 0.8 * v
    col *= (0.96 + 0.08 * pnoise(40, seed + 2, 2))[..., None]
    emit(name, col, m2 * 0.2 - vein * 0.12, 0.7)


# ───────────────────────────────────────────── ashlar masonry (offset courses)
def ashlar(name, seed, c1, c2, rows=6, cols=3, normal=True):
    row = np.floor(YS * rows).astype(int)
    off = (row % 2) * 0.5 / cols
    u = ((XS + off) * cols) % 1
    v = (YS * rows) % 1
    cell = np.random.default_rng(seed).random((rows, cols))[row, np.floor((XS + off) * cols).astype(int) % cols]
    nz = pnoise(12, seed + 1, 3) - 0.5
    gap = np.minimum(np.minimum(u, 1 - u) * cols / rows, np.minimum(v, 1 - v))
    m = np.clip(gap / 0.05, 0, 1)
    col = lerp(c1, c2, 0.25 + 0.5 * cell + 0.55 * nz)
    col *= (0.55 + 0.45 * m)[..., None]
    streak = pnoise(3, seed + 5, 2)
    col *= (0.9 + 0.14 * np.clip((streak - 0.4) * 3, 0, 1))[..., None]
    col *= (0.95 + 0.1 * pnoise(60, seed + 7, 2))[..., None]
    emit(name, col, m * 0.8 + 0.25 * (pnoise(30, seed + 6, 2) - 0.5), 2.6, normal)


# ───────────────────────────────────────────── flagstone paving
def flagstone(name, seed, c1, c2, n=5, normal=True):
    b, s, idx, tot = voronoi(n, seed)
    edge = (s - b) * n
    cell = np.random.default_rng(seed + 1).random(tot)[idx]
    nz = pnoise(10, seed + 2) - 0.5
    fine = pnoise(48, seed + 3, 2) - 0.5
    col = lerp(c1, c2, 0.15 + 0.6 * cell + 0.35 * nz + 0.12 * fine)
    dome = np.clip(1 - b * n * 1.1, 0, 1)
    col *= (0.88 + 0.2 * dome)[..., None]
    m = np.clip(edge / 0.12, 0, 1)
    col *= (0.5 + 0.5 * m)[..., None]
    emit(name, col, dome * 0.5 * m + 0.25 * m + 0.05 * fine, 2.4, normal)


# ───────────────────────────────────────────── sand: grain + wind ripples + trampled patches
def sand(name, seed, c1, c2, normal=True):
    g1, g2, g3 = pnoise(4, seed), pnoise(20, seed + 1, 3), pnoise(150, seed + 2, 2)
    ripple = np.sin((XS * 3 + YS * 1.5) * 2 * np.pi * 3 + g1 * 9) * 0.5 + 0.5
    col = lerp(c1, c2, 0.45 + 0.45 * (g1 - 0.5) + 0.15 * (g2 - 0.5) + 0.06 * (ripple - 0.5) + 0.1 * (g3 - 0.5))
    pebble = np.clip((pnoise(70, seed + 3, 1) - 0.82) * 10, 0, 1)
    col *= (1 - 0.15 * pebble)[..., None]
    emit(name, col, g2 * 0.4 + ripple * 0.35 + g3 * 0.25, 0.9, normal)


# ───────────────────────────────────────────── slab: soft mottled limestone paving (no cells)
def slab(name, seed, c1, c2, normal=True):
    n1, n2, n3 = pnoise(3, seed), pnoise(16, seed + 1, 3), pnoise(90, seed + 2, 2)
    col = lerp(c1, c2, 0.5 + 0.6 * (n1 - 0.5) + 0.3 * (n2 - 0.5) + 0.12 * (n3 - 0.5))
    speck = np.clip((pnoise(120, seed + 3, 1) - 0.78) * 8, 0, 1)
    col *= (1 - 0.18 * speck)[..., None]
    emit(name, col, n2 * 0.5 + n3 * 0.5, 1.0, normal)


# ───────────────────────────────────────────── woven cloth (banners, wagon canvas)
def cloth(name, seed, c1, c2):
    wx = np.sin(XS * 2 * np.pi * 110) * 0.5 + 0.5
    wy = np.sin(YS * 2 * np.pi * 110) * 0.5 + 0.5
    weave = np.where(((np.floor(XS * 110) + np.floor(YS * 110)) % 2) == 0, wx, wy)
    n = pnoise(8, seed, 3)
    col = lerp(c1, c2, 0.3 + 0.35 * weave + 0.5 * (n - 0.5))
    emit(name, col, weave * 0.6 + 0.2 * n, 1.2, normal=False)


marble('marble', 101)
marble('marble_dk', 111, tone=-0.1)
ashlar('stone', 21, (0.56, 0.46, 0.33), (0.93, 0.83, 0.64))
ashlar('stone_a', 22, (0.54, 0.44, 0.31), (0.90, 0.79, 0.60), normal=False)
ashlar('stone_b', 23, (0.62, 0.52, 0.38), (0.96, 0.87, 0.69), normal=False)
ashlar('stone_c', 24, (0.50, 0.41, 0.29), (0.85, 0.74, 0.55), normal=False)
ashlar('stone_dk', 25, (0.34, 0.28, 0.20), (0.62, 0.52, 0.38), normal=False)
slab('paving1', 31, (0.74, 0.67, 0.53), (0.95, 0.90, 0.78))
slab('paving2', 32, (0.70, 0.62, 0.48), (0.92, 0.86, 0.72), normal=False)
slab('paving3', 33, (0.77, 0.70, 0.56), (0.97, 0.93, 0.82), normal=False)
sand('sand', 41, (0.72, 0.55, 0.31), (0.94, 0.79, 0.52))
sand('sand_dk', 42, (0.66, 0.49, 0.26), (0.88, 0.70, 0.44), normal=False)
cloth('canvas', 51, (0.72, 0.64, 0.46), (0.94, 0.88, 0.72))
cloth('banner', 52, (0.40, 0.07, 0.07), (0.70, 0.15, 0.13))

for f in ('wood', 'wood_n', 'timber', 'timber_n', 'dirt', 'dirt_n'):
    src = os.path.join(LOBBY_TEX, f + '.jpg')
    if os.path.exists(src):
        shutil.copy(src, os.path.join(TEX_DIR, f + '.jpg'))
print('colosseum textures ->', TEX_DIR)
