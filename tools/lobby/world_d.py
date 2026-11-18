"""
Lobby world — part D: vegetation + rocks.

Trees/bushes/rocks are a small set of PROTOTYPES (several variants per species so no two
neighbours match) instanced across the scene — instances share mesh data, so the GLB stays small.
Foliage is painted with vertex colours: dark underside -> lit crown, so each tree has built-in
volume lighting before the engine's own lights even touch it.
Grass + flowers are merged into a few chunk meshes (thousands of clumps, a handful of draw calls).
"""
import math
import random
from mathutils import Vector, Matrix, noise

PROTO = {}
NATURE_COLL = 'Nature'


def paint(b, verts, base, lo=0.55, hi=1.25, centre=None, r=1.0, jitter=0.0, rnd=None):
    """Vertex-colour a blob: darker toward its underside / centre, lighter at the sun-facing top."""
    base = lin(base)
    ctr = centre or (sum(v.co.x for v in verts) / len(verts), sum(v.co.y for v in verts) / len(verts), sum(v.co.z for v in verts) / len(verts))
    for v in verts:
        t = ((v.co.z - ctr[2]) / r) * 0.5 + 0.5
        k = lo + (hi - lo) * max(0.0, min(1.0, t))
        if jitter and rnd:
            k *= 1 + rnd.uniform(-jitter, jitter)
        v[b.col] = (min(1, base[0] * k), min(1, base[1] * k), min(1, base[2] * k), 1)


def blob(b, c, r, base, rnd, sub=1, squash=(1, 1, 0.82), mat='foliage', lo=0.5, hi=1.3):
    b.smooth = True
    vs = b.ico(c, r, mat, sub, squash)
    b.smooth = False
    # roughen so blobs are lumpy leaf masses rather than perfect spheres
    for v in vs:
        d = (v.co - Vector(c))
        v.co = Vector(c) + d * (1 + rnd.uniform(-0.12, 0.12))
    paint(b, vs, base, lo, hi, c, r * squash[2], jitter=0.07, rnd=rnd)
    return vs


def trunk(b, h, r, rnd, lean=0.0, bark=(1, 1, 1)):
    b.tint = bark
    # root flare + tapered trunk in 3 segments with slight bend
    b.cyl((0, 0, 0.25), r * 1.8, r * 1.15, 0.5, 'bark', 7)
    x = y = 0.0
    z = 0.4
    seg = 3
    for i in range(seg):
        dz = h / seg
        nx, ny = x + rnd.uniform(-0.1, 0.1) + lean * 0.3, y + rnd.uniform(-0.1, 0.1)
        b.beam((x, y, z), (nx, ny, z + dz), r * 2 * (1 - 0.25 * i / seg) , r * 2 * (1 - 0.25 * i / seg), 'bark')
        x, y, z = nx, ny, z + dz
    return x, y, z


def make_pine(name, seed, base=(0.10, 0.28, 0.17), h=9.0):
    rnd = random.Random(seed)
    b = B(name, NATURE_COLL)
    trunk(b, h * 0.45, 0.2, rnd)
    layers = 7
    for i in range(layers):
        t = i / (layers - 1)
        z = 1.8 + t * (h - 2.6)
        rad = (2.2 - 1.75 * t) * (0.9 + 0.2 * rnd.random())
        hh = 2.4 - 0.7 * t
        vs = b.cyl((rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), z), rad, 0.0, hh, 'foliage', 9, cap=True)
        # ragged skirt
        for v in vs:
            if v.co.z < z:
                a = math.atan2(v.co.y, v.co.x)
                v.co.x *= 1 + 0.18 * math.sin(a * 5 + i)
                v.co.y *= 1 + 0.18 * math.sin(a * 5 + i)
        paint(b, vs, base, 0.4, 1.35, (0, 0, z), hh * 0.6, jitter=0.1, rnd=rnd)
    vs = b.cyl((0, 0, h + 0.6), 0.28, 0.0, 1.8, 'foliage', 7)
    paint(b, vs, base, 0.9, 1.5, (0, 0, h + 0.6), 0.9)
    return b.build()


def make_oak(name, seed, base, h=4.2, spread=2.3, blobs=7):
    rnd = random.Random(seed)
    b = B(name, NATURE_COLL)
    top = trunk(b, h, 0.3, rnd)
    b.tint = (1, 1, 1)
    # a few visible limbs
    for i in range(4):
        a = i * math.tau / 4 + rnd.random()
        b.beam((top[0], top[1], top[2] - 0.8), (top[0] + math.cos(a) * 1.6, top[1] + math.sin(a) * 1.6, top[2] + 0.6), 0.2, 0.2, 'bark')
    for i in range(blobs):
        a = i * math.tau / blobs + rnd.random() * 0.8
        rr = spread * (0.35 + 0.5 * rnd.random())
        c = (top[0] + math.cos(a) * rr, top[1] + math.sin(a) * rr, top[2] + 0.9 + rnd.uniform(-0.3, 1.5))
        blob(b, c, rnd.uniform(0.85, 1.25), base, rnd)
    blob(b, (top[0], top[1], top[2] + 1.7), 1.35, base, rnd, hi=1.3)
    return b.build()


def make_birch(name, seed, base=(0.38, 0.55, 0.16), h=6.5):
    rnd = random.Random(seed)
    b = B(name, NATURE_COLL)
    b.tint = (0.92, 0.9, 0.86)
    x = y = 0
    z = 0.0
    for i in range(3):
        nx, ny = x + rnd.uniform(-0.15, 0.15), y + rnd.uniform(-0.15, 0.15)
        b.beam((x, y, z), (nx, ny, z + h / 3), 0.22 - i * 0.04, 0.22 - i * 0.04, 'vcol')
        x, y, z = nx, ny, z + h / 3
    for k in range(6):
        b.tint = (0.1, 0.1, 0.1)
        b.box((rnd.uniform(-0.1, 0.1), -0.1, rnd.uniform(0.5, h - 0.5)), (0.2, 0.04, 0.07), 'vcol')
    for i in range(6):
        a = i * math.tau / 6 + rnd.random()
        blob(b, (x + math.cos(a) * 0.7, y + math.sin(a) * 0.7, z - 0.8 + rnd.uniform(0, 1.8)), rnd.uniform(0.6, 0.95), base, rnd, squash=(0.9, 0.9, 1.15))
    return b.build()


def make_bush(name, seed, base, flowers=None):
    rnd = random.Random(seed)
    b = B(name, NATURE_COLL)
    for (x, y, r) in ((0, 0, 0.75), (0.65, 0.25, 0.55), (-0.6, 0.15, 0.58), (0.1, -0.55, 0.5)):
        blob(b, (x, y, r * 0.55), r, base, rnd, squash=(1.1, 1.0, 0.7))
    if flowers:
        for i in range(10):
            a = rnd.random() * math.tau
            rr = rnd.uniform(0.3, 1.0)
            b.tint = rnd.choice(flowers)
            b.sph((math.cos(a) * rr, math.sin(a) * rr, rnd.uniform(0.5, 0.95)), 0.08, 0.08, 0.08, 'vcol', 6, 4)
    return b.build()


def make_rock(name, seed, size=1.0, moss=True):
    rnd = random.Random(seed)
    b = B(name, NATURE_COLL)
    n = 2
    for i in range(n):
        vs = b.ico((rnd.uniform(-0.5, 0.5) * i, rnd.uniform(-0.4, 0.4) * i, 0.3 * size), size * (1 - 0.3 * i), 'rock', 2,
                   (1.25, 1.0, 0.7))
        for v in vs:
            d = v.co
            n_ = noise.noise(Vector((d.x * 1.7 + seed, d.y * 1.7, d.z * 1.7)))
            v.co = Vector((d.x * (1 + 0.28 * n_), d.y * (1 + 0.28 * n_), d.z * (1 + 0.28 * n_)))
            # tint: mossy / sunlit top, dark crevices
            up = max(0.0, v.co.z / (0.9 * size))
            k = 0.7 + 0.35 * up
            col = (k, k, k * 1.05)
            if moss and up > 0.5:
                col = (k * 0.75, k * 1.0, k * 0.65)
            v[b.col] = (*col, 1)
    # rock material is textured; the vertex colours multiply it
    return b.build()


def build_prototypes():
    P = PROTO
    P['pine1'] = make_pine('P_pine1', 1, (0.12, 0.30, 0.18), 9.0)
    P['pine2'] = make_pine('P_pine2', 2, (0.09, 0.26, 0.20), 11.0)
    P['pine3'] = make_pine('P_pine3', 3, (0.16, 0.34, 0.16), 7.5)
    P['oak1'] = make_oak('P_oak1', 4, (0.20, 0.42, 0.12))
    P['oak2'] = make_oak('P_oak2', 5, (0.28, 0.44, 0.12), h=4.8, spread=2.6, blobs=8)
    P['oak3'] = make_oak('P_oak3', 6, (0.16, 0.36, 0.15), h=3.8, spread=2.0, blobs=6)
    P['autumn'] = make_oak('P_autumn', 7, (0.78, 0.38, 0.08))
    P['autumn2'] = make_oak('P_autumn2', 8, (0.70, 0.52, 0.10), h=4.6)
    P['blossom1'] = make_oak('P_blossom1', 9, (0.95, 0.52, 0.66), h=3.6, spread=2.2)
    P['blossom2'] = make_oak('P_blossom2', 10, (0.98, 0.70, 0.78), h=4.0, spread=2.3)
    P['birch1'] = make_birch('P_birch1', 11)
    P['birch2'] = make_birch('P_birch2', 12, (0.55, 0.62, 0.2), 7.5)
    P['bush1'] = make_bush('P_bush1', 13, (0.16, 0.36, 0.12))
    P['bush2'] = make_bush('P_bush2', 14, (0.12, 0.30, 0.16), [(0.95, 0.3, 0.35), (0.98, 0.85, 0.3)])
    P['bush3'] = make_bush('P_bush3', 15, (0.22, 0.4, 0.14), [(0.7, 0.45, 0.9), (0.95, 0.95, 0.9)])
    P['rock1'] = make_rock('P_rock1', 1, 1.0)
    P['rock2'] = make_rock('P_rock2', 2, 1.4)
    P['rock3'] = make_rock('P_rock3', 3, 0.8, moss=False)
    for o in P.values():
        o.hide_render = True
        o.hide_viewport = True


def instance(key, gx, gz, s, rot, sink=0.0):
    p = PROTO[key]
    o = bpy.data.objects.new(key, p.data)
    o.location = (gx, -gz, -sink)
    o.scale = (s, s, s * random.uniform(0.92, 1.12))
    o.rotation_euler[2] = rot
    collection(NATURE_COLL).objects.link(o)
    return o


def in_exclusion(gx, gz, pad=0.0):
    """True if (gx,gz) is in a spot trees/bushes must leave clear."""
    x, y = gx, -gz
    if math.hypot(gx - PLAZA[0], gz - PLAZA[1]) < PLAZA_R + 3.0:
        return True
    if abs(gx) < 5.5 and gz > 9:                 # spawn street (south)
        return True
    if abs(gx) < 5.0 and -29 < gz < -10:         # castle approach
        return True
    if abs(gz - PLAZA[1]) < 3.4 and abs(gx) > 12:   # east/west streets
        return True
    if -52 < gz < -26 and abs(gx) < 21:          # castle footprint
        return True
    if math.hypot(gx - 0, gz + 14) < 6.5 or math.hypot(gx - 8, gz + 14) < 6.5:   # portal gates
        return True
    for f in LAYOUT['footprints']:
        rad = max(f['W'], f['D']) * 0.5 + 2.6 + pad
        if math.hypot(x - f['x'], y - f['y']) < rad:
            return True
    for c in LAYOUT['colliders']:
        if math.hypot(gx - c['x'], gz - c['z']) < c['r'] + 1.8 + pad:
            return True
    return False


def scatter_nature(seed=3):
    rnd = random.Random(seed)
    random.seed(seed)
    placed = []                                   # (gx, gz, r) spacing control
    def free(gx, gz, r):
        return all(math.hypot(gx - px, gz - pz) > (r + pr) * 0.9 for px, pz, pr in placed)
    kinds = [('pine1', .13), ('pine2', .1), ('pine3', .08), ('oak1', .13), ('oak2', .09), ('oak3', .1), ('autumn', .04), ('autumn2', .04),
             ('blossom1', .06), ('blossom2', .05), ('birch1', .08), ('birch2', .06)]
    keys, w = zip(*kinds)
    count = 0
    tries = 0
    while count < 300 and tries < 40000:
        tries += 1
        r = 46 + 62 * rnd.random() ** 1.6 if rnd.random() < 0.8 else rnd.uniform(15, 48)
        a = rnd.uniform(0, math.tau)
        gx, gz = math.cos(a) * r * 1.0, math.sin(a) * r * 1.0
        # fill the square: stretch toward corners
        gx = max(-90, min(90, gx * 1.15)); gz = max(-90, min(90, gz * 1.15))
        if abs(gx) < 50 and abs(gz) < 50 and rnd.random() < 0.0:
            continue
        if in_exclusion(gx, gz):
            continue
        if math.hypot(gx - 100, -gz - 78) < 34:        # lake
            continue
        k = rnd.choices(keys, w)[0]
        if k.startswith('pine') and abs(gx) < 30 and abs(gz) < 30 and rnd.random() < 0.7:
            k = rnd.choice(('oak1', 'oak2', 'oak3', 'blossom1', 'birch1'))
        s = rnd.uniform(0.85, 1.35)
        rad = 2.2 * s
        if not free(gx, gz, rad):
            continue
        placed.append((gx, gz, rad))
        instance(k, gx, gz, s, rnd.uniform(0, 6.28))
        if abs(gx) < 47 and abs(gz) < 47:
            add_col(gx, gz, 0.35 * s + 0.12, k)
        count += 1
    # bushes + rocks
    nb = 0
    tries = 0
    while nb < 150 and tries < 8000:
        tries += 1
        gx, gz = rnd.uniform(-60, 60), rnd.uniform(-60, 60)
        if in_exclusion(gx, gz, 0.5):
            continue
        if not free(gx, gz, 0.9):
            continue
        placed.append((gx, gz, 0.9))
        instance(rnd.choice(('bush1', 'bush2', 'bush3')), gx, gz, rnd.uniform(0.8, 1.5), rnd.uniform(0, 6.28))
        nb += 1
    nr = 0
    tries = 0
    while nr < 90 and tries < 6000:
        tries += 1
        gx, gz = rnd.uniform(-75, 75), rnd.uniform(-75, 75)
        if in_exclusion(gx, gz, 0.5) or not free(gx, gz, 1.3):
            continue
        s = rnd.uniform(0.7, 2.6)
        placed.append((gx, gz, 1.0 * s))
        instance(rnd.choice(('rock1', 'rock2', 'rock3')), gx, gz, s, rnd.uniform(0, 6.28), sink=0.15 * s)
        if abs(gx) < 47 and abs(gz) < 47:
            add_col(gx, gz, 0.95 * s * 0.9, 'rock')
        nr += 1
    return count, nb, nr


def scatter_grass(seed=9, per_chunk=1200, chunks=(2, 2)):
    """Merged grass clumps + flowers, avoiding paved ground / footprints."""
    rnd = random.Random(seed)
    cw = 100.0 / chunks[0]
    made = 0
    for ci in range(chunks[0]):
        for cj in range(chunks[1]):
            g = B(f'Grass_{ci}{cj}', 'Ground')
            f = B(f'Flowers_{ci}{cj}', 'Ground')
            n = 0
            tries = 0
            while n < per_chunk and tries < per_chunk * 6:
                tries += 1
                gx = -50 + (ci + rnd.random()) * cw
                gz = -50 + (cj + rnd.random()) * cw
                if math.hypot(gx - PLAZA[0], gz - PLAZA[1]) < PLAZA_R + 0.8:
                    continue
                if abs(gx) < 3.9 and gz > 9.5 or abs(gx) < 4.3 and -28 < gz < -10:
                    continue
                if abs(gz - PLAZA[1]) < 2.2 and abs(gx) > 12:
                    continue
                if -34.5 < gz < -25.5 and abs(gx) < 20:
                    continue
                skip = False
                for fp in LAYOUT['footprints']:
                    if abs(gx - fp['x']) < fp['W'] * 0.6 + 0.9 and abs(-gz - fp['y']) < fp['D'] * 0.6 + 0.9 and fp['tag'] not in ():
                        skip = True
                        break
                if skip or -52 < gz < -27 and abs(gx) < 19:
                    continue
                x, y = gx, -gz
                h = rnd.uniform(0.28, 0.6)
                base = lin((0.16 + rnd.random() * 0.1, 0.34 + rnd.random() * 0.14, 0.10 + rnd.random() * 0.06))
                tip = tuple(min(1, c * 2.6) for c in base)
                for k in range(4):
                    a = rnd.random() * math.tau
                    lean = rnd.uniform(0.05, 0.28)
                    bw = rnd.uniform(0.035, 0.06)
                    x0, y0 = x + rnd.uniform(-0.12, 0.12), y + rnd.uniform(-0.12, 0.12)
                    v0 = g.bm.verts.new((x0 + math.cos(a + 1.57) * bw, y0 + math.sin(a + 1.57) * bw, 0.0))
                    v1 = g.bm.verts.new((x0 - math.cos(a + 1.57) * bw, y0 - math.sin(a + 1.57) * bw, 0.0))
                    v2 = g.bm.verts.new((x0 + math.cos(a) * lean, y0 + math.sin(a) * lean, h * rnd.uniform(0.8, 1.2)))
                    g.bm.faces.new((v0, v1, v2))
                    v0[g.col] = (*base, 1); v1[g.col] = (*base, 1); v2[g.col] = (*tip, 1)
                    g._fin([v0, v1, v2], 'vcol')
                    v0[g.col] = (*base, 1); v1[g.col] = (*base, 1); v2[g.col] = (*tip, 1)
                if rnd.random() < 0.07:                  # a flower with a stem + head
                    col = rnd.choice(FLOWERS + [(0.95, 0.95, 0.95)])
                    f.tint = (0.25, 0.5, 0.2)
                    f.beam((x, y, 0.0), (x, y, 0.38), 0.015, 0.015, 'vcol')
                    f.tint = col
                    f.sph((x, y, 0.4), 0.065, 0.065, 0.045, 'vcol', 5, 3)
                n += 1
            g.build()
            f.build()
            made += n
    return made
