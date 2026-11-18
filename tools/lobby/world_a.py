"""
Lobby world — part A: layout registry, terrain, ground, plaza, roads, fountain, portal gates.
(exec'd into the shared namespace after common.py + buildings.py)

GAME coords (gx, gz) are what the game uses; Blender coords are (X=gx, Y=-gz). Helper `gb()` converts.
Fixed gameplay objects the model must leave room for (all in game coords):
    spawn (0,12) | fountain (0,-2) | leaderboard tablet (7,-3) | podium (11,-4) | duel altar (-7,-3)
    breach rift (-11.5,-3.5) | arena portal (0,-14) r2.5 | zombie portal (8,-14) r2.2 | castle front wall z=-27
"""
import math
import random
from mathutils import Vector, Matrix, noise

LAYOUT = {'colliders': [], 'lamps': [], 'lights': [], 'smoke': [], 'halos': [], 'footprints': []}
PLAZA = (0.0, -2.0)          # game coords of the plaza / fountain centre
PLAZA_R = 13.0


def gb(gx, gz):
    return (gx, -gz)


def add_col(gx, gz, r, tag=''):
    LAYOUT['colliders'].append({'x': round(gx, 2), 'z': round(gz, 2), 'r': round(r, 2), 'n': tag})


def box_circles(cx, cy, W, D, rot, shrink=0.92, tag=''):
    """Blender-space footprint (centre cx,cy; local W along x, D along y; rotated by rot) -> game collider circles."""
    long_, short = max(W, D), min(W, D)
    r = short / 2 * shrink
    n = max(1, int(math.ceil((long_ - 2 * r) / (r * 1.2))) + 1)
    for i in range(n):
        t = 0 if n == 1 else -(long_ / 2 - r) + i * (long_ - 2 * r) / (n - 1)
        lx, ly = (t, 0) if W >= D else (0, t)
        x = cx + lx * math.cos(rot) - ly * math.sin(rot)
        y = cy + lx * math.sin(rot) + ly * math.cos(rot)
        add_col(x, -y, r, tag)
    LAYOUT['footprints'].append({'x': cx, 'y': cy, 'W': W, 'D': D, 'rot': rot, 'tag': tag})


def face_rot(px, py, tx, ty):
    """Rotation (about Z) that makes a building's local -Y (its front) point from (px,py) toward (tx,ty)."""
    return math.atan2(tx - px, -(ty - py))


# ---------------------------------------------------------------------------- terrain
def terrain_h(x, y):
    d = max(abs(x), abs(y))
    ridge = abs(noise.fractal(Vector((x * 0.0065, y * 0.0065, 1)), 1, 2, 6))
    base = noise.fractal(Vector((x * 0.014, y * 0.014, 5)), 1, 2, 5)
    hill = sm(52, 105, d) * (8 + 14 * ridge + 5 * base)
    mount = sm(105, 215, d) * (45 + 105 * ridge ** 0.8)
    lake = -3.2 * (1 - sm(0, 30, math.hypot(x - 100, y - 78)))
    inside = -0.1 * (1 - sm(50, 53, d))
    return hill + mount + lake + inside


def build_terrain():
    b = B('Terrain', 'Terrain')
    N, S = 150, 460.0
    r = bmesh.ops.create_grid(b.bm, x_segments=N, y_segments=N, size=S / 2)
    vs = r['verts']
    for v in vs:
        v.co.z = terrain_h(v.co.x, v.co.y)
    b._fin(vs, 'vcol')
    for v in vs:
        x, y, z = v.co
        n = noise.fractal(Vector((x * 0.05, y * 0.05, 2)), 1, 2, 3) * 0.5 + 0.5
        n2 = noise.fractal(Vector((x * 0.4, y * 0.4, 7)), 1, 2, 2) * 0.5 + 0.5
        grass = (0.22 + 0.08 * n, 0.32 + 0.08 * n + 0.03 * n2, 0.10 + 0.04 * n)
        dry = (0.42, 0.36, 0.18); rock = (0.34, 0.32, 0.31); snow = (0.95, 0.96, 1.0)
        c = grass
        t = sm(4, 20, z); c = tuple(c[i] * (1 - t) + dry[i] * t for i in range(3))
        t = sm(17, 45, z + 3 * (n2 - .5)); c = tuple(c[i] * (1 - t) + rock[i] * t for i in range(3))
        t = sm(62, 95, z + 6 * (n - 0.5)); c = tuple(c[i] * (1 - t) + snow[i] * t for i in range(3))
        v[b.col] = (*lin(c), 1)
    b.build(smooth=True)
    # lake
    lb = B('Lake', 'Terrain')
    r = bmesh.ops.create_grid(lb.bm, x_segments=1, y_segments=1, size=45)
    for v in r['verts']:
        v.co = Vector((v.co.x + 100, v.co.y + 78, -1.6))
    lb._fin(r['verts'], 'water')
    lb.build()


# ---------------------------------------------------------------------------- ground
def build_ground():
    b = B('Ground', 'Ground')
    r = bmesh.ops.create_grid(b.bm, x_segments=72, y_segments=72, size=53)
    vs = r['verts']
    b._fin(vs, 'grass')
    for v in vs:
        v.co.z = 0.0
        n = noise.fractal(Vector((v.co.x * 0.09, v.co.y * 0.09, 3)), 1, 2, 3) * 0.5 + 0.5
        n2 = noise.fractal(Vector((v.co.x * 0.6, v.co.y * 0.6, 4)), 1, 2, 2) * 0.5 + 0.5
        t = 0.82 + 0.34 * n
        v[b.col] = (t * (0.97 + 0.06 * n2), t, t * (0.88 + 0.1 * n), 1.0)
    b.build(smooth=True)


# ---------------------------------------------------------------------------- plaza
def annulus(b, r0, r1, z, mat, seg=96, rings=3, tint=(1, 1, 1)):
    b.tint = tint
    rows = []
    for i in range(rings + 1):
        r = r0 + (r1 - r0) * i / rings
        rows.append([b.bm.verts.new((math.cos(2 * math.pi * k / seg) * r, math.sin(2 * math.pi * k / seg) * r, z)) for k in range(seg)])
    for i in range(rings):
        for k in range(seg):
            k1 = (k + 1) % seg
            b.bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k1], rows[i][k1]))
    b._fin([v for row in rows for v in row], mat)


def strip(b, p0, p1, width, z, mat, seg_len=None, seg_w=3, jitter=0.1, tint=(1, 1, 1), rnd=None):
    """Subdivided ribbon between two Blender-space points (ragged edges)."""
    rnd = rnd or random.Random(1)
    b.tint = tint
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    ln = d.length
    dn = d.normalized()
    nrm = Vector((-dn.y, dn.x, 0))
    seg_len = seg_len or max(1, int(ln / 1.5))
    grid = []
    for i in range(seg_len + 1):
        row = []
        for j in range(seg_w + 1):
            u = j / seg_w - 0.5
            off = u * width + (rnd.uniform(-jitter, jitter) if j in (0, seg_w) else 0)
            p = p0 + dn * (ln * i / seg_len) + nrm * off
            row.append(b.bm.verts.new((p.x, p.y, z)))
        grid.append(row)
    for i in range(seg_len):
        for j in range(seg_w):
            b.bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    b._fin([v for row in grid for v in row], mat)


def build_plaza():
    b = B('Plaza', 'Plaza')
    # three concentric paving courses, each a different stone + height so the plaza reads as crafted
    annulus(b, 9.6, 13.0, 0.05, 'cobble2', rings=4)
    annulus(b, 6.2, 9.6, 0.08, 'cobble', rings=4)
    annulus(b, 4.4, 6.2, 0.11, 'cobble2', rings=3)
    # raised kerb ring
    annulus(b, 13.0, 13.45, 0.2, 'rubble', rings=1)
    b.tint = (1, 1, 1)
    b.cyl((0, 0, 0.1), 13.45, 13.45, 0.2, 'rubble', 96, cap=False)
    b.cyl((0, 0, 0.1), 13.0, 13.0, 0.2, 'rubble', 96, cap=False)
    # gold inlay rings
    for r_, z in ((9.6, 0.095), (6.2, 0.125), (13.0, 0.215)):
        annulus(b, r_ - 0.07, r_ + 0.07, z, 'gold', rings=1)
    # 8 radial spokes (dark ashlar) across the outer course, + diamond rosette
    for k in range(8):
        a = k * math.pi / 4
        c, s = math.cos(a), math.sin(a)
        b.tint = (1, 1, 1)
        b.beam((c * 9.7, s * 9.7, 0.075), (c * 12.9, s * 12.9, 0.075), 0.55, 0.02, 'ashlar_dark')
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        c, s = math.cos(a), math.sin(a)
        b.beam((c * 6.3, s * 6.3, 0.105), (c * 9.5, s * 9.5, 0.105), 0.3, 0.02, 'ashlar_dark')
    b.build(loc=(PLAZA[0], -PLAZA[1], 0))
    add_col(PLAZA[0], PLAZA[1], 5.0, 'fountain')


def build_roads():
    rnd = random.Random(5)
    b = B('Roads', 'Plaza')
    cy = -PLAZA[1]    # blender y of plaza centre (=+2)
    # south street (toward spawn), castle road (north), east & west streets
    strip(b, (0, -11.0), (0, -48.0), 6.4, 0.035, 'cobble2', rnd=rnd)
    strip(b, (0, 15.0), (0, 27.5), 7.0, 0.035, 'cobble2', rnd=rnd)
    strip(b, (13.0, cy), (47.0, cy), 3.6, 0.035, 'cobble2', rnd=rnd)
    strip(b, (-13.0, cy), (-47.0, cy), 3.6, 0.035, 'cobble2', rnd=rnd)
    b.build()
    # kerbs: a run of small stone blocks along both sides of the long streets
    k = B('Kerbs', 'Plaza')
    k.tint = (1, 1, 1)
    def kerb_line(x0, y0, x1, y1, off, z=0.09):
        p0, p1 = Vector((x0, y0, 0)), Vector((x1, y1, 0))
        d = p1 - p0
        ln = d.length
        dn = d.normalized()
        nr = Vector((-dn.y, dn.x, 0))
        n = int(ln / 1.1)
        for i in range(n):
            c = p0 + dn * (i + 0.5) * ln / n + nr * off
            ang = math.atan2(dn.y, dn.x)
            k.box((c.x, c.y, z), (ln / n * 0.94, 0.34, 0.18 + 0.03 * math.sin(i * 1.7)), 'rubble', rz=ang)
    for s in (-1, 1):
        kerb_line(s * 3.35, -11.5, s * 3.35, -48, 0)
        kerb_line(s * 3.65, 15.5, s * 3.65, 27.5, 0)
        kerb_line(13.5, cy + s * 1.9, 47, cy + s * 1.9, 0)
        kerb_line(-13.5, cy + s * 1.9, -47, cy + s * 1.9, 0)
    k.build()


# ---------------------------------------------------------------------------- fountain
def crystal(b, x, y, z, h, w, tilt=0.0, rot=0.0, mat='crystal'):
    pts_top = Vector((0, 0, h))
    ring = [Vector((math.cos(i * math.pi / 3) * w, math.sin(i * math.pi / 3) * w, h * 0.72)) for i in range(6)]
    ring2 = [Vector((math.cos(i * math.pi / 3) * w * 0.85, math.sin(i * math.pi / 3) * w * 0.85, 0)) for i in range(6)]
    T = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'X')
    vt = b.bm.verts.new(b.M @ T @ pts_top)
    vr = [b.bm.verts.new(b.M @ T @ p) for p in ring]
    vr2 = [b.bm.verts.new(b.M @ T @ p) for p in ring2]
    for i in range(6):
        j = (i + 1) % 6
        b.bm.faces.new((vt, vr[i], vr[j]))
        b.bm.faces.new((vr[i], vr2[i], vr2[j], vr[j]))
    b._fin([vt] + vr + vr2, mat)


def prism_ring(b, r_in, r_out, z0, z1, mat, seg=8, rot=0.0):
    """Closed (hollow if r_in > 0) n-gon prism. Vertex 0 sits at angle `rot` (default +X)."""
    bm = b.bm

    def ring(r, z):
        return [bm.verts.new((math.cos(rot + math.tau * k / seg) * r, math.sin(rot + math.tau * k / seg) * r, z)) for k in range(seg)]

    ot, ob = ring(r_out, z1), ring(r_out, z0)
    faces, verts = [], ot + ob
    if r_in > 0:
        it, ib = ring(r_in, z1), ring(r_in, z0)
        verts += it + ib
    for k in range(seg):
        k1 = (k + 1) % seg
        faces.append(bm.faces.new((ob[k], ob[k1], ot[k1], ot[k])))
        if r_in > 0:
            faces.append(bm.faces.new((ot[k], ot[k1], it[k1], it[k])))
            faces.append(bm.faces.new((ib[k], ib[k1], ob[k1], ob[k])))
            faces.append(bm.faces.new((it[k], it[k1], ib[k1], ib[k])))
    if r_in == 0:
        faces.append(bm.faces.new(ot))
        faces.append(bm.faces.new(list(reversed(ob))))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return b._fin(verts, mat)


def lathe(b, profile, mat, seg=40, scallop=0.0, lobes=0):
    """Solid of revolution from a CLOSED (r, z) profile. Optional scalloped rim (cos lobes, strongest at large r)."""
    bm = b.bm
    before = set(bm.faces)
    vs = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    es = [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), dvec=Vector((0, 0, 0)), angle=math.tau, steps=seg, use_merge=True)
    faces = [f for f in bm.faces if f not in before]
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    verts = list({v for f in faces for v in f.verts})
    rmax = max(r for r, _ in profile)
    if scallop:
        for v in verts:
            a_ = math.atan2(v.co.y, v.co.x)
            k = 1 + scallop * (hypot2(v.co.x, v.co.y) / rmax) ** 4 * math.cos(lobes * a_)
            v.co.x *= k
            v.co.y *= k
    b.smooth = True
    out = b._fin(verts, mat)
    b.smooth = False
    return out


def hypot2(x, y):
    return math.hypot(x, y)


# Water levels / radii the CLIENT animates (apps/client/src/scene/FountainWater.tsx) — keep in sync.
FOUNTAIN = {'basin_y': 0.95, 'basin_r': 3.85, 't1_y': 3.98, 't1_r': 2.32, 't2_y': 5.65, 't2_r': 1.2}


def build_fountain():
    gx, gz = PLAZA
    b = B('Fountain', 'Plaza')
    b.tint = (1, 1, 1)
    # steps + basin
    prism_ring(b, 0, 5.9, 0.0, 0.2, 'marble')
    prism_ring(b, 0, 5.3, 0.2, 0.42, 'marble')
    prism_ring(b, 3.85, 4.55, 0.42, 1.32, 'marble')                         # basin wall (8-sided)
    prism_ring(b, 0, 3.9, 0.42, 0.62, 'ashlar_dark')                        # basin floor
    prism_ring(b, 3.55, 4.85, 1.32, 1.52, 'marble')                         # moulded rim cap
    prism_ring(b, 3.4, 3.62, 1.52, 1.6, 'marble')                           # inner bead
    for k in range(8):                                                      # corner pilasters + capitals + gold finials
        a = math.tau * k / 8
        c, s = math.cos(a), math.sin(a)
        r = 4.55
        b.box((c * r, s * r, 0.95), (0.7, 0.7, 1.0), 'marble', rz=a)
        b.box((c * r, s * r, 1.55), (0.95, 0.95, 0.2), 'marble', rz=a)
        b.box((c * r, s * r, 1.78), (0.7, 0.7, 0.26), 'marble', rz=a + math.pi / 4)
        b.sph((c * r, s * r, 2.1), 0.2, 0.2, 0.2, 'gold', 10, 6)
        # recessed panel on the face that follows this corner
        a2 = a + math.pi / 8
        ap = 4.55 * math.cos(math.pi / 8) + 0.02
        b.box((math.cos(a2) * ap, math.sin(a2) * ap, 0.88), (1.9, 0.12, 0.62), 'ashlar_dark', rz=a2 + math.pi / 2)
        b.box((math.cos(a2) * (ap + 0.03), math.sin(a2) * (ap + 0.03), 0.88), (1.55, 0.1, 0.4), 'marble', rz=a2 + math.pi / 2)
    # four lion-head spouts on the rim, mouths over the basin
    spouts = []
    for k in range(4):
        a = math.pi / 8 + k * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        rr = 4.15
        b.box((c * rr, s * rr, 1.82), (0.85, 0.85, 0.55), 'marble', rz=a)
        b.sph((c * (rr - 0.5), s * (rr - 0.5), 2.0), 0.36, 0.3, 0.36, 'gold', 10, 7)              # mask
        for sgn in (-1, 1):
            b.sph((c * (rr - 0.7) - s * sgn * 0.16, s * (rr - 0.7) + c * sgn * 0.16, 2.1), 0.05, 0.05, 0.05, 'iron', 6, 4)  # eyes
        b.cyl((c * (rr - 0.78), s * (rr - 0.78), 1.93), 0.1, 0.1, 0.36, 'gold', 8, ry=math.pi / 2, rz=a)  # spout
        spouts.append((round(gx + c * (rr - 0.95), 2), round(gz - s * (rr - 0.95), 2)))
        for j in (-1, 1):                                                   # little curls either side
            b.sph((c * (rr - 0.35) - s * j * 0.42, s * (rr - 0.35) + c * j * 0.42, 1.95), 0.15, 0.15, 0.15, 'gold', 8, 5)
    # coins on the basin floor (catch the light under the water)
    rnd = random.Random(3)
    for i in range(46):
        a_, r_ = rnd.random() * math.tau, rnd.random() * 3.3
        b.cyl((math.cos(a_) * r_, math.sin(a_) * r_, 0.64), 0.09, 0.09, 0.015, 'gold', 8)
    # central plinth + turned baluster pedestal
    prism_ring(b, 0, 1.9, 0.42, 1.0, 'marble')
    lathe(b, [(0, 1.0), (1.45, 1.0), (1.38, 1.15), (1.05, 1.3), (0.82, 1.6), (0.64, 2.0), (0.56, 2.45), (0.62, 2.85), (0.86, 3.1), (1.0, 3.22), (0, 3.22)], 'marble', 32)
    # tier 1: scalloped bowl
    lathe(b, [(0, 3.15), (0.9, 3.2), (1.5, 3.35), (2.2, 3.65), (2.78, 4.0), (3.02, 4.3), (2.84, 4.36), (2.7, 4.22), (2.3, 3.95),
              (1.6, 3.75), (0.8, 3.66), (0, 3.62)], 'marble', 48, scallop=0.055, lobes=12)
    # stem + tier 2 bowl
    lathe(b, [(0, 3.6), (0.5, 3.6), (0.4, 3.9), (0.3, 4.3), (0.28, 4.8), (0.42, 5.0), (0.9, 5.1), (1.3, 5.3), (1.62, 5.6), (1.72, 5.85),
              (1.58, 5.92), (1.45, 5.78), (1.1, 5.55), (0.6, 5.42), (0, 5.4)], 'marble', 40, scallop=0.05, lobes=9)
    # finial column + gold collar + crystal cluster
    lathe(b, [(0, 5.35), (0.26, 5.4), (0.22, 5.9), (0.27, 6.3), (0.5, 6.5), (0.6, 6.7), (0, 6.7)], 'marble', 20)
    b.cyl((0, 0, 6.55), 0.5, 0.5, 0.09, 'gold', 16)
    b.cyl((0, 0, 5.95), 0.3, 0.3, 0.07, 'gold', 14)
    crystal(b, 0, 0, 6.7, 3.0, 0.58)
    for i in range(6):
        a = i * math.tau / 6
        crystal(b, math.cos(a) * 0.62, math.sin(a) * 0.62, 6.65, 1.3 + (i % 3) * 0.4, 0.27, 0.45, a)
    b.build(loc=(gx, -gz, 0))
    LAYOUT['fountain'] = {'center': [gx, gz], 'spouts': spouts, **FOUNTAIN}
    LAYOUT['lights'].append({'n': 'fountain', 'x': gx, 'y': 8.2, 'z': gz, 'color': '#7fc4ff', 'i': 16, 'd': 18})
    LAYOUT['halos'].append({'x': gx, 'y': 8.4, 'z': gz, 'color': '#8fd0ff', 's': 5.0})
    # preview-only water (never exported: PV_ prefix) so Blender renders show roughly what the game will
    for nm, r_, y_, sg in (('basin', FOUNTAIN['basin_r'], FOUNTAIN['basin_y'], 8), ('t1', FOUNTAIN['t1_r'], FOUNTAIN['t1_y'], 40), ('t2', FOUNTAIN['t2_r'], FOUNTAIN['t2_y'], 32)):
        pv = B('PV_Water_' + nm, 'Plaza')
        pv.cyl((0, 0, y_), r_, r_, 0.03, 'water', sg)
        pv.build(loc=(gx, -gz, 0))
    # four lamp bollards ringing the fountain
    lb = B('FountainLamps', 'Plaza')
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 7.4, math.sin(a) * 7.4
        top = lamp_post(lb, x, y, 3.3)
        LAYOUT['lamps'].append({'x': round(gx + x, 2), 'y': round(top[2], 2), 'z': round(gz - y, 2)})
    lb.build(loc=(gx, -gz, 0.1))


# ---------------------------------------------------------------------------- portal gates
def build_portal_gate(name, gx, gz, accent):
    b = B(name, 'Plaza')
    b.tint = (1, 1, 1)
    b.cyl((0, 0, 0.09), 3.4, 3.5, 0.18, 'ashlar', 32)                                   # dais
    b.cyl((0, 0, 0.2), 3.0, 3.0, 0.08, 'ashlar_dark', 32)
    for s in (-1, 1):
        b.box((s * 2.35, 0, 0.35), (1.3, 1.3, 0.5), 'ashlar')                          # plinths
        b.box((s * 2.35, 0, 2.5), (0.95, 0.95, 4.0), 'ashlar')                         # pillars
        b.box((s * 2.35, 0, 4.7), (1.25, 1.25, 0.4), 'ashlar_dark')                    # capitals
        for z in (1.4, 2.6, 3.8):
            b.box((s * 2.35, -0.5, z), (0.75, 0.08, 0.5), 'ashlar_dark')               # relief panels
        # brazier on each side
        b.cyl((s * 3.7, -0.2, 0.55), 0.18, 0.12, 1.1, 'iron', 8)
        b.cyl((s * 3.7, -0.2, 1.25), 0.45, 0.2, 0.3, 'iron', 10)
        b.sph((s * 3.7, -0.2, 1.5), 0.32, 0.32, 0.4, 'flame', 8, 5)
        LAYOUT['lights'].append({'n': name + '_brazier', 'x': gx + s * 3.7, 'y': 1.7, 'z': gz + 0.2, 'color': accent, 'i': 7, 'd': 8})
        LAYOUT['halos'].append({'x': gx + s * 3.7, 'y': 1.6, 'z': gz + 0.2, 'color': accent, 's': 1.8})
    # pointed arch from voussoirs
    n = 15
    for i in range(n):
        a = math.pi * i / (n - 1)
        r = 2.35
        x, z = math.cos(a) * r, 4.9 + math.sin(a) * r * 0.78
        b.box((x, 0, z), (0.62, 1.1, 0.7), 'ashlar' if i % 2 else 'ashlar_dark', ry=math.pi / 2 - a)
    b.box((0, 0, 4.9 + 2.35 * 0.78 + 0.3), (0.85, 1.2, 0.9), 'gold')                   # keystone
    b.sph((0, -0.7, 4.9 + 2.35 * 0.78 + 0.3), 0.3, 0.1, 0.3, 'crystal', 8, 6)
    b.build(loc=(gx, -gz, 0))
    for s in (-1, 1):
        add_col(gx + s * 2.35, gz, 0.62, name)
