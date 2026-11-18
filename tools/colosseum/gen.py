"""
Colosseum arena generator (FFA arena) — Blender 4.2+ (built on 5.3).

Everything is code. Change a number, re-run, re-export. No hand-edited meshes.

Run headless so it never touches an open Blender session:

    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/colosseum/gen.py

Outputs (override with env vars):
    COLOSSEUM_GLB   apps/client/public/models/colosseum.glb
    COLOSSEUM_TS    packages/shared/src/colosseum.ts      (collision circles, spawns, lights)
    COLOSSEUM_PNG   (optional) preview render path

Coordinates: authored in Blender (Z-up, +Y = north gate). glTF export maps
(x, y, z) -> (x, z, -y), so GAME x = blender x and GAME z = -blender y.
Collision data is emitted in GAME coordinates from the very same placement tables
that build the meshes, so the visuals and the circles cannot drift apart.
"""

import math
import os
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')) if '__file__' in globals() else '/Users/alessandro/Developer/game'
GLB_OUT = os.environ.get('COLOSSEUM_GLB', os.path.join(ROOT, 'apps/client/public/models/colosseum.glb'))
TS_OUT = os.environ.get('COLOSSEUM_TS', os.path.join(ROOT, 'packages/shared/src/colosseum.ts'))
PNG_OUT = os.environ.get('COLOSSEUM_PNG', '')

# ─────────────────────────────────────────────────────────────── dimensions
FLOOR_R = 30.0          # playable sand floor radius (parapet inner face)
PARAPET_T = 0.8
PARAPET_H = 1.3
TIERS = 7
TIER_D = 1.5            # radial depth per tier
TIER_H0 = 1.6           # height of first tier top
TIER_DH = 0.95          # extra height per tier
WALL_R0 = FLOOR_R + PARAPET_T + TIERS * TIER_D + 0.1   # outer wall inner face (~41.4)
WALL_T = 2.0
WALL_H = 14.0
GATE_HW = 3.6           # half width of the 4 gate openings
PATH_W = 5.0
DAIS_R = 7.0
PLAYER_CLAMP = FLOOR_R - 0.6

rng = random.Random(11)

# ─────────────────────────────────────────────────────────────── materials
# 'tex' = (albedo image, metres per tile, normal image or None). Images come from textures.py.
MATS = {
    'sand':      dict(c='#D9A65A', r=0.95, tex=('sand', 7.0, 'sand_n')),
    'sand_dk':   dict(c='#CF9D52', r=0.97, tex=('sand_dk', 7.0, 'sand_n')),
    'ground':    dict(c='#8A6A43', r=1.0, tex=('dirt', 9.0, 'dirt_n')),
    'stone':     dict(c='#CDBA98', r=0.85, tex=('stone', 4.0, 'stone_n')),
    'stone_a':   dict(c='#C7B28E', r=0.85, tex=('stone_a', 4.0, 'stone_n')),
    'stone_b':   dict(c='#D6C5A4', r=0.85, tex=('stone_b', 4.0, 'stone_n')),
    'stone_c':   dict(c='#BEA982', r=0.88, tex=('stone_c', 4.0, 'stone_n')),
    'stone_dk':  dict(c='#93805F', r=0.9, tex=('stone_dk', 4.0, 'stone_n')),
    'stone_w':   dict(c='#E6D9BE', r=0.4, tex=('marble', 3.0, 'marble_n')),      # polished marble
    'marble_dk': dict(c='#CFC3A8', r=0.45, tex=('marble_dk', 3.0, 'marble_dk_n')),
    'paving1':   dict(c='#E2D4B6', r=0.8, tex=('paving1', 2.0, 'paving1_n')),
    'paving2':   dict(c='#D8C9A8', r=0.8, tex=('paving2', 2.0, 'paving1_n')),
    'paving3':   dict(c='#E9DDC3', r=0.8, tex=('paving3', 2.0, 'paving1_n')),
    'gold':      dict(c='#E8B33A', r=0.45, m=0.25, e='#9A6200', es=0.5),
    'gold_dk':   dict(c='#B98B22', r=0.55, m=0.2),
    'wood':      dict(c='#8A5A2E', r=0.85, tex=('wood', 2.0, 'wood_n')),
    'wood_dk':   dict(c='#4A2E17', r=0.9, tex=('timber', 2.0, 'timber_n')),
    'canvas':    dict(c='#E5D5AE', r=0.95, tex=('canvas', 2.0, None)),
    'iron':      dict(c='#3A3A40', r=0.55, m=0.3),
    'dark':      dict(c='#17110C', r=1.0),
    'banner':    dict(c='#A8221F', r=0.8, tex=('banner', 2.0, None)),
    'fire':      dict(c='#FF6A10', r=0.6, e='#FF5A08', es=2.6),
    'fire_core': dict(c='#FFD23A', r=0.6, e='#FFB020', es=3.2),
    'sun':       dict(c='#FFEBA8', r=0.6, e='#FFE08A', es=5.0),
}
_mat_cache = {}


def hexc(h):
    h = h.lstrip('#')
    lin = lambda v: (v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(ROOT, 'tools/colosseum'), 'tex')


def ensure_textures():
    if not os.path.exists(os.path.join(TEX_DIR, 'sand.jpg')):
        src = os.path.join(os.path.dirname(TEX_DIR), 'textures.py')
        exec(compile(open(src).read(), src, 'exec'), {'__file__': src, '__name__': 'colosseum_tex', 'bpy': bpy})


def get_mat(name):
    if name in _mat_cache:
        return _mat_cache[name]
    d = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexc(d['c'])
    b.inputs['Roughness'].default_value = d.get('r', 0.8)
    b.inputs['Metallic'].default_value = d.get('m', 0.0)
    if 'e' in d:
        b.inputs['Emission Color'].default_value = hexc(d['e'])
        b.inputs['Emission Strength'].default_value = d['es']
    if 'tex' in d:
        albedo, _ts, nrm = d['tex']
        ti = nt.nodes.new('ShaderNodeTexImage')
        ti.image = bpy.data.images.load(os.path.join(TEX_DIR, albedo + '.jpg'), check_existing=True)
        nt.links.new(ti.outputs['Color'], b.inputs['Base Color'])
        if nrm:
            ni = nt.nodes.new('ShaderNodeTexImage')
            ni.image = bpy.data.images.load(os.path.join(TEX_DIR, nrm + '.jpg'), check_existing=True)
            ni.image.colorspace_settings.name = 'Non-Color'
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = 0.8
            nt.links.new(ni.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    _mat_cache[name] = m
    return m


def tile_scale(name):
    t = MATS[name].get('tex')
    return t[1] if t else None


def project_uv(pts, ts, cyl=None):
    """World-space projected UVs (constant texel density across every object).
    Planar box projection on the dominant normal axis; vertical faces on round walls/tiers use a
    cylindrical projection (u = arc length) so the masonry courses wrap without seams."""
    n = Vector((0, 0, 0))
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a[1] - b[1]) * (a[2] + b[2])
        n.y += (a[2] - b[2]) * (a[0] + b[0])
        n.z += (a[0] - b[0]) * (a[1] + b[1])
    if n.length < 1e-9:
        return [(0.0, 0.0)] * len(pts)
    n.normalize()
    if cyl and abs(n.z) < 0.5:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        rl = math.hypot(cx, cy)
        if rl > 1e-6 and abs(n.x * cx / rl + n.y * cy / rl) > 0.7:
            base = math.atan2(pts[0][1], pts[0][0])
            out = []
            for p in pts:
                d = math.atan2(p[1], p[0]) - base
                d = (d + math.pi) % (2 * math.pi) - math.pi
                out.append(((base + d) * cyl / ts, p[2] / ts))
            return out
    ax = max(range(3), key=lambda k: abs(n[k]))
    if ax == 2:
        return [(p[0] / ts, p[1] / ts) for p in pts]
    if ax == 0:
        return [(p[1] / ts, p[2] / ts) for p in pts]
    return [(p[0] / ts, p[2] / ts) for p in pts]


# ─────────────────────────────────────────────────────────────── mesh builder
class MB:
    """Accumulates closed solids per object-group; one Blender mesh per group."""

    def __init__(self):
        self.g = {}
        self.group = 'Props'
        self.stack = [Matrix.Identity(4)]

    def push(self, m):
        self.stack.append(self.stack[-1] @ m)

    def pop(self):
        self.stack.pop()

    def _grp(self):
        return self.g.setdefault(self.group, dict(v=[], f=[], fm=[], mats=[], uv=[]))

    def add(self, verts, faces, mat, cyl=None):
        g = self._grp()
        if mat not in g['mats']:
            g['mats'].append(mat)
        mi = g['mats'].index(mat)
        M = self.stack[-1]
        o = len(g['v'])
        W = [tuple(M @ Vector(v)) for v in verts]
        g['v'].extend(W)
        ts = tile_scale(mat)
        for f in faces:
            g['f'].append(tuple(i + o for i in f))
            g['fm'].append(mi)
            g['uv'].append(project_uv([W[i] for i in f], ts, cyl) if ts else [(0.0, 0.0)] * len(f))

    def loft(self, bot, top, z0, z1, mat):
        n = len(bot)
        verts = [(x, y, z0) for x, y in bot] + [(x, y, z1) for x, y in top]
        faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
        for i in range(n):
            j = (i + 1) % n
            faces.append((i, j, n + j, n + i))
        self.add(verts, faces, mat)

    def prism(self, pts, z0, z1, mat):
        self.loft(pts, pts, z0, z1, mat)

    def box(self, x, y, z, sx, sy, sz, mat, rot=0.0):
        self.push(Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z'))
        self.prism([(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)], 0, sz, mat)
        self.pop()

    def frustum(self, x, y, z, r0, r1, h, mat, seg=12, rot=0.0):
        self.push(Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z'))
        ring = lambda r: [(r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
        self.loft(ring(r0), ring(max(r1, 0.02)), 0, h, mat)
        self.pop()

    def arc(self, r0, r1, a0, a1, z0, z1, mat, step_deg=3.0):
        n = max(1, int(math.ceil(math.degrees(a1 - a0) / step_deg)))
        verts, faces = [], []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            c, s = math.cos(a), math.sin(a)
            # layout per column: in_bot, out_bot, out_top, in_top
            verts += [(r0 * c, r0 * s, z0), (r1 * c, r1 * s, z0), (r1 * c, r1 * s, z1), (r0 * c, r0 * s, z1)]
        for i in range(n):
            b, nx = 4 * i, 4 * (i + 1)
            ib, ob, ot, it = 0, 1, 2, 3
            faces.append((b + it, b + ot, nx + ot, nx + it))        # top
            faces.append((b + ib, nx + ib, nx + ob, b + ob))        # bottom
            faces.append((b + ob, nx + ob, nx + ot, b + ot))        # outer
            faces.append((b + ib, b + it, nx + it, nx + ib))        # inner
        e = 4 * n
        faces.append((0, 1, 2, 3))                       # start cap (faces -tangent)
        faces.append((e + 3, e + 2, e + 1, e + 0))       # end cap (faces +tangent)
        self.add(verts, faces, mat, cyl=(r0 + r1) / 2)


MBD = MB()


def ang_ranges(half_w, r):
    """Angular intervals between the four gate gaps at radius r (gate half-width half_w)."""
    h = math.asin(min(0.99, half_w / r))
    out = []
    for k in range(4):
        c = k * math.pi / 2
        out.append((c + h, c + math.pi / 2 - h))
    return out


GATES = {'E': 0.0, 'N': math.pi / 2, 'W': math.pi, 'S': 3 * math.pi / 2}

# ─────────────────────────────────────────────────────────────── collision/data sinks
OBSTACLES = []   # game-space circles {x, z, radius, height}
LIGHTS = []      # brazier/torch flame anchors (game space)


def obstacle(bx, by, radius, height):
    OBSTACLES.append(dict(x=round(bx, 2), z=round(-by, 2), radius=radius, height=height))


# ─────────────────────────────────────────────────────────────── ground
def build_floor():
    """Faceted low-poly sand disc + a dark outer apron so there is no void."""
    rings, seg = 22, 80
    verts, faces = [(0.0, 0.0, 0.0)], []
    idx = {}
    for k in range(1, rings + 1):
        r = FLOOR_R * k / rings
        for i in range(seg):
            a = 2 * math.pi * i / seg + (0.5 * (k % 2)) * math.pi / seg
            jr = 0.0 if k == rings else rng.uniform(-0.25, 0.25)
            z = 0.0 if k == rings else rng.uniform(-0.02, 0.0)
            idx[(k, i)] = len(verts)
            verts.append(((r + jr) * math.cos(a), (r + jr) * math.sin(a), z))
    for i in range(seg):
        faces.append((0, idx[(1, i)], idx[(1, (i + 1) % seg)]))
    for k in range(1, rings):
        for i in range(seg):
            j = (i + 1) % seg
            a, b, c, d = idx[(k, i)], idx[(k + 1, i)], idx[(k + 1, j)], idx[(k, j)]
            faces.append((a, b, c))
            faces.append((a, c, d))
    mats = [get_mat('sand'), get_mat('sand_dk')]
    me = bpy.data.meshes.new('Floor_Sand')
    me.from_pydata(verts, [], faces)
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.material_index = 1 if rng.random() < 0.10 else 0
    uvl = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        ts = tile_scale('sand')
        for li, vi in zip(p.loop_indices, p.vertices):
            uvl.data[li].uv = (me.vertices[vi].co.x / ts, me.vertices[vi].co.y / ts)
    me.update()
    ob = bpy.data.objects.new('Floor_Sand', me)
    bpy.context.scene.collection.objects.link(ob)

    # outer apron (below the stands, so nothing is ever see-through)
    ap = bpy.data.meshes.new('Floor_Apron')
    n = 64
    av = [(0, 0, -0.3)] + [(150 * math.cos(2 * math.pi * i / n), 150 * math.sin(2 * math.pi * i / n), -0.3) for i in range(n)]
    af = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    ap.from_pydata(av, [], af)
    ap.materials.append(get_mat('ground'))
    auv = ap.uv_layers.new(name='UVMap')
    for p in ap.polygons:
        for li, vi in zip(p.loop_indices, p.vertices):
            auv.data[li].uv = (ap.vertices[vi].co.x / tile_scale('ground'), ap.vertices[vi].co.y / tile_scale('ground'))
    ap.update()
    bpy.context.scene.collection.objects.link(bpy.data.objects.new('Floor_Apron', ap))


def build_paths():
    MBD.group = 'Floor_Paving'
    tile_l, cols = 1.5, 3
    cw = PATH_W / cols
    pm = ['paving1', 'paving2', 'paving3']
    for k in range(4):
        rot = k * math.pi / 2
        MBD.push(Matrix.Rotation(rot, 4, 'Z'))
        r = DAIS_R - 0.5
        while r < FLOOR_R + 0.6:
            for c in range(cols):
                y = -PATH_W / 2 + cw * (c + 0.5)
                L = min(tile_l, FLOOR_R + 0.7 - r)
                MBD.box(r + L / 2, y, 0, L - 0.07, cw - 0.07, 0.035, rng.choice(pm))
            r += tile_l
        # gold edge strips
        for s in (-1, 1):
            MBD.box((DAIS_R + FLOOR_R) / 2, s * (PATH_W / 2 + 0.12), 0, FLOOR_R - DAIS_R, 0.2, 0.05, 'gold')
        MBD.pop()


def build_dais():
    MBD.group = 'Dais'
    for r, h, m in ((DAIS_R, 0.09, 'marble_dk'), (DAIS_R - 0.8, 0.17, 'stone_w'), (DAIS_R - 1.7, 0.24, 'marble_dk')):
        MBD.frustum(0, 0, 0, r, r, h, m, seg=48)
    top = 0.24
    # gold ring + 12 point sun
    MBD.frustum(0, 0, top, 4.1, 4.1, 0.03, 'gold', seg=48)
    MBD.frustum(0, 0, top, 3.85, 3.85, 0.04, 'stone_w', seg=48)
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        r = 3.5 if i % 2 == 0 else 2.0
        pts.append((r * math.cos(a), r * math.sin(a)))
    MBD.prism(pts, top, top + 0.06, 'gold')
    MBD.frustum(0, 0, top, 1.3, 1.3, 0.1, 'gold', seg=24)
    MBD.frustum(0, 0, top, 0.95, 0.95, 0.14, 'sun', seg=24)
    # four stair flights
    for k in range(4):
        MBD.push(Matrix.Rotation(k * math.pi / 2, 4, 'Z'))
        for s in range(3):
            MBD.box(DAIS_R + 0.55 - s * 0.55 + 0.4, 0, 0, 0.6, 3.0, 0.07 + s * 0.06, 'stone_w')
        MBD.pop()


# ─────────────────────────────────────────────────────────────── shell
def build_shell():
    # parapet
    MBD.group = 'Shell'
    for k, (a0, a1) in enumerate(ang_ranges(GATE_HW + 0.4, FLOOR_R)):
        MBD.arc(FLOOR_R, FLOOR_R + PARAPET_T, a0, a1, 0, PARAPET_H, 'stone')
        MBD.arc(FLOOR_R - 0.05, FLOOR_R + PARAPET_T + 0.1, a0, a1, PARAPET_H, PARAPET_H + 0.16, 'gold_dk')
    # seating tiers (alternate tint) + aisles
    for t in range(TIERS):
        r0 = FLOOR_R + PARAPET_T + t * TIER_D
        r1 = r0 + TIER_D
        h = TIER_H0 + t * TIER_DH
        m = ('stone_a', 'stone_c', 'stone_b')[t % 3]
        for (a0, a1) in ang_ranges(GATE_HW + 0.4, r0):
            MBD.arc(r0, r1, a0, a1, 0, h, m, step_deg=3.75)
            MBD.arc(r0, r0 + 0.12, a0, a1, h, h + 0.08, 'stone_dk', step_deg=3.75)  # riser lip
    for k in range(4):
        for j in range(1, 6):   # aisles
            a = k * math.pi / 2 + j * math.pi / 12
            for t in range(TIERS):
                r0 = FLOOR_R + PARAPET_T + t * TIER_D
                h = TIER_H0 + t * TIER_DH
                MBD.arc(r0, r0 + TIER_D, a - 0.012, a + 0.012, 0, h + 0.05, 'stone_w', step_deg=2)

    # outer wall
    for (a0, a1) in ang_ranges(GATE_HW + 0.4, WALL_R0):
        MBD.arc(WALL_R0, WALL_R0 + WALL_T, a0, a1, 0, WALL_H, 'stone')
        MBD.arc(WALL_R0 - 0.2, WALL_R0 + WALL_T + 0.2, a0, a1, WALL_H, WALL_H + 0.7, 'stone_dk')
        MBD.arc(WALL_R0 - 0.1, WALL_R0 + WALL_T + 0.1, a0, a1, WALL_H * 0.62, WALL_H * 0.62 + 0.25, 'gold_dk')
        # crenellations
        n = int(math.degrees(a1 - a0) / 3.0)
        for i in range(n):
            a = a0 + (a1 - a0) * (i + 0.5) / n
            rm = WALL_R0 + WALL_T / 2
            MBD.box(rm * math.cos(a), rm * math.sin(a), WALL_H + 0.7, 1.6, WALL_T + 0.1, 1.0, 'stone_b', rot=a + math.pi / 2)
        # dark arched niches + red banners on the inner face
        n2 = int(math.degrees(a1 - a0) / 7.5)
        for i in range(n2):
            a = a0 + (a1 - a0) * (i + 0.5) / n2
            rr = WALL_R0 + 0.02
            MBD.box(rr * math.cos(a), rr * math.sin(a), 8.2, 2.0, 0.25, 4.2, 'dark', rot=a - math.pi / 2)
            MBD.box(rr * math.cos(a), rr * math.sin(a), 12.2, 2.4, 0.3, 0.35, 'gold_dk', rot=a - math.pi / 2)
    # hanging banners on the wall face (between niches)
    MBD.group = 'Banners'
    for k in range(16):
        a = math.radians(11.25 + k * 22.5)
        if min(abs(((a - g + math.pi) % (2 * math.pi)) - math.pi) for g in GATES.values()) < math.radians(12):
            continue
        rr = WALL_R0 - 0.08
        MBD.push(Matrix.Translation((rr * math.cos(a), rr * math.sin(a), 0)) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z'))
        MBD.box(0, 0, 3.0, 1.9, 0.1, 5.2, 'banner')
        MBD.box(0, -0.02, 3.4, 0.28, 0.04, 3.6, 'gold')
        MBD.box(0, -0.02, 5.4, 1.1, 0.04, 0.28, 'gold')
        MBD.box(0, 0, 8.2, 2.2, 0.14, 0.16, 'wood_dk')
        MBD.pop()
    # tilted pennants along the tiers (like the reference banners leaning on the seating)
    for k in range(10):
        a = math.radians(18 + k * 36)
        if min(abs(((a - g + math.pi) % (2 * math.pi)) - math.pi) for g in GATES.values()) < math.radians(14):
            continue
        t = 3 + (k % 3)
        rr = FLOOR_R + PARAPET_T + t * TIER_D + 0.7
        h = TIER_H0 + t * TIER_DH
        MBD.push(Matrix.Translation((rr * math.cos(a), rr * math.sin(a), h)) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.radians(-25), 4, 'X'))
        MBD.box(0, 0, 0, 1.6, 0.08, 2.6, 'banner')
        MBD.box(0, 0.0, 0.5, 0.2, 0.1, 1.6, 'gold')
        MBD.pop()


def build_gates():
    MBD.group = 'Gates'
    for name, ang in GATES.items():
        MBD.push(Matrix.Rotation(ang, 4, 'Z'))       # local +x points out through this gate
        r0 = FLOOR_R + PARAPET_T
        depth = 4.5
        hw = GATE_HW
        # tunnel walls + roof + dark back wall
        for s in (-1, 1):
            MBD.box(r0 + depth / 2 + 0.2, s * (hw + 0.6), 0, depth + 0.4, 1.2, 8.0, 'stone')
            MBD.box(r0 + 0.1, s * (hw + 0.6), 0, 1.5, 1.5, 9.0, 'stone_b')
            MBD.box(r0 + 0.1, s * (hw + 0.6), 9.0, 1.9, 1.9, 0.3, 'gold_dk')
        MBD.box(r0 + depth / 2, 0, 6.6, depth, 2 * hw + 2.4, 1.4, 'stone_b')
        MBD.box(r0 + depth + 0.3, 0, 0, 0.5, 2 * hw + 2.4, 10.0, 'dark')
        # lintel with gold crest
        MBD.box(r0 - 0.2, 0, 6.6, 1.6, 2 * hw + 3.0, 1.5, 'stone')
        MBD.box(r0 - 0.15, 0, 8.1, 1.5, 2 * hw + 3.2, 0.35, 'gold_dk')
        # portcullis (iron N/S, wood E/W)
        bar = 'iron' if name in ('N', 'S') else 'wood_dk'
        gx = r0 + 1.6
        n = int(2 * hw / 0.55)
        for i in range(n + 1):
            y = -hw + 2 * hw * i / n
            MBD.box(gx, y, 0.0, 0.14, 0.14, 6.6, bar)
        for z in (0.5, 2.2, 3.9, 5.6):
            MBD.box(gx, 0, z, 0.16, 2 * hw, 0.16, bar)
        # ornament flanking banners on the N gate only (the "main" gate)
        if name == 'N':
            for s in (-1, 1):
                MBD.group = 'Banners'
                MBD.box(r0 - 0.5, s * (hw + 1.9), 3.0, 0.1, 1.8, 5.0, 'banner')
                MBD.box(r0 - 0.56, s * (hw + 1.9), 3.5, 0.04, 0.3, 3.2, 'gold')
                MBD.group = 'Gates'
        MBD.pop()


# ─────────────────────────────────────────────────────────────── props
def column(x, y):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, 0)))
    MBD.box(0, 0, 0, 2.8, 2.8, 0.3, 'marble_dk')
    MBD.box(0, 0, 0.3, 2.3, 2.3, 0.3, 'stone_w')
    MBD.frustum(0, 0, 0.6, 1.15, 0.98, 0.45, 'gold_dk', seg=16)
    MBD.frustum(0, 0, 1.05, 0.92, 0.82, 4.9, 'stone_w', seg=14)       # shaft
    for z in (1.35, 3.1, 5.05):
        MBD.frustum(0, 0, z, 1.0, 1.0, 0.32, 'gold', seg=16)          # gold bands
    for k in range(4):                                               # gold ornament panels
        MBD.push(Matrix.Rotation(k * math.pi / 2, 4, 'Z'))
        MBD.box(0.9, 0, 1.8, 0.14, 0.5, 2.7, 'gold')
        MBD.box(0.88, 0, 2.3, 0.1, 0.8, 0.22, 'gold_dk')
        MBD.pop()
    MBD.frustum(0, 0, 5.95, 0.85, 1.35, 0.55, 'stone_w', seg=14)      # capital
    MBD.box(0, 0, 6.5, 2.8, 2.8, 0.4, 'marble_dk')
    MBD.pop()
    obstacle(x, y, 1.15, 6.9)


def barricade(x, y, rot, length):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z'))
    n = int(length / 1.5)
    w = length / n
    for i in range(n):
        cx = -length / 2 + w * (i + 0.5)
        m = 'gold' if i in (0, n - 1) else ('stone_b' if i % 2 else 'stone_a')
        MBD.box(cx, 0, 0, w - 0.06, 1.0, 0.75, m)
        MBD.box(cx + (0.2 if i % 2 else -0.2), 0, 0.75, w - 0.06, 0.95, 0.7, 'stone_c' if m != 'gold' else 'gold')
    MBD.box(0, 0, 1.45, length, 1.15, 0.14, 'stone_dk')
    MBD.pop()
    # tiled circles along the barricade
    c, s = math.cos(rot), math.sin(rot)
    steps = max(2, int(length / 1.1) + 1)
    for i in range(steps):
        t = -length / 2 + 0.55 + (length - 1.1) * i / (steps - 1)
        obstacle(x + c * t, y + s * t, 0.62, 1.5)


def stone_block(x, y, rot):
    MBD.group = 'Props'
    MBD.box(x, y, 0, 2.3, 2.3, 2.1, 'stone_b', rot=rot)
    MBD.box(x, y, 2.1, 2.4, 2.4, 0.18, 'stone_dk', rot=rot)
    MBD.box(x, y, 0.0, 2.45, 2.45, 0.2, 'stone_dk', rot=rot)
    obstacle(x, y, 1.35, 2.3)


def fallen_column(x, y, rot):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, 0.85)) @ Matrix.Rotation(rot, 4, 'Z'))
    MBD.push(Matrix.Rotation(math.radians(90), 4, 'Y'))   # lay it down along +x
    MBD.frustum(0, 0, -3.2, 0.85, 0.85, 4.6, 'stone_w', seg=14)
    MBD.frustum(0, 0, -0.9, 0.95, 0.95, 0.3, 'gold', seg=14)
    MBD.frustum(0, 0, -3.2, 0.95, 0.95, 0.3, 'gold', seg=14)
    MBD.pop()
    MBD.box(4.2, -0.4, -0.85, 1.4, 1.3, 1.0, 'stone_w', rot=0.4)       # broken drum chunks
    MBD.box(-4.0, 0.6, -0.85, 1.2, 1.1, 0.9, 'stone_w', rot=-0.3)
    MBD.pop()
    c, s = math.cos(rot), math.sin(rot)
    for t in (-3.2, -1.1, 1.0, 3.0):
        obstacle(x + c * t, y + s * t, 0.9, 1.7)


def crate(x, y, z, s, rot):
    MBD.box(x, y, z, s, s, s, 'wood', rot=rot)
    MBD.push(Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z'))
    h = s / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            MBD.box(sx * (h - 0.06), sy * (h - 0.06), -0.01, 0.14, 0.14, s + 0.02, 'wood_dk')
    MBD.box(0, 0, s * 0.45, s + 0.04, s + 0.04, 0.1, 'wood_dk')
    MBD.pop()


def crate_stack(x, y, rot):
    MBD.group = 'Props'
    c, s = math.cos(rot), math.sin(rot)
    for (dx, dy, z, sz, rr) in ((0, 0, 0, 1.4, 0.1), (1.5, 0.2, 0, 1.3, -0.2), (0.1, 1.5, 0, 1.3, 0.3),
                                (0.7, 0.7, 1.4, 1.2, 0.5), (0.2, 0.1, 1.4, 1.2, -0.1), (0.5, 0.5, 2.6, 1.0, 0.2)):
        crate(x + c * dx - s * dy, y + s * dx + c * dy, z, sz, rot + rr)
    obstacle(x + c * 0.7 - s * 0.7, y + s * 0.7 + c * 0.7, 1.9, 3.5)


def rubble(x, y, n=14, spread=1.6):
    MBD.group = 'Props'
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0, spread) ** 1.0
        r = rng.uniform(0.18, 0.55)
        MBD.frustum(x + d * math.cos(a), y + d * math.sin(a), 0, r, r * 0.55, r * 0.9, rng.choice(('stone_a', 'stone_dk', 'stone_c')),
                    seg=rng.choice((5, 6, 7)), rot=rng.uniform(0, 6))


def debris(x, y):
    MBD.group = 'Props'
    for _ in range(rng.randint(2, 4)):
        MBD.frustum(x + rng.uniform(-0.5, 0.5), y + rng.uniform(-0.5, 0.5), 0, rng.uniform(0.08, 0.2), 0.05, rng.uniform(0.06, 0.14),
                    rng.choice(('stone_a', 'stone_dk')), seg=5, rot=rng.uniform(0, 6))


def brazier(x, y, scale=1.0, collide=True, z=0.0):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, z)) @ Matrix.Scale(scale, 4))
    for k in range(3):
        a = k * 2 * math.pi / 3
        MBD.push(Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((0.35, 0, 0)) @ Matrix.Rotation(math.radians(-14), 4, 'Y'))
        MBD.box(0, 0, 0, 0.14, 0.14, 1.15, 'iron')
        MBD.pop()
    MBD.frustum(0, 0, 0.95, 0.5, 0.82, 0.55, 'iron', seg=12)
    MBD.frustum(0, 0, 1.45, 0.86, 0.86, 0.1, 'gold', seg=12)
    MBD.frustum(0, 0, 1.4, 0.7, 0.7, 0.08, 'wood_dk', seg=12)                # coals
    MBD.group = 'Flames'
    for (dx, dy, h, r) in ((0, 0, 2.5, 0.62), (0.3, 0.1, 1.7, 0.42), (-0.25, -0.2, 1.8, 0.44), (0.05, -0.32, 1.4, 0.34), (-0.2, 0.3, 1.5, 0.36)):
        MBD.frustum(dx, dy, 1.45, r, 0.05, h, 'fire', seg=7, rot=rng.uniform(0, 3))
    MBD.frustum(0, 0, 1.45, 0.3, 0.04, 1.6, 'fire_core', seg=6)
    MBD.pop()
    MBD.group = 'Props'
    LIGHTS.append(dict(x=round(x, 2), y=round(z + 1.9 * scale, 2), z=round(-y, 2), big=scale > 0.7))
    if collide:
        obstacle(x, y, 0.8 * scale, 1.5)


def spike_trap(x, y, rot):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z'))
    MBD.box(0, 0, 0, 3.0, 3.0, 0.05, 'stone_dk')
    MBD.box(0, 0, 0.05, 2.5, 2.5, 0.02, 'dark')
    for i in range(5):
        for j in range(5):
            MBD.frustum(-1.0 + i * 0.5, -1.0 + j * 0.5, 0.07, 0.11, 0.015, 0.4, 'iron', seg=4)
    for s in (-1, 1):
        MBD.box(s * 1.38, 0, 0.05, 0.25, 3.0, 0.1, 'stone_a')
        MBD.box(0, s * 1.38, 0.05, 3.0, 0.25, 0.1, 'stone_a')
    MBD.pop()


def pressure_plate(x, y):
    MBD.group = 'Props'
    MBD.box(x, y, 0, 2.6, 2.6, 0.06, 'stone_dk')
    MBD.box(x, y, 0.06, 2.2, 2.2, 0.04, 'stone_b')
    MBD.frustum(x, y, 0.1, 0.75, 0.75, 0.03, 'gold', seg=16)
    MBD.frustum(x, y, 0.1, 0.5, 0.5, 0.05, 'stone_b', seg=16)
    MBD.box(x, y, 0.1, 1.9, 0.12, 0.03, 'gold')
    MBD.box(x, y, 0.1, 0.12, 1.9, 0.03, 'gold')


def lever(x, y, rot):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z'))
    MBD.box(0, 0, 0, 1.8, 1.4, 0.45, 'stone_dk')
    MBD.box(0, 0, 0.45, 1.0, 0.9, 0.5, 'stone_a')
    MBD.push(Matrix.Translation((0, 0, 0.95)) @ Matrix.Rotation(math.radians(-35), 4, 'Y'))
    MBD.box(0, 0, 0, 0.18, 0.18, 2.1, 'wood_dk')
    MBD.frustum(0, 0, 2.1, 0.22, 0.22, 0.25, 'iron', seg=8)
    MBD.pop()
    MBD.box(0.0, 0.0, 0.95, 0.35, 0.35, 0.1, 'gold')
    MBD.pop()
    obstacle(x, y, 0.95, 1.8)


def wagon(x, y, rot):
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z'))
    MBD.box(0, 0, 0.7, 3.6, 1.9, 0.18, 'wood')
    for s in (-1, 1):
        MBD.box(0, s * 0.95, 0.88, 3.6, 0.1, 0.55, 'wood_dk')
    # canvas hood: arched cross-section (width, height) extruded along the wagon's length
    pts = [(-0.95, 0.0), (0.95, 0.0), (0.8, 0.7), (0.45, 1.05), (0.0, 1.15), (-0.45, 1.05), (-0.8, 0.7)]
    MBD.push(Matrix.Translation((0, 0, 0.88)) @ Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    MBD.prism(pts, -1.5, 1.5, 'canvas')
    MBD.pop()
    for sx in (-1, 1):
        for sy in (-1, 1):
            MBD.push(Matrix.Translation((sx * 1.15, sy * 1.1, 0.62)) @ Matrix.Rotation(math.radians(90), 4, 'X'))
            MBD.frustum(0, 0, -0.07, 0.62, 0.62, 0.14, 'wood_dk', seg=14)
            MBD.frustum(0, 0, -0.1, 0.2, 0.2, 0.2, 'gold_dk', seg=8)
            for k in range(4):
                MBD.push(Matrix.Rotation(k * math.pi / 4, 4, 'Z'))
                MBD.box(0, 0, -0.1, 1.2, 0.09, 0.2, 'wood')
                MBD.pop()
            MBD.pop()
    MBD.box(2.9, 0, 0.5, 2.6, 0.12, 0.12, 'wood_dk')   # tongue
    MBD.pop()
    c, s = math.cos(rot), math.sin(rot)
    for t in (-1.0, 1.0):
        obstacle(x + c * t, y + s * t, 1.25, 2.0)


def banner_pole(x, y):
    MBD.group = 'Props'
    MBD.frustum(x, y, 0, 0.3, 0.3, 0.3, 'stone_dk', seg=8)
    MBD.box(x, y, 0.3, 0.14, 0.14, 5.4, 'wood_dk')
    MBD.group = 'Banners'
    MBD.box(x, y, 2.0, 1.4, 0.08, 3.2, 'banner')
    MBD.box(x, y - 0.02, 2.6, 0.22, 0.04, 2.0, 'gold')
    MBD.box(x, y - 0.02, 3.9, 0.9, 0.04, 0.22, 'gold')
    MBD.box(x, y, 5.2, 1.6, 0.1, 0.1, 'wood_dk')
    MBD.group = 'Props'
    MBD.frustum(x, y, 5.7, 0.2, 0.02, 0.5, 'gold', seg=6)
    obstacle(x, y, 0.4, 5.5)


def sand_pit(x, y, r):
    MBD.group = 'Floor_Paving'
    MBD.frustum(x, y, 0.0, r, r, 0.012, 'sand_dk', seg=18)
    MBD.frustum(x, y, 0.012, r * 0.6, r * 0.6, 0.012, 'sand_dk', seg=14)


def wall_torch(angle):
    r = FLOOR_R + 0.4
    x, y = r * math.cos(angle), r * math.sin(angle)
    MBD.group = 'Props'
    MBD.push(Matrix.Translation((x, y, PARAPET_H + 0.16)))
    MBD.frustum(0, 0, 0, 0.32, 0.26, 0.9, 'stone_dk', seg=8)
    MBD.frustum(0, 0, 0.9, 0.4, 0.4, 0.22, 'iron', seg=8)
    MBD.pop()
    MBD.group = 'Flames'
    MBD.frustum(x, y, PARAPET_H + 0.16 + 1.1, 0.34, 0.04, 1.2, 'fire', seg=7, rot=rng.uniform(0, 3))
    MBD.frustum(x, y, PARAPET_H + 0.16 + 1.1, 0.18, 0.03, 0.8, 'fire_core', seg=6)
    LIGHTS.append(dict(x=round(x, 2), y=round(PARAPET_H + 0.16 + 1.6, 2), z=round(-y, 2), big=False))


def build_props():
    # 4 columns (4-fold symmetric) around the dais
    for sx in (-1, 1):
        for sy in (-1, 1):
            column(9.0 * sx, 11.0 * sy)
    # barricades: E/W flank the dais, N/S across the lanes
    for sx in (-1, 1):
        barricade(15.5 * sx, 0, math.pi / 2, 7.0)
    for sy in (-1, 1):
        barricade(0, 19.5 * sy, 0.0, 6.0)
    # 180° rotationally-symmetric cover
    for s in (1, -1):
        stone_block(17 * s, 15 * s, 0.25 * s)
        crate_stack(-19.5 * s, 10 * s, 0.3 * s)
        fallen_column(-12 * s, 21.5 * s, 0.45 * s)
        lever(-21 * s, -10 * s, 0.4 * s)
        wagon(-3.6 * s, -15 * s, math.pi / 2)
        brazier(-23 * s, 3.2 * s, 1.15)
        rubble(-18 * s, -4.5 * s)
        spike_trap(17 * s, 19 * s, 0.0)
        pressure_plate(-13 * s, -19.5 * s)
        sand_pit(10.5 * s, 4.8 * s, 2.0)
        sand_pit(-6 * s, 14 * s, 2.4)
    for sy in (-1, 1):
        banner_pole(0, 26.3 * sy)
    for k in range(4):
        wall_torch(math.radians(45 + 90 * k))
    for _ in range(46):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(4, FLOOR_R - 2)
        debris(r * math.cos(a), r * math.sin(a))


# ─────────────────────────────────────────────────────────────── commit + export
def commit():
    for gname, g in MBD.g.items():
        me = bpy.data.meshes.new(gname)
        me.from_pydata(g['v'], [], g['f'])
        for mname in g['mats']:
            me.materials.append(get_mat(mname))
        for p, mi in zip(me.polygons, g['fm']):
            p.material_index = mi
        uvl = me.uv_layers.new(name='UVMap')
        for p, uvs in zip(me.polygons, g['uv']):
            for li, uv in zip(p.loop_indices, uvs):
                uvl.data[li].uv = uv
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(gname, me)
        bpy.context.scene.collection.objects.link(ob)


def pick_spawns():
    """8 spawn points around the ring (4 per half so ranked teams start on opposite sides),
    each the best-clearance candidate within +-12 deg / r 19..26 of its target slot. Requires
    >= 3.2 m clearance from every cover circle so the +-1.5 m spawn jitter can never land inside."""
    out = []
    for k in range(8):
        target = 22.5 + 45 * k
        best = None
        for da in range(-12, 13, 2):
            for r in (19, 20, 21, 22, 23, 24, 25, 26):
                a = math.radians(target + da)
                x, z = round(r * math.cos(a), 2), round(-r * math.sin(a), 2)
                clear = min(math.hypot(x - o['x'], z - o['z']) - o['radius'] for o in OBSTACLES)
                score = min(clear, 6.0) - 0.02 * abs(da)
                if best is None or score > best[0]:
                    best = (score, x, z, clear)
        assert best[3] >= 3.2, f'no clear spawn near {target} deg (best clearance {best[3]:.2f})'
        out.append((best[1], best[2]))
    return out


def write_ts():
    obs = ',\n'.join(f"  {{ x: {o['x']}, z: {o['z']}, radius: {o['radius']}, height: {o['height']} }}" for o in OBSTACLES)
    lights = ',\n'.join(f"  {{ x: {l['x']}, y: {l['y']}, z: {l['z']}, big: {str(l['big']).lower()} }}" for l in LIGHTS)
    spawns = [f"  {{ x: {x}, z: {z} }}" for x, z in pick_spawns()]
    src = f"""// GENERATED by tools/colosseum/gen.py — do not edit by hand.
// Re-run the generator (see tools/colosseum/README.md) to change the arena.

/** Colosseum FFA arena: radius of the sand floor (the parapet starts here). */
export const COLOSSEUM_FLOOR_RADIUS = {FLOOR_R};

/** Max distance from the centre a player's *centre* may reach (floor radius minus margin). */
export const COLOSSEUM_PLAYER_RADIUS = {PLAYER_CLAMP};

/** Solid cover — each circle matches a visible prop in colosseum.glb. */
export const COLOSSEUM_OBSTACLES: readonly {{ x: number; z: number; radius: number; height: number }}[] = [
{obs},
];

/** Free-for-all spawn ring (clear of every obstacle). */
export const COLOSSEUM_SPAWN_POINTS: readonly {{ x: number; z: number }}[] = [
{',\n'.join(spawns)},
];

/** Flame anchors (braziers + wall torches) for client point lights / flicker. */
export const COLOSSEUM_FLAMES: readonly {{ x: number; y: number; z: number; big: boolean }}[] = [
{lights},
];
"""
    os.makedirs(os.path.dirname(TS_OUT), exist_ok=True)
    open(TS_OUT, 'w').write(src)


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    ensure_textures()
    build_floor()
    build_paths()
    build_dais()
    build_shell()
    build_gates()
    build_props()
    commit()
    write_ts()

    os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=GLB_OUT, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    print('COLOSSEUM objects', len(bpy.data.objects), 'polys', tris, 'obstacles', len(OBSTACLES), 'flames', len(LIGHTS))

    if PNG_OUT:
        preview(PNG_OUT)


def preview(path):
    sc = bpy.context.scene
    ids = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in ids else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    w = bpy.data.worlds.new('W')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.62, 0.45, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sc.world = w
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 4.5
    sun.data.color = (1.0, 0.86, 0.65)
    sun.rotation_euler = (math.radians(48), math.radians(8), math.radians(-35))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.location = (14, -30, 30)
    cam.rotation_euler = (Vector((-14, 30, -30)).to_track_quat('-Z', 'Y')).to_euler()
    cam.data.lens = 30
    sc.collection.objects.link(cam)
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


main()
