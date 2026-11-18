"""
Lobby world — building + prop generators (run inside Blender, after common.py).

Every building is authored in LOCAL space: footprint centred on the origin, width along X,
depth along Y, FRONT facing -Y, Z up. The caller places/rotates the finished object.
"""
import math
import random
from mathutils import Vector, Matrix
# (B, MATS, ... come from common.py: all modules are exec'd into one shared namespace)


def frame(side, L_w, L_d):
    """Wall-local frame: x along wall, y OUTWARD, z up."""
    if side == 'front':
        return Matrix.Translation((0, -L_d / 2, 0)) @ Matrix.Rotation(math.pi, 4, 'Z')
    if side == 'back':
        return Matrix.Translation((0, L_d / 2, 0))
    if side == 'left':
        return Matrix.Translation((-L_w / 2, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    return Matrix.Translation((L_w / 2, 0, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')


FLOWERS = [(0.85, 0.15, 0.2), (0.95, 0.8, 0.2), (0.95, 0.55, 0.7), (0.95, 0.95, 0.9), (0.6, 0.35, 0.85)]


def window(b, cx, cz, lit, shutter, flowers, rnd, w=0.95, h=1.25):
    t0 = b.tint
    b.tint = (1, 1, 1)
    hw, hh = w / 2, h / 2
    b.box((cx, 0.0, cz + hh + 0.05), (w + 0.28, 0.16, 0.1), 'timber')            # lintel
    b.box((cx, 0.0, cz - hh - 0.05), (w + 0.2, 0.16, 0.1), 'timber')             # frame bottom
    for s in (-1, 1):
        b.box((cx + s * (hw + 0.05), 0.0, cz), (0.1, 0.16, h + 0.1), 'timber')   # frame sides
    b.box((cx, 0.03, cz), (w, 0.05, h), 'glass_lit' if lit else 'glass_dark')     # pane
    b.box((cx, 0.07, cz), (0.05, 0.05, h), 'timber')                             # mullion
    b.box((cx, 0.07, cz + 0.08), (w, 0.05, 0.05), 'timber')                      # transom
    b.box((cx, 0.14, cz - hh - 0.13), (w + 0.4, 0.3, 0.09), 'rubble')            # stone sill
    if shutter:
        for s in (-1, 1):
            b.box((cx + s * (hw + 0.34), 0.17, cz), (0.42, 0.05, h + 0.06), shutter, rz=-s * rnd.uniform(0.5, 1.0))
    if flowers:
        b.box((cx, 0.28, cz - hh - 0.33), (w + 0.25, 0.26, 0.22), 'wood')
        b.tint = (0.35, 0.55, 0.25)
        b.box((cx, 0.28, cz - hh - 0.2), (w + 0.18, 0.22, 0.1), 'vcol')
        for i in range(6):
            b.tint = rnd.choice(FLOWERS)
            b.sph((cx - w / 2 + 0.1 + i * (w - 0.2) / 5, 0.28 + rnd.uniform(-0.05, 0.05), cz - hh - 0.12), 0.075, 0.075, 0.075, 'vcol', 6, 4)
    b.tint = t0


def door(b, cx, rnd, w=1.25, h=2.25, base=0.0, lantern=True):
    t0 = b.tint
    b.tint = (1, 1, 1)
    b.box((cx - w / 2 - 0.1, 0.0, base + h / 2), (0.2, 0.22, h + 0.1), 'timber')
    b.box((cx + w / 2 + 0.1, 0.0, base + h / 2), (0.2, 0.22, h + 0.1), 'timber')
    b.box((cx, 0.0, base + h + 0.12), (w + 0.5, 0.22, 0.22), 'timber')
    b.box((cx, 0.0, base + h / 2), (w, 0.1, h), 'wood')
    for z in (0.45, 1.75):
        b.box((cx, 0.07, base + z), (w - 0.04, 0.03, 0.12), 'iron')
    b.box((cx, 0.07, base + h / 2), (0.04, 0.03, h - 0.1), 'iron')
    b.cyl((cx + 0.38, 0.09, base + 1.1), 0.07, 0.07, 0.03, 'brass', 10, rx=math.pi / 2)
    # steps from the ground up to the plinth (door sill sits on the plinth at z=base)
    n = max(1, int(round(base / 0.19)))
    for i in range(n):
        top = base * (n - i) / (n + 1)
        b.box((cx, 0.2 + 0.17 + i * 0.34, top / 2), (w + 0.9 - i * 0.1, 0.34, top), 'rubble')
    if lantern:
        x = cx + w / 2 + 0.55
        b.beam((x - 0.35, 0.05, base + h + 0.0), (x, 0.55, base + h + 0.0), 0.05, 0.05, 'iron')
        b.beam((x, 0.55, base + h + 0.0), (x, 0.55, base + h - 0.12), 0.03, 0.03, 'iron')
        b.box((x, 0.55, base + h - 0.32), (0.2, 0.2, 0.3), 'lantern')
        b.cyl((x, 0.55, base + h - 0.1), 0.17, 0.02, 0.1, 'iron', 4, rz=math.pi / 4)
    b.tint = t0


def gable_roof(b, w, d, z0, h, mat, over=0.6, gover=0.32, thick=0.17, tint=(1, 1, 1), fill=None, fill_tint=(1, 1, 1)):
    """Ridge along X. Eaves at y = +-(d/2+over); wall tops at z0."""
    hd = d / 2
    t0 = b.tint
    b.tint = tint
    for s in (-1, 1):
        E = (0, s * (hd + over), z0 - over * h / hd)
        R = (0, 0, z0 + h + 0.02)
        b.beam(E, R, w + 2 * gover, thick, mat)
        # thick eave edge (fascia) so the roof reads as a slab, not a sheet
        b.beam((-w / 2 - gover, E[1], E[2] - thick / 2), (w / 2 + gover, E[1], E[2] - thick / 2), 0.1, 0.14, 'timber')
    b.tint = (1, 1, 1)
    b.box((0, 0, z0 + h + 0.1), (w + 2 * gover + 0.1, 0.34, 0.2), 'timber')       # ridge cap
    for s in (-1, 1):
        for sy in (-1, 1):
            E = (s * (w / 2 + gover), sy * (hd + over), z0 - over * h / hd)
            R = (s * (w / 2 + gover), 0, z0 + h + 0.02)
            b.beam(E, R, 0.06, 0.22, 'timber')                                      # barge boards
    if fill:
        b.tint = fill_tint
        for s in (-1, 1):
            x = s * (w / 2 - 0.02)
            b.poly([(x, -hd, z0), (x, hd, z0), (x, 0, z0 + h)], fill, thick=-s * 0.18)
        b.tint = (1, 1, 1)
        for s in (-1, 1):
            x = s * (w / 2 + 0.05)
            b.beam((x, -hd * 0.95, z0), (x, 0, z0 + h * 0.92), 0.07, 0.13, 'timber')
            b.beam((x, hd * 0.95, z0), (x, 0, z0 + h * 0.92), 0.07, 0.13, 'timber')
            b.beam((x, -hd * 0.5, z0 + h * 0.5), (x, hd * 0.5, z0 + h * 0.5), 0.07, 0.12, 'timber')
            b.beam((x, 0, z0), (x, 0, z0 + h * 0.9), 0.07, 0.12, 'timber')
            b.cyl((x + s * 0.02, 0, z0 + h * 0.3), 0.28, 0.28, 0.08, 'glass_dark', 12, ry=math.pi / 2)
    b.tint = t0


def chimney(b, x, y, z0, h, rnd, glow=False):
    b.tint = (1, 1, 1)
    b.box((x, y, z0 + h / 2), (0.95, 0.95, h), 'rubble')
    b.box((x, y, z0 + h + 0.08), (1.18, 1.18, 0.18), 'rubble')
    for dx in (-0.22, 0.22):
        b.cyl((x + dx, y, z0 + h + 0.38), 0.14, 0.12, 0.42, 'roof_terracotta', 8)
    if glow:
        b.sph((x, y, z0 + h + 0.35), 0.2, 0.2, 0.12, 'flame', 6, 4)


def dormer(b, x, sgn, d, z0, h, roof, wall_tint, shutter, rnd, over=0.6):
    hd = d / 2
    y = sgn * hd * 0.52
    zs = z0 + h * (1 - abs(y) / hd)
    b.tint = wall_tint
    b.box((x, y, zs + 0.45), (1.6, 1.0, 1.2), 'plaster')
    b.push(Matrix.Translation((x, y, zs + 1.05)) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
    gable_roof(b, 1.0, 1.9, 0, 0.8, roof, over=0.25, gover=0.22, thick=0.12)
    b.pop()
    fr = Matrix.Translation((x, y + sgn * 0.5, 0)) @ (Matrix.Rotation(math.pi, 4, 'Z') if sgn < 0 else Matrix.Identity(4))
    b.push(fr)
    window(b, 0, zs + 0.45, rnd.random() < 0.75, shutter, False, rnd, 0.7, 0.8)
    b.pop()


def wall_features(b, side, L, z0, fh, f, W, D, rnd, shutter, flowers_p, ground_door, lit_p=0.72, back_light=True):
    """Half-timber frame + windows (+door) for ONE wall of ONE floor."""
    b.push(frame(side, W, D))
    b.tint = (1, 1, 1)
    n = max(1, int(round((L - 0.8) / 2.3)))
    bw = L / n
    zt = z0 + fh
    # studs + rails + knee braces
    b.box((0, 0.045, z0 + 0.12), (L, 0.14, 0.22), 'timber')
    b.box((0, 0.045, zt - 0.12), (L, 0.14, 0.22), 'timber')
    for i in range(n + 1):
        x = -L / 2 + i * bw
        b.box((x, 0.045, z0 + fh / 2), (0.2 if i in (0, n) else 0.15, 0.14, fh), 'timber')
    for i in range(n):
        xl, xr = -L / 2 + i * bw, -L / 2 + (i + 1) * bw
        b.beam((xl, 0.05, zt - 1.0), (xl + 0.62, 0.05, zt - 0.2), 0.12, 0.1, 'timber')
        b.beam((xr, 0.05, zt - 1.0), (xr - 0.62, 0.05, zt - 0.2), 0.12, 0.1, 'timber')
        cx = -L / 2 + (i + 0.5) * bw
        if ground_door and f == 0 and i == n // 2:
            door(b, cx, rnd, base=z0)
            continue
        win = side in ('front', 'back') or (side in ('left', 'right') and rnd.random() < 0.65)
        if win:
            lit = rnd.random() < lit_p
            window(b, cx, z0 + fh * 0.55, lit, shutter if side in ('front', 'back') or rnd.random() < .5 else None,
                   rnd.random() < flowers_p, rnd)
    b.pop()


def _door_x(L):
    n = max(1, int(round((L - 0.8) / 2.3)))
    return -L / 2 + (n // 2 + 0.5) * (L / n)


def house(name, W, D, floors, roof='roof_terracotta', wall=(1, 1, 1), shutter='paint_green', seed=0, jetty=True, dormers=1,
          sign=None, fh=2.75, chim=2, flowers_p=0.35, roof_tint=(1, 1, 1), thatch=False, coll='Buildings', door_side='front',
          stone_ground=False, roof_h=None, lit_p=0.72, finish=True):
    rnd = random.Random(seed)
    b = B(name, coll)
    PL = 0.55
    b.tint = (1, 1, 1)
    b.box((0, 0, PL / 2 - 0.05), (W + 0.4, D + 0.4, PL + 0.1), 'rubble')
    z = PL
    dims = []
    for f in range(floors):
        jet = 0.38 if (jetty and f >= 1) else 0.0
        w, d = W + (0.0), D + 2 * jet
        dims.append((w, d, z))
        b.tint = tuple(c * (0.97 + 0.06 * rnd.random()) for c in wall)
        b.box((0, 0, z + fh / 2), (w, d, fh), 'rubble' if (stone_ground and f == 0) else 'plaster')
        b.tint = (1, 1, 1)
        # floor-line summer beam + corner posts
        b.box((0, 0, z + 0.05), (w + 0.22, d + 0.22, 0.3), 'timber')
        for sx in (-1, 1):
            for sy in (-1, 1):
                b.box((sx * w / 2, sy * d / 2, z + fh / 2), (0.3, 0.3, fh), 'timber')
        if jet:   # corbel brackets carrying the jetty
            for i in range(int(w // 1.5)):
                x = -w / 2 + 0.7 + i * 1.5
                for sy in (-1, 1):
                    b.beam((x, sy * (D / 2 + 0.02), z - 0.42), (x, sy * (D / 2 + jet - 0.04), z - 0.02), 0.2, 0.2, 'timber')
        z += fh
    # walls features (skip stone ground floor frame)
    z = PL
    for f, (w, d, zf) in enumerate(dims):
        if stone_ground and f == 0:
            for side, L in (('front', w), ('back', w)):
                b.push(frame(side, w, d))
                n = max(1, int(round((L - 0.8) / 2.3)))
                bw = L / n
                for i in range(n):
                    cx = -L / 2 + (i + 0.5) * bw
                    if side == 'front' and i == n // 2:
                        door(b, cx, rnd, base=zf)
                    else:
                        window(b, cx, zf + fh * 0.55, rnd.random() < lit_p, shutter, False, rnd, 0.75, 1.05)
                b.pop()
            continue
        ground_door = (f == 0)
        for side, L in (('front', w), ('back', w), ('left', d), ('right', d)):
            wall_features(b, side, L, zf, fh, f, w, d, rnd, shutter, flowers_p, ground_door and side == 'front', lit_p)
    # roof
    top = PL + floors * fh
    wt, dt = dims[-1][0], dims[-1][1]
    rh = roof_h or (dt * 0.52 + 0.4)
    mat = 'thatch' if thatch else roof
    b.tint = (1, 1, 1)
    b.box((0, 0, top + 0.1), (wt + 0.28, dt + 0.28, 0.22), 'timber')                 # wall plate
    gable_roof(b, wt, dt, top + 0.2, rh, mat, tint=roof_tint, fill='plaster', fill_tint=wall, over=0.7 if thatch else 0.6)
    for i in range(dormers):
        x = (-wt / 4 + i * wt / 2) if dormers > 1 else 0
        dormer(b, x, -1, dt, top + 0.2, rh, mat, wall, shutter, rnd)
    chims = []
    for i in range(chim):
        cx_, cy_ = (-1 if i == 0 else 1) * wt * 0.3, dt * 0.08
        chimney(b, cx_, cy_, top + 0.2 + rh * 0.55, rh * 0.62 + 0.5, rnd, glow=False)
        chims.append((cx_, cy_, top + 0.2 + rh * 0.55 + rh * 0.62 + 0.9))
    if sign:
        z_sign = PL + fh * 0.95
        b.push(frame('front', W, D))
        x0 = W * 0.3
        b.beam((x0, 0.0, z_sign + 0.2), (x0, 1.3, z_sign + 0.2), 0.08, 0.1, 'iron')
        b.beam((x0, 0.15, z_sign + 0.0), (x0, 0.9, z_sign + 0.2), 0.05, 0.05, 'iron')
        for dy in (0.35, 1.15):
            b.beam((x0, dy, z_sign + 0.18), (x0, dy, z_sign - 0.12), 0.02, 0.02, 'iron')
        b.box((x0, 0.75, z_sign - 0.42), (0.09, 0.95, 0.7), 'wood')
        for s in (-1, 1):
            b.box((x0 + s * 0.055, 0.75, z_sign - 0.42), (0.02, 0.7, 0.45), sign)
            b.sph((x0 + s * 0.07, 0.75, z_sign - 0.42), 0.02, 0.14, 0.14, 'gold', 8, 5)
        b.pop()
    info = dict(W=W, D=D, top=top + 0.2 + rh, floors=floors, PL=PL, fh=fh, chims=chims,
                door_x=_door_x(W), lantern=(-(_door_x(W) + 1.175), -D / 2 - 0.55, PL + 2.25 - 0.32))
    if not finish:
        return b, info
    return b.build(), info


# ------------------------------------------------------------------ small props
def barrel(b, x, y, z=0.0, h=0.95, r=0.42, rnd=None):
    b.tint = (1, 1, 1)
    b.cyl((x, y, z + h / 2), r * 0.88, r * 0.88, h, 'wood', 10)
    b.cyl((x, y, z + h / 2), r, r, h * 0.45, 'wood', 10, cap=False)
    for dz in (0.2, 0.75):
        b.cyl((x, y, z + h * dz), r * 0.97, r * 0.97, 0.06, 'iron', 10, cap=False)


def crate(b, x, y, z, s, rz=0.0):
    b.tint = (1, 1, 1)
    b.box((x, y, z + s / 2), (s, s, s), 'wood', rz=rz)
    for sx in (-1, 1):
        b.box((x + math.cos(rz) * sx * s / 2, y + math.sin(rz) * sx * s / 2, z + s / 2), (0.07, s + 0.02, s + 0.02), 'timber', rz=rz)


def firewood(b, x, y, rot=0.0):
    b.tint = (1, 1, 1)
    b.push(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z'))
    for r_ in range(4):
        for i in range(6 - r_):
            b.cyl((-0.5 + r_ * 0.1 + i * 0.2, 0, 0.1 + r_ * 0.17), 0.09, 0.09, 0.5, 'timber', 6, rx=math.pi / 2)
    for sx in (-0.6, 0.6):
        b.box((sx, 0, 0.35), (0.07, 0.55, 0.7), 'wood')
    b.pop()


def hay(b, x, y, rz=0.0):
    b.tint = (0.95, 0.8, 0.4)
    b.cyl((x, y, 0.45), 0.45, 0.45, 0.9, 'vcol', 12, ry=math.pi / 2, rz=rz)


def bench(b, x, y, rz=0.0, L=1.6):
    b.tint = (1, 1, 1)
    b.push(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rz, 4, 'Z'))
    b.box((0, 0, 0.45), (L, 0.4, 0.07), 'wood')
    b.box((0, 0.2, 0.75), (L, 0.06, 0.4), 'wood')
    for sx in (-1, 1):
        b.box((sx * (L / 2 - 0.12), 0, 0.22), (0.09, 0.36, 0.45), 'iron')
        b.box((sx * (L / 2 - 0.12), 0.2, 0.55), (0.09, 0.06, 0.65), 'iron')
    b.pop()


def planter(b, x, y, r=0.55, plant=None, rnd=None):
    rnd = rnd or random
    b.tint = (1, 1, 1)
    b.cyl((x, y, 0.28), r, r * 0.8, 0.56, 'rubble', 10)
    b.tint = (0.3, 0.5, 0.22)
    b.sph((x, y, 0.62), r * 0.9, r * 0.9, 0.3, 'vcol', 8, 5)
    for i in range(7):
        a = rnd.random() * 6.28
        rr = rnd.random() * r * 0.7
        b.tint = rnd.choice(FLOWERS)
        b.sph((x + math.cos(a) * rr, y + math.sin(a) * rr, 0.85), 0.09, 0.09, 0.09, 'vcol', 6, 4)


def lamp_post(b, x, y, h=3.6):
    b.tint = (1, 1, 1)
    b.cyl((x, y, 0.3), 0.26, 0.2, 0.6, 'rubble', 8)
    b.cyl((x, y, h / 2), 0.07, 0.1, h, 'iron', 8)
    b.cyl((x, y, 1.2), 0.12, 0.12, 0.08, 'iron', 8)
    for s in (-1, 1):
        b.beam((x, y, h - 0.6), (x + s * 0.5, y, h - 0.1), 0.04, 0.04, 'iron')
    b.box((x, y, h + 0.05), (0.34, 0.34, 0.5), 'lantern')
    b.box((x, y, h - 0.24), (0.4, 0.4, 0.06), 'iron')
    b.cyl((x, y, h + 0.4), 0.3, 0.02, 0.22, 'iron', 4, rz=math.pi / 4)
    b.sph((x, y, h + 0.6), 0.06, 0.06, 0.06, 'iron', 6, 4)
    return (x, y, h + 0.05)


def banner_pole(b, x, y, mat, h=5.2):
    b.tint = (1, 1, 1)
    b.cyl((x, y, h / 2), 0.07, 0.08, h, 'iron', 6)
    b.sph((x, y, h + 0.05), 0.12, 0.12, 0.12, 'gold', 8, 5)
    b.beam((x, y, h - 0.5), (x, y + 0.9, h - 0.5), 0.05, 0.05, 'iron')
    b.box((x, y + 0.45, h - 1.6), (0.05, 0.85, 2.2), mat)
    b.poly([(x - 0.025, y + 0.02, h - 2.7), (x - 0.025, y + 0.87, h - 2.7), (x - 0.025, y + 0.45, h - 3.2)], mat, thick=0.05)
    b.box((x + 0.03, y + 0.45, h - 1.2), (0.02, 0.4, 0.4), 'gold')
