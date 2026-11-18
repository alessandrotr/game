"""
Lobby world — part C: the castle.

Authored in castle-local space then placed at game (0, CASTLE_Z):
    local +X east, local +Y = away from town (north), front wall at local y = -6.75, back wall at +6.75.
Objects whose name starts with `Castle_Front` fade out in the game when the player is inside the bailey.
Must match packages/shared CASTLE / CASTLE_TOWERS (collision).
"""
import math
import random
from mathutils import Vector, Matrix

CASTLE_Z = -33.75
HX, HY = 17.5, 6.75          # wall half extents (x, y)
WALL_H, WALL_T = 8.0, 1.8


def wall(b, p0, p1, h=WALL_H, t=WALL_T, mat='ashlar', outward=1, merl=True, buttress=True, z0=0.0):
    """Curtain wall between two local points with parapet, merlons, machicolation corbels and buttresses.
    `outward` = +1/-1: which side (left normal * outward) faces the enemy."""
    p0, p1 = Vector((p0[0], p0[1], 0)), Vector((p1[0], p1[1], 0))
    d = p1 - p0
    ln = d.length
    dn = d.normalized()
    nr = Vector((-dn.y, dn.x, 0)) * outward
    ang = math.atan2(dn.y, dn.x)
    mid = (p0 + p1) / 2
    b.tint = (1, 1, 1)
    # footing (battered base) + body
    b.beam((p0.x, p0.y, z0 + 0.35), (p1.x, p1.y, z0 + 0.35), t + 0.7, 0.7, 'rubble')
    b.beam((p0.x, p0.y, z0 + h / 2), (p1.x, p1.y, z0 + h / 2), t, h, mat)
    # wall-walk + string course
    b.beam((p0.x, p0.y, z0 + h + 0.05), (p1.x, p1.y, z0 + h + 0.05), t + 0.5, 0.3, 'ashlar_dark')
    # inner low parapet and outer crenellations
    inner = nr * -(t / 2 + 0.1)
    outer = nr * (t / 2 + 0.2)
    b.beam((p0.x + inner.x, p0.y + inner.y, z0 + h + 0.55), (p1.x + inner.x, p1.y + inner.y, z0 + h + 0.55), 0.3, 0.6, mat)
    if merl:
        n = max(2, int(ln / 1.75))
        for i in range(n):
            c = p0 + dn * (i + 0.5) * ln / n
            if i % 2 == 0:
                b.box((c.x + outer.x, c.y + outer.y, z0 + h + 0.9), (ln / n * 0.95, 0.55, 1.2), mat, rz=ang)
            # corbels (machicolation) under every merlon
            if i % 2 == 0:
                b.box((c.x + outer.x * 1.15, c.y + outer.y * 1.15, z0 + h - 0.5), (0.7, 0.75, 0.9), 'ashlar_dark', rz=ang)
        b.beam((p0.x + outer.x, p0.y + outer.y, z0 + h + 0.25), (p1.x + outer.x, p1.y + outer.y, z0 + h + 0.25), 0.55, 0.3, mat)
    if buttress:
        n = max(1, int(ln / 5.5))
        for i in range(n):
            c = p0 + dn * (i + 0.5) * ln / n + nr * (t / 2 + 0.35)
            b.box((c.x, c.y, z0 + 2.4), (0.9, 0.9, 4.8), 'ashlar_dark', rz=ang)
            b.box((c.x, c.y, z0 + 5.2), (0.7, 0.7, 1.4), 'ashlar_dark', rz=ang)
    # arrow slits
    n = max(2, int(ln / 4.2))
    for i in range(n):
        c = p0 + dn * (i + 0.5) * ln / n + nr * (t / 2 + 0.02)
        b.box((c.x, c.y, z0 + h * 0.62), (0.18, 0.12, 1.0), 'glass_dark', rz=ang)


def tower(b, x, y, r, h, roof_mat='roof_teal', roof_h=6.0, flag=None, lit=True, merl=False):
    b.tint = (1, 1, 1)
    b.cyl((x, y, 0.5), r * 1.28, r * 1.2, 1.0, 'rubble', 20)
    b.cyl((x, y, h / 2 + 0.5), r * 1.08, r, h - 1.0, 'ashlar', 20)
    # banding + machicolation ring + corbels
    b.cyl((x, y, h * 0.55), r * 1.05, r * 1.05, 0.28, 'ashlar_dark', 20)
    b.cyl((x, y, h - 0.35), r * 1.2, r * 1.2, 0.9, 'ashlar_dark', 20)
    for k in range(16):
        a = k * math.tau / 16
        b.box((x + math.cos(a) * r * 1.1, y + math.sin(a) * r * 1.1, h - 1.1), (0.45, 0.6, 0.9), 'ashlar_dark', rz=a)
    if merl:
        for k in range(14):
            if k % 2 == 0:
                a = k * math.tau / 14
                b.box((x + math.cos(a) * r * 1.15, y + math.sin(a) * r * 1.15, h + 0.55), (0.9, 0.5, 1.1), 'ashlar', rz=a + math.pi / 2)
    # arrow slits + a few lit windows
    for z in (h * 0.3, h * 0.45, h * 0.72):
        for k in range(5):
            a = k * math.tau / 5 + z
            m = 'glass_lit' if (lit and k == 1 and z == h * 0.72) else 'glass_dark'
            b.box((x + math.cos(a) * r * 1.04, y + math.sin(a) * r * 1.04, z), (0.2, 0.14, 1.0 if m == 'glass_dark' else 1.3), m, rz=a + math.pi / 2)
    if roof_h:
        b.cyl((x, y, h + 0.1 + 0.3), r * 1.45, r * 1.45, 0.24, 'timber', 20)
        b.cyl((x, y, h + 0.4 + roof_h / 2), r * 1.4, 0.0, roof_h, roof_mat, 20, cap=False)
        b.cyl((x, y, h + 0.4 + roof_h + 0.6), 0.09, 0.0, 1.4, 'gold', 6)
        b.sph((x, y, h + 0.4 + roof_h), 0.2, 0.2, 0.2, 'gold', 8, 5)
        if flag:
            b.beam((x, y, h + roof_h + 1.1), (x, y, h + roof_h + 3.6), 0.05, 0.05, 'iron')
            b.poly([(x + 0.03, y, h + roof_h + 3.5), (x + 0.03, y, h + roof_h + 2.6), (x + 1.9, y, h + roof_h + 3.05)], flag, thick=0.03)
            b.poly([(x + 0.03, y, h + roof_h + 3.5), (x + 0.03, y, h + roof_h + 2.6), (x + 1.9, y, h + roof_h + 3.05)], flag, thick=-0.03)


def torch(b, x, y, z, rz, reg=None):
    b.tint = (1, 1, 1)
    b.beam((x, y, z), (x + math.cos(rz) * 0.5, y + math.sin(rz) * 0.5, z + 0.1), 0.06, 0.06, 'iron')
    ex, ey = x + math.cos(rz) * 0.55, y + math.sin(rz) * 0.55
    b.cyl((ex, ey, z + 0.2), 0.12, 0.06, 0.3, 'iron', 6)
    b.sph((ex, ey, z + 0.5), 0.14, 0.14, 0.24, 'flame', 6, 4)
    return ex, ey, z + 0.5


def brazier(b, x, y, h=1.1, r=0.55):
    b.tint = (1, 1, 1)
    for k in range(3):
        a = k * math.tau / 3
        b.beam((x + math.cos(a) * 0.45, y + math.sin(a) * 0.45, 0.0), (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, h), 0.07, 0.07, 'iron')
    b.cyl((x, y, h + 0.12), r, r * 0.6, 0.3, 'iron', 12)
    b.sph((x, y, h + 0.45), r * 0.75, r * 0.75, 0.5, 'flame', 8, 5)


def build_castle():
    cz = CASTLE_Z
    F = B('Castle_Front', 'Castle')       # fades when the player is inside
    R = B('Castle', 'Castle')             # always solid
    Fd = B('Castle_Front_Details', 'Castle')

    # ---------------- front curtain wall (two halves around the gatehouse), side + back walls
    wall(F, (-HX, -HY), (-4.0, -HY), outward=-1)
    wall(F, (4.0, -HY), (HX, -HY), outward=-1)
    wall(R, (-HX, -HY), (-HX, HY), outward=1)
    wall(R, (HX, HY), (HX, -HY), outward=1)
    wall(R, (-HX, HY), (HX, HY), outward=-1)

    # ---------------- gatehouse
    F.tint = (1, 1, 1)
    for s in (-1, 1):
        F.box((s * 3.1, -HY, 6.5), (2.4, 4.6, 13.0), 'ashlar')                     # piers
    F.box((0, -HY, 4.6 + 4.2), (8.0, 4.6, 8.4), 'ashlar')                          # block over the opening
    F.box((0, -HY - 2.4, 13.2), (9.2, 1.0, 0.7), 'ashlar_dark')                    # projecting machicolation course
    for i in range(10):
        F.box((-4.2 + i * 0.93, -HY - 2.5, 14.0), (0.62, 0.7, 1.4), 'ashlar') if i % 2 == 0 else None
        F.box((-4.2 + i * 0.93, -HY - 2.2, 12.6), (0.55, 0.9, 1.0), 'ashlar_dark')
    F.box((0, -HY, 14.3), (8.4, 4.6, 0.5), 'ashlar_dark')
    for i in range(9):
        if i % 2 == 0:
            F.box((-3.9 + i * 0.98, -HY - 1.9, 15.1), (0.7, 0.6, 1.3), 'ashlar')
            F.box((-3.9 + i * 0.98, -HY + 1.9, 15.1), (0.7, 0.6, 1.3), 'ashlar')
    # pointed arch trim around the opening (voussoirs) + keystone
    n = 13
    for i in range(n):
        a = math.pi * i / (n - 1)
        r = 2.15
        F.box((math.cos(a) * r, -HY - 2.3, 2.7 + math.sin(a) * r), (0.6, 0.55, 0.7), 'ashlar_dark' if i % 2 else 'ashlar', ry=math.pi / 2 - a)
    F.box((0, -HY - 2.35, 2.7 + 2.15 + 0.1), (0.8, 0.65, 0.95), 'gold')
    # coat of arms above the gate
    Fd.box((0, -HY - 2.4, 8.3), (2.4, 0.15, 3.0), 'ashlar_dark')
    Fd.box((0, -HY - 2.5, 8.3), (1.9, 0.1, 2.5), 'cloth_red')
    Fd.sph((0, -HY - 2.58, 8.5), 0.55, 0.06, 0.55, 'gold', 10, 6)
    Fd.box((0, -HY - 2.58, 7.5), (0.12, 0.05, 0.9), 'gold')
    # portcullis (raised, bottom spikes visible) + iron-bound doors standing open
    for i in range(11):
        x = -1.75 + i * 0.35
        Fd.beam((x, -HY - 1.7, 3.5), (x, -HY - 1.7, 4.6), 0.07, 0.07, 'iron')
        Fd.cyl((x, -HY - 1.7, 3.38), 0.0, 0.05, 0.25, 'iron', 4)
    for z in (3.9, 4.35):
        Fd.beam((-1.9, -HY - 1.7, z), (1.9, -HY - 1.7, z), 0.1, 0.06, 'iron')
    for s in (-1, 1):
        Fd.box((s * 1.1, -HY + 0.4, 2.2), (1.8, 0.22, 4.4), 'wood', rz=s * 1.15)
        for z in (0.7, 2.2, 3.7):
            Fd.box((s * 1.1, -HY + 0.4, z), (1.8, 0.27, 0.14), 'iron', rz=s * 1.15)
    # gate towers (round, tall, roofed)
    for s in (-1, 1):
        tower(F, s * 4.5, -HY - 0.3, 2.2, 17.0, 'roof_teal', 6.5, flag='cloth_red' if s < 0 else 'cloth_blue')
    # front corner towers
    for s in (-1, 1):
        tower(F, s * HX, -HY, 2.8, 15.0, 'roof_teal', 6.0, flag='cloth_gold')
    # braziers flanking the approach + wall torches
    for s in (-1, 1):
        brazier(Fd, s * 3.0, -HY - 3.3)
    LAYOUT['halos'].extend([{'x': -3.0, 'y': 1.9, 'z': cz + HY + 3.3, 'color': '#ffb060', 's': 2.0}, {'x': 3.0, 'y': 1.9, 'z': cz + HY + 3.3, 'color': '#ffb060', 's': 2.0}])
    for x in (-11, -7.2, 7.2, 11):
        ex, ey, ez = torch(Fd, x, -HY - 1.3, 5.0, -math.pi / 2)
        LAYOUT['halos'].append({'x': x, 'y': ez, 'z': cz + HY + 1.85, 'color': '#ff9a40', 's': 1.4})
    # long banners hanging off the front wall + gatehouse
    for x, m in ((-12.5, 'cloth_red'), (12.5, 'cloth_blue'), (-8.5, 'cloth_gold'), (8.5, 'cloth_gold')):
        Fd.box((x, -HY - 1.0, 5.0), (1.6, 0.07, 5.2), m)
        Fd.poly([(x - 0.8, -HY - 1.05, 2.4), (x + 0.8, -HY - 1.05, 2.4), (x, -HY - 1.05, 1.5)], m, thick=0.07)
        Fd.box((x, -HY - 1.06, 5.0), (0.3, 0.03, 4.4), 'gold')
        Fd.beam((x - 0.9, -HY - 1.0, 7.65), (x + 0.9, -HY - 1.0, 7.65), 0.06, 0.06, 'iron')

    # ---------------- back corner towers
    for s in (-1, 1):
        tower(R, s * HX, HY, 2.8, 15.0, 'roof_teal', 6.0, flag='cloth_gold')

    # ---------------- keep
    KY = 3.5
    R.tint = (1, 1, 1)
    R.box((0, KY, 0.6), (15.6, 13.6, 1.2), 'rubble')
    R.box((0, KY, 13.5), (14.0, 12.0, 26.0), 'ashlar')
    for sx in (-1, 1):
        for sy in (-1, 1):
            R.box((sx * 7.0, KY + sy * 6.0, 13.5), (1.2, 1.2, 26.0), 'ashlar_dark')
    for z in (8.0, 16.0, 22.0):
        R.box((0, KY, z), (14.5, 12.5, 0.4), 'ashlar_dark')
    R.box((0, KY, 26.4), (15.2, 13.2, 0.9), 'ashlar_dark')
    for sx in (-1, 1):
        for sy in (-1, 1):
            tower(R, sx * 7.0, KY + sy * 6.0, 2.0, 31.0, 'roof_teal', 9.0, flag='cloth_red' if sx < 0 else 'cloth_blue', lit=True)
    # roof: pyramid over the 14x12 keep
    R.push(Matrix.Translation((0, KY, 0)) @ Matrix.Diagonal((1.0, 12.0 / 14.0, 1.0, 1.0)))
    R.cyl((0, 0, 27.9 + 6.0), 10.4, 0.0, 12.0, 'roof_slate', 4, rz=math.pi / 4, cap=False)
    R.pop()
    R.cyl((0, KY, 40.4), 0.12, 0.12, 4.0, 'iron', 6)
    R.box((0.9, KY, 41.8), (1.8, 0.05, 1.0), 'cloth_red'); R.sph((0, KY, 42.5), 0.25, 0.25, 0.25, 'gold', 8, 5)
    # front face (y = KY - 6): grand door, steps, windows, balcony
    fy = KY - 6.0
    for i in range(4):
        R.box((0, fy - 0.35 - i * 0.55, 0.3 + (3 - i) * 0.0 + 0.0), (4.6 - i * 0.1, 0.6, 0.6 * (4 - i) / 4 + 0.0), 'rubble') if False else None
    for i in range(4):
        h_ = 1.2 + 0.0 - (i + 1) * 0.28
        R.box((0, fy - 0.35 - i * 0.7, max(0.01, h_) / 2), (5.2 - i * 0.2, 0.7, max(0.01, h_)), 'ashlar')
    R.box((-1.1, fy - 0.1, 2.6), (2.0, 0.22, 4.6), 'wood'); R.box((1.1, fy - 0.1, 2.6), (2.0, 0.22, 4.6), 'wood')
    for z in (1.0, 2.6, 4.2):
        R.box((0, fy - 0.2, z + 0.9), (4.0, 0.1, 0.16), 'iron')
    for i in range(15):
        a = math.pi * i / 14
        R.box((math.cos(a) * 2.5, fy - 0.2, 4.9 + math.sin(a) * 1.5), (0.6, 0.5, 0.7), 'ashlar_dark', ry=math.pi / 2 - a)
    for s in (-1, 1):
        R.box((s * 2.9, fy - 0.2, 2.5), (0.7, 0.6, 5.0), 'ashlar_dark')
        brazier(R, s * 4.1, fy - 1.7)
        LAYOUT['halos'].append({'x': s * 4.1, 'y': 1.9, 'z': round(cz - (fy - 1.7), 2), 'color': '#ffb060', 's': 1.8})
    for z in (11.0, 17.0, 22.0):
        for x in (-5.0, -1.7, 1.7, 5.0):
            gm = 'glass_lit'
            R.box((x, fy - 0.03, z), (1.1, 0.08, 2.2), gm)
            R.box((x, fy - 0.06, z + 1.2), (1.5, 0.12, 0.2), 'ashlar_dark')
            for i in range(7):
                a = math.pi * i / 6
                R.box((x + math.cos(a) * 0.55, fy - 0.05, z + 1.1 + math.sin(a) * 0.55), (0.2, 0.14, 0.24), 'ashlar_dark', ry=math.pi / 2 - a)
            R.box((x, fy - 0.12, z - 1.3), (1.4, 0.35, 0.15), 'ashlar_dark')
    R.box((0, fy - 0.9, 16.2), (6.0, 1.8, 0.3), 'ashlar_dark')                      # balcony
    for i in range(13):
        R.box((-2.9 + i * 0.48, fy - 1.7, 16.9), (0.1, 0.1, 1.2), 'iron')
    R.beam((-3.0, fy - 1.7, 17.5), (3.0, fy - 1.7, 17.5), 0.12, 0.1, 'iron')
    for x, m in ((-5.4, 'cloth_blue'), (0, 'cloth_red'), (5.4, 'cloth_blue')):
        R.box((x, fy - 0.2, 20.5 if x == 0 else 18.5), (1.7, 0.07, 8.0 if x == 0 else 6.0), m)
        R.box((x, fy - 0.24, 20.5 if x == 0 else 18.5), (0.35, 0.03, 7.4 if x == 0 else 5.4), 'gold')
        R.poly([(x - 0.85, fy - 0.25, 16.5 if x == 0 else 15.5), (x + 0.85, fy - 0.25, 16.5 if x == 0 else 15.5), (x, fy - 0.25, 15.3 if x == 0 else 14.4)], m, thick=0.07)
    # ---------------- bailey: floor, emblem, stairs to the wall-walk, training yard, stable, well
    R.tint = (1, 1, 1)
    R.box((0, 0, 0.025), (2 * HX - 1.8, 2 * HY - 1.8, 0.05), 'cobble2')
    annulus(R, 0.0, 3.0, 0.07, 'ashlar_dark', seg=32, rings=2)
    annulus(R, 3.0, 3.25, 0.075, 'gold', seg=32, rings=1)
    for s in (-1, 1):                                       # stairs up the inside of the side walls
        for i in range(15):
            y0 = -HY + 1.4 + i * 0.28
            R.box((s * (HX - WALL_T / 2 - 0.8), y0 + 0.0, (0.5 + i * 0.5) / 2), (1.2, 0.5, 0.5 + i * 0.5), 'ashlar') if i < 15 and False else None
        for i in range(16):
            R.box((s * (HX - WALL_T / 2 - 1.0), -HY + 1.2 + i * 0.5, (0.5 * (i + 1)) / 2), (1.3, 0.5, 0.5 * (i + 1)), 'ashlar')
    # training yard on the west side: dummies, rack, archery butts
    rnd = random.Random(5)
    for i in range(2):
        x, y = -9.0 + i * 3.0, -2.0
        R.cyl((x, y, 0.8), 0.07, 0.07, 1.6, 'timber', 6)
        R.beam((x - 0.55, y, 1.35), (x + 0.55, y, 1.35), 0.09, 0.09, 'timber')
        R.tint = (0.8, 0.7, 0.5)
        R.sph((x, y, 1.75), 0.2, 0.2, 0.22, 'vcol', 8, 5)
        R.cyl((x, y, 1.0), 0.18, 0.22, 0.7, 'vcol', 8)
        R.tint = (1, 1, 1)
        R.cyl((x + 0.45, y - 0.12, 1.25), 0.26, 0.26, 0.06, 'paint_red', 12, rx=math.pi / 2)
    for i in range(2):
        x = -11.5 + i * 2.2
        R.cyl((x, 3.8, 0.8), 0.05, 0.05, 1.6, 'timber', 6)
        R.cyl((x, 3.7, 1.35), 0.55, 0.55, 0.14, 'cloth_cream', 14, rx=math.pi / 2)
        R.cyl((x, 3.62, 1.35), 0.38, 0.38, 0.05, 'paint_red', 14, rx=math.pi / 2)
        R.cyl((x, 3.58, 1.35), 0.14, 0.14, 0.05, 'gold', 14, rx=math.pi / 2)
    for i in range(5):
        R.beam((-12.5 + i * 0.4, 1.0, 0.1), (-12.5 + i * 0.4, 1.0, 1.7), 0.07, 0.03, 'iron')
        R.box((-12.5 + i * 0.4, 1.0, 1.55), (0.3, 0.05, 0.07), 'gold')
    R.box((-11.7, 1.0, 1.0), (2.4, 0.2, 0.08), 'timber'); R.box((-11.7, 1.0, 0.5), (2.4, 0.2, 0.08), 'timber')
    for sx in (-1, 1):
        R.box((-11.7 + sx * 1.3, 1.0, 0.85), (0.12, 0.2, 1.7), 'timber')
    # east side: stable lean-to against the wall, cart, hay
    sx0 = HX - WALL_T / 2 - 0.2
    for i in range(3):
        R.box((sx0 - 1.0, -3.0 + i * 3.0, 1.7), (0.18, 0.18, 3.4), 'timber')
    R.beam((sx0 - 4.2, -4.0, 2.2), (sx0 - 0.3, -4.0, 3.5), 2.0, 0.12, 'wood') if False else None
    R.box((sx0 - 2.4, 0.0, 3.1), (4.6, 9.6, 0.15), 'roof_terracotta', ry=0.12)
    for i in range(3):
        R.box((sx0 - 2.4, -3.0 + i * 3.0, 0.9), (3.0, 0.1, 1.8), 'wood') if i in (1,) else None
    hay(R, sx0 - 1.8, -3.5); hay(R, sx0 - 2.6, 3.0, 0.5)
    R.box((8.0, -1.5, 0.75), (2.4, 1.2, 0.2), 'wood')
    for s in (-1, 1):
        R.cyl((8.0 + s * 0.9, -2.15, 0.55), 0.55, 0.55, 0.1, 'timber', 12, rx=math.pi / 2)
        R.cyl((8.0 + s * 0.9, -0.85, 0.55), 0.55, 0.55, 0.1, 'timber', 12, rx=math.pi / 2)
    R.beam((8.0, -1.5, 0.75), (8.0, -4.0, 0.5), 0.12, 0.12, 'timber')
    for i in range(3):
        barrel(R, 5.0 + i * 0.9, -4.8)
    crate(R, 10.8, -3.6, 0, 0.9); crate(R, 10.8, -4.6, 0, 0.8)
    # inner wall sconces
    for x in (-11, -5, 5, 11):
        torch(R, x, HY - 1.2, 4.6, -math.pi / 2)
    for sy in (-3.0, 3.0):
        for sx in (-1, 1):
            torch(R, sx * (HX - 1.3), sy, 4.6, math.pi if sx > 0 else 0.0)
    # build
    F.build(loc=(0, -cz, 0)); R.build(loc=(0, -cz, 0)); Fd.build(loc=(0, -cz, 0))
    for s in (-1, 1):
        LAYOUT['lights'].append({'n': 'castle_brazier', 'x': s * 3.0, 'y': 2.4, 'z': round(cz + HY + 3.3, 2), 'color': '#ffb060', 'i': 14, 'd': 14})
    LAYOUT['lights'].append({'n': 'keep_door', 'x': 0, 'y': 3.0, 'z': round(cz - KY + 6 + 2.0, 2), 'color': '#ffc880', 'i': 12, 'd': 14})
    return cz
