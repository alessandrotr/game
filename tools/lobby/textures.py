"""
Lobby world — tileable PBR-ish texture generator (albedo + normal), run INSIDE Blender
(needs numpy + bpy.data.images). Writes PNG/JPG into tools/lobby/tex/.

    exec(open('/Users/alessandro/Developer/game/tools/lobby/textures.py').read())

Art direction (the town is lit at dusk: violet ambient, warm sun, orange lanterns):
  * warm plaster / terracotta against cool violet-grey stone -> strong warm/cool contrast
  * deep teal + terracotta + slate roofs so no two neighbours read the same
  * every surface carries a height field so the normal map gives real relief
"""
import os
import numpy as np
import bpy

TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals()
                       else '/Users/alessandro/Developer/game/tools/lobby', 'tex')
os.makedirs(TEX_DIR, exist_ok=True)
S = 512
YS, XS = np.mgrid[0:S, 0:S] / S


def pnoise(freq, seed, octaves=4, persistence=0.5):
    r = np.random.default_rng(seed)
    out = np.zeros((S, S))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        f = freq * (2 ** o)
        g = r.random((f, f))
        fx, fy = XS * f, YS * f
        x0 = np.floor(fx).astype(int) % f
        y0 = np.floor(fy).astype(int) % f
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
    best = np.full((S, S), 9.0)
    second = np.full((S, S), 9.0)
    idx = np.zeros((S, S), int)
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


def save(name, arr, fmt='PNG'):
    img = bpy.data.images.new(name + '_tmp', S, S, alpha=False)
    a = np.clip(arr, 0, 1)
    rgba = np.concatenate([a, np.ones((S, S, 1))], -1)
    img.pixels.foreach_set(rgba[::-1].astype(np.float32).ravel())
    ext = 'jpg' if fmt == 'JPEG' else 'png'
    path = f'{TEX_DIR}/{name}.{ext}'
    img.filepath_raw = path
    img.file_format = fmt
    img.save()
    bpy.data.images.remove(img)
    return path


OUT = {}


def emit(name, albedo, height, nstrength=3.0):
    OUT[name] = {'albedo': save(name, albedo, 'JPEG'), 'normal': save(name + '_n', normal_from_height(height, nstrength), 'JPEG')}


# ---------------------------------------------------------------- stone families
def stones(name, n, seed, c1, c2, mortar=0.16, mortar_col=0.38, relief=3.0):
    b, s, idx, tot = voronoi(n, seed)
    edge = (s - b) * n
    cell = np.random.default_rng(seed + 1).random(tot)[idx]
    nz = pnoise(10, seed + 2) - 0.5
    fine = pnoise(48, seed + 3, 2) - 0.5
    t = 0.12 + 0.62 * cell + 0.35 * nz + 0.12 * fine
    col = lerp(c1, c2, t)
    dome = np.clip(1 - b * n * 1.15, 0, 1)
    col *= (0.86 + 0.22 * dome)[..., None]
    m = np.clip(edge / mortar, 0, 1)
    col *= (mortar_col + (1 - mortar_col) * m)[..., None]
    height = dome * 0.7 * m + 0.25 * m + 0.05 * fine
    emit(name, col, height, relief)


def ashlar(name, seed, c1, c2, rows=8, cols=4, relief=3.0):
    """Rectangular offset-course masonry (castle walls)."""
    row = np.floor(YS * rows).astype(int)
    off = (row % 2) * 0.5 / cols
    u = ((XS + off) * cols) % 1
    v = (YS * rows) % 1
    cell = np.random.default_rng(seed).random((rows, cols))[row, np.floor((XS + off) * cols).astype(int) % cols]
    nz = pnoise(12, seed + 1, 3) - 0.5
    gap = np.minimum(np.minimum(u, 1 - u) * cols / rows * 1.0, np.minimum(v, 1 - v))
    m = np.clip(gap / 0.055, 0, 1)
    col = lerp(c1, c2, 0.2 + 0.5 * cell + 0.5 * nz)
    col *= (0.42 + 0.58 * m)[..., None]
    # weathered streaks running down the wall
    streak = pnoise(3, seed + 5, 2)
    col *= (0.88 + 0.16 * np.clip((streak - 0.4) * 3, 0, 1))[..., None]
    height = m * 0.8 + 0.25 * (pnoise(30, seed + 6, 2) - 0.5)
    emit(name, col, height, relief)


stones('cobble', 10, 11, (0.22, 0.19, 0.17), (0.66, 0.58, 0.50))
stones('cobble2', 12, 12, (0.20, 0.18, 0.17), (0.52, 0.47, 0.43))
stones('foliage', 26, 14, (0.42, 0.42, 0.42), (1.0, 1.0, 1.0), 0.2, 0.28, 2.2)
stones('rubble', 7, 13, (0.30, 0.29, 0.32), (0.72, 0.69, 0.68), 0.14, 0.42, 4.0)
ashlar('ashlar', 21, (0.50, 0.44, 0.38), (0.93, 0.84, 0.70))
ashlar('ashlar_dark', 22, (0.34, 0.31, 0.31), (0.68, 0.62, 0.58))

# ---------------------------------------------------------------- plaster
for name, seed, c1, c2 in [('plaster', 31, (0.62, 0.52, 0.38), (0.97, 0.89, 0.72))]:
    n1, n2, n3 = pnoise(3, seed), pnoise(20, seed + 1, 3), pnoise(60, seed + 2, 2)
    col = lerp(c1, c2, 0.55 + 0.8 * (n1 - 0.5) + 0.3 * (n2 - 0.5))
    # trowel strokes + stained patches near the bottom edge of the tile
    stain = np.clip((YS - 0.72) * 3.2, 0, 1) * (pnoise(5, seed + 3) * 0.9)
    col *= (1 - 0.35 * stain)[..., None]
    emit(name, col, 0.5 * n2 + 0.5 * n3, 1.4)

# ---------------------------------------------------------------- wood
# planks: vertical boards with grain, knots, nail dots and dark gaps
planks = 6
pid = np.floor(XS * planks).astype(int) % planks
pv = np.random.default_rng(41).random(planks)[pid]
local_u = (XS * planks) % 1
grain = np.sin(local_u * 40 + pnoise(3, 42) * 9 + pv * 6) * 0.5 + 0.5
fibres = pnoise(2, 43, 2) * 0 + (pnoise(40, 44, 2) * 0.5 + np.sin(YS * 6 + pv * 8) * 0.1)
gap = (local_u < 0.035) | (local_u > 0.965)
col = lerp((0.17, 0.10, 0.06), (0.52, 0.34, 0.20), 0.2 + 0.4 * pv + 0.25 * grain + 0.25 * fibres)
col[gap] *= 0.3
emit('wood', col, grain * 0.25 + 0.75 * (~gap), 1.6)
# timber beams: grain along the long axis, check cracks
tg = np.sin(YS * 50 + pnoise(3, 45) * 10) * 0.5 + 0.5
crack = np.clip((pnoise(14, 46, 2) - 0.62) * 6, 0, 1)
col = lerp((0.14, 0.085, 0.05), (0.38, 0.25, 0.15), 0.25 + 0.45 * tg + 0.25 * (pnoise(10, 47) - 0.5))
col *= (1 - 0.6 * crack)[..., None]
emit('timber', col, tg * 0.15 - crack * 0.35, 1.0)

# ---------------------------------------------------------------- roofs
def roof_tiles(name, seed, c1, c2, rows=9, cols=6, rounded=True):
    row = np.floor(YS * rows).astype(int)
    off = (row % 2) * 0.5 / cols
    cx = ((XS + off) * cols) % 1
    ry = (YS * rows) % 1
    cell = np.floor((XS + off) * cols).astype(int) % cols
    cv = np.random.default_rng(seed).random((rows, cols))[row, cell]
    # scalloped lower edge of each tile
    curve = (np.abs(cx - 0.5) * 2) ** 2 * 0.22 if rounded else 0.0
    body = np.clip((ry - curve) / 0.0001, 0, 1) if rounded else 1.0
    base = lerp(c1, c2, 0.15 + 0.7 * cv + 0.25 * (pnoise(10, seed + 1) - 0.5))
    shade = 0.5 + 0.5 * np.clip(ry * 1.15, 0, 1)
    edge = np.minimum(cx, 1 - cx)
    shade *= 0.6 + 0.4 * np.clip(edge / 0.07, 0, 1)
    moss = np.clip((pnoise(7, seed + 3) - 0.62) * 4, 0, 1)
    base = base * (1 - 0.35 * moss[..., None]) + np.array((0.2, 0.3, 0.12))[None, None, :] * 0.35 * moss[..., None]
    height = shade * 0.8 + 0.2 * cv
    emit(name, base * shade[..., None], height, 3.5)


roof_tiles('roof_terracotta', 51, (0.34, 0.10, 0.06), (0.78, 0.34, 0.20))
roof_tiles('roof_teal', 52, (0.07, 0.20, 0.22), (0.24, 0.52, 0.52))
roof_tiles('roof_slate', 53, (0.16, 0.17, 0.24), (0.46, 0.48, 0.58), rounded=False)
# thatch: dense diagonal straw
sx = np.sin((XS * 90 + YS * 18) + pnoise(6, 54) * 6) * 0.5 + 0.5
sy = pnoise(30, 55, 3)
col = lerp((0.34, 0.24, 0.10), (0.82, 0.66, 0.34), 0.2 + 0.4 * sx + 0.45 * (sy - 0.4))
emit('thatch', col, sx * 0.5 + sy * 0.5, 2.5)

# ---------------------------------------------------------------- marble (fountain, statuary)
m1, m2 = pnoise(3, 101), pnoise(9, 102, 4)
vein = np.abs(np.sin((XS * 5 + YS * 3) * np.pi + m2 * 9 + m1 * 5))
vein = np.clip(1 - vein * 7, 0, 1) ** 2
col = lerp((0.52, 0.55, 0.64), (0.88, 0.87, 0.90), 0.55 + 0.9 * (m1 - 0.5))
col = col * (1 - 0.5 * vein[..., None]) + np.array((0.45, 0.5, 0.62))[None, None, :] * 0.5 * vein[..., None]
emit('marble', col, m2 * 0.2 - vein * 0.15, 0.8)

# ---------------------------------------------------------------- ground
g1, g2, g3 = pnoise(6, 61), pnoise(28, 62, 3), pnoise(120, 63, 2)
blade = np.sin(XS * 160 + g2 * 10) * 0.5 + 0.5
col = lerp((0.16, 0.30, 0.09), (0.50, 0.66, 0.26), 0.25 + 0.55 * (g1 - 0.3) + 0.3 * (g2 - 0.5) + 0.12 * (blade - 0.5))
patch = np.clip((pnoise(4, 64) - 0.6) * 5, 0, 1)
col = col * (1 - 0.45 * patch[..., None]) + np.array((0.42, 0.34, 0.16))[None, None, :] * 0.45 * patch[..., None]
emit('grass', col, g2 * 0.6 + g3 * 0.4, 1.8)
d1, d2 = pnoise(5, 71), pnoise(35, 72, 3)
pebble = np.clip((pnoise(70, 73, 1) - 0.72) * 8, 0, 1)
emit('dirt', lerp((0.22, 0.14, 0.08), (0.58, 0.42, 0.26), 0.15 + 1.1 * (d1 - 0.3) + 0.4 * (d2 - 0.5)) * (1 + 0.25 * pebble[..., None]),
     d2 * 0.5 + pebble * 0.6, 2.5)
r1, r2 = pnoise(5, 81), pnoise(20, 82, 4)
strata = np.sin(YS * 22 + r1 * 9) * 0.5 + 0.5
emit('rock', lerp((0.20, 0.19, 0.22), (0.62, 0.58, 0.56), 0.15 + 1.2 * (r1 - 0.3) + 0.35 * (r2 - 0.5) + 0.18 * strata),
     r2 * 0.6 + strata * 0.3, 4.0)
bs = np.sin(XS * 44 + pnoise(4, 91) * 9) * 0.5 + 0.5
emit('bark', lerp((0.10, 0.065, 0.04), (0.42, 0.30, 0.20), 0.15 + 0.5 * bs + 0.4 * (pnoise(9, 92) - 0.5)), bs * 0.7 + 0.3 * pnoise(30, 93), 2.6)

bpy.app.driver_namespace['LOBBY_TEX'] = OUT
print('textures:', sorted(OUT))
