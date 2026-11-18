"""
Lobby world — part B: town buildings (houses, tavern, guild hall, smithy, chapel), market, props.
Positions are GAME coords (gx, gz); yaw is the Blender Z rotation (front = local -Y):
    south-facing (front toward +gz) = 0, west-facing = -pi/2, east-facing = +pi/2, north-facing = pi.
"""
import math
import random
from mathutils import Vector, Matrix

SOUTH, WEST, EAST, NORTH = 0.0, -math.pi / 2, math.pi / 2, math.pi


def to_world(loc_xy, gx, gz, yaw):
    """Building-local (x, y) -> game (gx, gz)."""
    x, y = loc_xy
    bx = gx + x * math.cos(yaw) - y * math.sin(yaw)
    by = -gz + x * math.sin(yaw) + y * math.cos(yaw)
    return bx, -by


def register_house(info, gx, gz, yaw, tag):
    bx, bz = to_world(info['lantern'][:2], gx, gz, yaw)
    LAYOUT['lights'].append({'n': tag + '_door', 'x': round(bx, 2), 'y': round(info['lantern'][2] + 0.3, 2), 'z': round(bz, 2),
                             'color': '#ffbf70', 'i': 5, 'd': 7})
    LAYOUT['halos'].append({'x': round(bx, 2), 'y': round(info['lantern'][2] + 0.3, 2), 'z': round(bz, 2), 'color': '#ffbf70', 's': 1.2})
    for (cx, cy, cz) in info['chims']:
        sx, sz = to_world((cx, cy), gx, gz, yaw)
        LAYOUT['smoke'].append({'x': round(sx, 2), 'y': round(cz, 2), 'z': round(sz, 2)})


def tint_wall(c, k=1.0):
    return tuple(min(1.0, x * k) for x in c)


# --------------------------------------------------------------------------- generic houses
def town_house(tag, gx, gz, yaw, W, D, floors, roof, wall, shutter, seed, **kw):
    b, info = house(tag, W, D, floors, roof=roof, wall=wall, shutter=shutter, seed=seed, finish=False, **kw)
    rnd = random.Random(seed + 100)
    # a little clutter beside every house: barrels / firewood / planters
    side = rnd.choice((-1, 1))
    if rnd.random() < 0.7:
        barrel(b, side * (W / 2 + 0.7), -D / 2 - 0.1, rnd=rnd); barrel(b, side * (W / 2 + 1.3), -D / 2 + 0.3, rnd=rnd)
    if rnd.random() < 0.55:
        firewood(b, -side * (W / 2 + 0.2), D / 2 - 0.8, rot=math.pi / 2)
    if rnd.random() < 0.6:
        planter(b, -side * (W / 2 - 0.6), -D / 2 - 0.8, rnd=rnd)
    return b, info


def finish_house(b, info, gx, gz, yaw, tag, W, D):
    o = b.build(loc=(gx, -gz, 0), rot=yaw)
    box_circles(gx, -gz, W + 0.5, D + 0.5, yaw, 0.92, tag)
    register_house(info, gx, gz, yaw, tag)
    return o


# --------------------------------------------------------------------------- tavern
def build_tavern(gx, gz, yaw):
    W, D = 11.0, 8.4
    b, info = house('Tavern', W, D, 2, roof='roof_terracotta', wall=(1.0, 0.9, 0.74), shutter='paint_green', seed=21, finish=False,
                    dormers=2, chim=2, sign='cloth_gold', flowers_p=0.6, fh=2.9, lit_p=0.9, roof_h=D * 0.62)
    rnd = random.Random(7)
    # outdoor seating in front of the door
    for i in range(3):
        x = -3.4 + i * 3.4
        b.tint = (1, 1, 1)
        b.cyl((x, -D / 2 - 2.6, 0.78), 0.7, 0.7, 0.07, 'wood', 14)
        b.cyl((x, -D / 2 - 2.6, 0.4), 0.09, 0.09, 0.8, 'timber', 8)
        b.cyl((x, -D / 2 - 2.6, 0.04), 0.4, 0.4, 0.06, 'timber', 8)
        for a in (0.3, 2.4, 4.3):
            sx, sy = x + math.cos(a) * 1.0, -D / 2 - 2.6 + math.sin(a) * 1.0
            b.cyl((sx, sy, 0.24), 0.26, 0.2, 0.48, 'wood', 8)
        for a in (1.0, 3.2):
            b.cyl((x + math.cos(a) * 0.3, -D / 2 - 2.6 + math.sin(a) * 0.3, 0.88), 0.07, 0.06, 0.14, 'brass', 8)
    for k in range(3):
        barrel(b, W / 2 + 0.7 + k * 0.1, -D / 2 + 0.2 + k * 0.85, rnd=rnd)
    barrel(b, W / 2 + 0.7, -D / 2 + 1.0, z=0.95, rnd=rnd)
    crate(b, -W / 2 - 0.8, -D / 2 + 0.4, 0, 0.8, 0.2); crate(b, -W / 2 - 0.8, -D / 2 + 1.3, 0, 0.7, -0.1); crate(b, -W / 2 - 0.8, -D / 2 + 0.6, 0.8, 0.6, 0.5)
    hay(b, -W / 2 - 1.3, D / 2 - 1.0)
    # string of lanterns across the front
    for i in range(5):
        x = -W / 2 + 1.2 + i * 2.15
        b.beam((x, -D / 2 - 0.1, 5.35), (x, -D / 2 - 0.9, 5.15), 0.04, 0.04, 'iron')
        b.box((x, -D / 2 - 0.9, 4.95), (0.2, 0.2, 0.3), 'lantern')
        LAYOUT['halos'].append({'x': to_world((x, -D / 2 - 0.9), gx, gz, yaw)[0], 'y': 5.0, 'z': to_world((x, -D / 2 - 0.9), gx, gz, yaw)[1],
                                'color': '#ffb060', 's': 1.1})
    finish_house(b, info, gx, gz, yaw, 'tavern', W, D)
    LAYOUT['lights'].append({'n': 'tavern_front', 'x': to_world((0, -D / 2 - 1.2), gx, gz, yaw)[0], 'y': 3.4,
                             'z': to_world((0, -D / 2 - 1.2), gx, gz, yaw)[1], 'color': '#ffa94d', 'i': 9, 'd': 11})


# --------------------------------------------------------------------------- guild hall (with tower)
def build_guildhall(gx, gz, yaw):
    W, D = 12.0, 8.6
    b, info = house('GuildHall', W, D, 2, roof='roof_slate', wall=(0.94, 0.9, 0.9), shutter='paint_blue', seed=33, finish=False,
                    dormers=2, chim=2, stone_ground=True, jetty=True, flowers_p=0.2, fh=3.0, lit_p=0.85, roof_h=D * 0.55)
    # square watch-tower on the back-left corner
    tx, ty = -W / 2 - 0.2, D / 2 - 0.5
    b.tint = (1, 1, 1)
    b.box((tx, ty, 6.5), (4.0, 4.0, 13.0), 'ashlar')
    for s in (-1, 1):
        for t in (-1, 1):
            b.box((tx + s * 2.0, ty + t * 2.0, 6.5), (0.55, 0.55, 13.0), 'ashlar_dark')
    b.box((tx, ty, 13.2), (4.7, 4.7, 0.5), 'ashlar_dark')
    for i in range(8):                                                           # battlements
        for s, t in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if t == 0:
                b.box((tx + s * 2.3, ty - 1.6 + i * 0.46, 13.9), (0.5, 0.4, 0.9), 'ashlar')
            else:
                b.box((tx - 1.6 + i * 0.46, ty + t * 2.3, 13.9), (0.4, 0.5, 0.9), 'ashlar')
    b.cyl((tx, ty, 16.4), 3.3, 0.0, 4.8, 'roof_slate', 4, rz=math.pi / 4)
    b.beam((tx, ty, 18.5), (tx, ty, 20.2), 0.07, 0.07, 'iron')
    b.box((tx + 0.55, ty, 19.9), (1.0, 0.04, 0.55), 'cloth_blue')
    for z in (5.0, 8.5, 11.3):
        for sgn in (-1, 1):
            b.box((tx, ty + sgn * 2.02, z), (0.7, 0.1, 1.5), 'glass_lit')
            b.box((tx + sgn * 2.02, ty, z), (0.1, 0.7, 1.5), 'glass_lit')
    # banner poles flanking the door
    for s in (-1, 1):
        banner_pole(b, s * 3.2, -D / 2 - 1.8, 'cloth_blue' if s < 0 else 'cloth_gold', h=4.6)
    finish_house(b, info, gx, gz, yaw, 'guildhall', W, D)
    box_circles(*(lambda p: (p[0], -p[1]))(to_world((tx, ty), gx, gz, yaw)), 4.0, 4.0, yaw, 0.95, 'guild_tower')


# --------------------------------------------------------------------------- smithy
def build_smithy(gx, gz, yaw):
    W, D = 8.8, 7.2
    b = B('Smithy', 'Buildings')
    b.tint = (1, 1, 1)
    b.box((0, 0, 0.1), (W, D, 0.2), 'cobble2')
    b.box((0, D / 2 - 0.35, 2.3), (W, 0.7, 4.2), 'rubble')
    b.box((-W / 2 + 0.35, 0, 2.3), (0.7, D, 4.2), 'rubble')
    b.box((W / 2 - 0.35, D / 4, 0.8), (0.7, D / 2, 1.2), 'rubble')
    for x, y in ((W / 2 - 0.2, -D / 2 + 0.2), (0, -D / 2 + 0.2), (-W / 2 + 0.3, -D / 2 + 0.3), (W / 2 - 0.2, 0.3)):
        b.box((x, y, 2.3), (0.4, 0.4, 4.2), 'timber')
    b.box((0, -D / 2 + 0.2, 4.35), (W + 0.3, 0.5, 0.42), 'timber')
    b.box((W / 2 - 0.2, 0, 4.35), (0.5, D, 0.42), 'timber')
    gable_roof(b, W, D, 4.45, 2.3, 'roof_slate', over=0.8, fill='rubble')
    # forge + tall chimney
    fx, fy = W / 2 - 1.5, D / 2 - 1.3
    b.box((fx, fy, 0.75), (2.3, 1.8, 1.1), 'rubble')
    b.box((fx, fy, 1.4), (2.0, 1.5, 0.3), 'iron')
    b.sph((fx, fy - 0.1, 1.62), 0.7, 0.5, 0.2, 'flame', 8, 5)
    b.cyl((fx, fy + 0.1, 3.0), 1.2, 0.5, 2.4, 'rubble', 4, rz=math.pi / 4)
    b.box((fx, fy + 0.5, 6.0), (1.1, 1.1, 6.0), 'rubble')
    b.box((fx, fy + 0.5, 9.1), (1.4, 1.4, 0.25), 'rubble')
    LAYOUT['lights'].append({'n': 'forge', 'x': to_world((fx, fy - 0.5), gx, gz, yaw)[0], 'y': 1.8, 'z': to_world((fx, fy - 0.5), gx, gz, yaw)[1],
                             'color': '#ff7a3a', 'i': 12, 'd': 9})
    LAYOUT['halos'].append({'x': to_world((fx, fy - 0.3), gx, gz, yaw)[0], 'y': 1.7, 'z': to_world((fx, fy - 0.3), gx, gz, yaw)[1], 'color': '#ff7a3a', 's': 2.2})
    LAYOUT['smoke'].append({'x': to_world((fx, fy + 0.5), gx, gz, yaw)[0], 'y': 9.4, 'z': to_world((fx, fy + 0.5), gx, gz, yaw)[1]})
    # anvil on a stump, quench trough, grindstone, bellows, weapon rack
    b.cyl((-0.8, 0.2, 0.4), 0.4, 0.45, 0.8, 'wood', 10)
    b.box((-0.8, 0.2, 0.95), (1.0, 0.36, 0.22), 'iron'); b.box((-0.8, 0.2, 0.78), (0.4, 0.3, 0.2), 'iron')
    b.cyl((-1.5, 0.2, 0.95), 0.0, 0.15, 0.5, 'iron', 6, ry=math.pi / 2)
    b.box((-2.8, -1.4, 0.35), (1.9, 0.7, 0.6), 'wood'); b.box((-2.8, -1.4, 0.62), (1.7, 0.5, 0.06), 'water')
    b.cyl((-3.2, 2.2, 0.55), 0.55, 0.55, 0.16, 'rubble', 14, ry=math.pi / 2)
    b.box((-3.2, 2.2, 0.28), (0.15, 0.9, 0.55), 'timber')
    b.box((fx - 2.3, fy - 0.2, 0.6), (0.9, 0.5, 0.5), 'wood'); b.cyl((fx - 2.7, fy - 0.2, 0.6), 0.04, 0.25, 0.7, 'iron', 6, ry=math.pi / 2)
    for i in range(5):
        x = -W / 2 + 1.4 + i * 0.55
        b.beam((x, D / 2 - 0.8, 3.7), (x, D / 2 - 0.8, 1.6), 0.07, 0.03, 'iron')
        b.box((x, D / 2 - 0.8, 3.65), (0.35, 0.05, 0.07), 'brass')
        b.box((x, D / 2 - 0.8, 3.45), (0.1, 0.07, 0.4), 'wood')
    b.box((-W / 2 + 2.2, D / 2 - 0.85, 3.8), (3.2, 0.09, 0.12), 'timber')
    b.tint = (0.05, 0.05, 0.06)
    b.ico((-3.3, -2.8, 0.25), 0.55, 'vcol', 1, (1.4, 1, 0.7))
    b.tint = (1, 1, 1)
    for i in range(3):
        barrel(b, -W / 2 - 0.8, -1 + i * 0.9)
    crate(b, W / 2 + 0.9, -D / 2 + 0.6, 0, 0.8)
    b.push(Matrix.Translation((W / 2 - 0.5, -D / 2 - 1.2, 0)))
    b.beam((0, 0, 3.0), (0, 1.5, 3.0), 0.07, 0.09, 'iron')
    b.box((0, 1.0, 2.35), (0.08, 1.0, 0.7), 'wood'); b.box((0.05, 1.0, 2.35), (0.03, 0.55, 0.35), 'gold')
    b.pop()
    b.build(loc=(gx, -gz, 0), rot=yaw)
    box_circles(gx, -gz, W - 1.8, D - 1.0, yaw, 0.95, 'smithy')


# --------------------------------------------------------------------------- chapel
def build_chapel(gx, gz, yaw):
    W, D = 7.4, 11.0
    b = B('Chapel', 'Buildings')
    b.tint = (1, 1, 1)
    PL = 0.6
    b.box((0, 0, PL / 2 - 0.05), (W + 0.5, D + 0.5, PL + 0.1), 'rubble')
    H = 5.4
    b.tint = (1.0, 0.97, 0.9)
    b.box((0, 0, PL + H / 2), (W, D, H), 'ashlar')
    b.tint = (1, 1, 1)
    for sx in (-1, 1):                                              # buttresses + pointed stained-glass windows
        for i in range(4):
            y = -D / 2 + 1.4 + i * (D - 2.8) / 3
            b.box((sx * (W / 2 + 0.3), y, PL + H / 2 - 0.3), (0.6, 0.7, H - 0.6), 'ashlar_dark')
            b.box((sx * (W / 2 + 0.3), y, PL + H - 0.2), (0.75, 0.85, 0.25), 'ashlar_dark')
        for i in range(3):
            y = -D / 2 + 2.45 + i * (D - 2.8) / 3
            gm = ('glass_blue', 'glass_red', 'glass_gold')[(i + (0 if sx < 0 else 1)) % 3]
            b.box((sx * (W / 2 + 0.03), y, PL + 2.6), (0.12, 1.0, 2.5), gm)
            b.poly([(sx * (W / 2 + 0.03), y - 0.5, PL + 3.85), (sx * (W / 2 + 0.03), y + 0.5, PL + 3.85), (sx * (W / 2 + 0.03), y, PL + 4.6)], gm, thick=sx * 0.12)
            b.box((sx * (W / 2 + 0.06), y, PL + 2.6), (0.14, 1.2, 2.7), 'ashlar_dark') if False else None
            b.box((sx * (W / 2 + 0.08), y - 0.58, PL + 2.9), (0.12, 0.12, 3.3), 'ashlar_dark')
            b.box((sx * (W / 2 + 0.08), y + 0.58, PL + 2.9), (0.12, 0.12, 3.3), 'ashlar_dark')
    # roof + front gable
    b.push(Matrix.Rotation(math.pi / 2, 4, 'Z'))          # ridge runs along the nave (Y)
    gable_roof(b, D, W, PL + H, 3.9, 'roof_slate', over=0.5, gover=0.35, fill='ashlar')
    b.pop()
    b.tint = (1, 1, 1)
    # front door (arched) + rose window
    b.push(frame('front', W, D))
    door(b, 0, random.Random(3), w=1.9, h=2.9, base=PL)
    for i in range(11):
        a = math.pi * i / 10
        b.box((math.cos(a) * 1.35, 0.0, PL + 2.9 + math.sin(a) * 1.0), (0.4, 0.3, 0.42), 'ashlar_dark', ry=math.pi / 2 - a)
    b.cyl((0, 0.05, PL + H + 1.5), 0.95, 0.95, 0.16, 'glass_red', 20, rx=math.pi / 2)
    for k in range(8):
        a = k * math.pi / 4
        b.beam((0, 0.14, PL + H + 1.5), (math.cos(a) * 0.95, 0.14, PL + H + 1.5 + math.sin(a) * 0.95), 0.06, 0.05, 'ashlar_dark')
    b.pop()
    # bell tower behind the nave
    ty = D / 2 + 1.2
    b.tint = (1, 1, 1)
    b.box((0, ty, PL + 7.5), (4.4, 4.4, 15.0), 'ashlar')
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box((sx * 2.2, ty + sy * 2.2, PL + 7.5), (0.6, 0.6, 15.0), 'ashlar_dark')
            b.cyl((sx * 2.2, ty + sy * 2.2, PL + 16.0), 0.0, 0.34, 1.6, 'roof_teal', 4, rz=math.pi / 4)
    b.box((0, ty, PL + 12.0), (4.0, 4.0, 3.0), 'ashlar_dark')
    for s, t in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for j in (-0.9, 0.9):
            if t == 0:
                b.box((s * 2.02, ty + j, PL + 12.0), (0.12, 1.1, 2.4), 'glass_dark')
            else:
                b.box((j, ty + t * 2.02, PL + 12.0), (1.1, 0.12, 2.4), 'glass_dark')
    b.cyl((0, ty, PL + 11.4), 0.55, 0.78, 1.1, 'brass', 12)                         # the bell
    b.cyl((0, ty, PL + 16.0), 3.4, 0.0, 6.0, 'roof_teal', 4, rz=math.pi / 4)           # spire
    b.cyl((0, ty, PL + 17.8), 0.07, 0.07, 3.2, 'gold', 6)
    b.box((0, ty, PL + 19.2), (0.8, 0.07, 0.07), 'gold'); b.box((0, ty, PL + 19.0), (0.07, 0.07, 1.0), 'gold')
    for z in (4.5, 8.0):
        for sgn in (-1, 1):
            b.box((0, ty + sgn * 2.22, PL + z), (0.7, 0.1, 1.8), 'glass_gold')
    # gravestones in the yard + a lych-gate lantern
    rnd = random.Random(9)
    for i in range(9):
        x = (W / 2 + 2.2 + (i % 3) * 1.4) * (1 if i % 2 else -1)
        y = -D / 2 + 1.0 + (i // 3) * 2.2
        b.tint = (0.75, 0.75, 0.78)
        b.box((x, y, 0.45), (0.55, 0.14, 0.9), 'rubble', rz=rnd.uniform(-0.2, 0.2))
        b.sph((x, y, 0.9), 0.28, 0.07, 0.2, 'rubble', 8, 5)
    b.tint = (1, 1, 1)
    b.build(loc=(gx, -gz, 0), rot=yaw)
    box_circles(gx, -gz, W + 0.6, D + 0.6, yaw, 0.92, 'chapel')
    bx, bz = to_world((0, ty), gx, gz, yaw)
    box_circles(bx, -bz, 4.6, 4.6, yaw, 0.95, 'bell_tower')
    LAYOUT['lights'].append({'n': 'chapel_door', 'x': to_world((0, -D / 2 - 0.6), gx, gz, yaw)[0], 'y': 3.2, 'z': to_world((0, -D / 2 - 0.6), gx, gz, yaw)[1],
                             'color': '#ffd08a', 'i': 6, 'd': 8})


# --------------------------------------------------------------------------- market + street furniture
def stall(name, gx, gz, yaw, mat_a, mat_b, goods):
    b = B(name, 'Props')
    rnd = random.Random(hash(name) & 0xffff)
    b.tint = (1, 1, 1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl((sx * 1.55, sy * 0.95, 1.4), 0.07, 0.07, 2.8, 'timber', 6)
    b.box((0, -0.95, 0.5), (3.3, 0.8, 1.0), 'wood'); b.box((0, -0.95, 1.03), (3.5, 1.0, 0.09), 'timber')
    b.box((0, 0.95, 1.6), (3.2, 0.12, 3.0), 'wood')
    for j in range(3):
        b.box((0, 0.88, 0.9 + j * 0.62), (3.0, 0.4, 0.06), 'timber')
    n = 8
    for i in range(n):                                                  # striped canopy
        x = -1.75 + (i + 0.5) * 3.5 / n
        b.beam((x, 1.1, 3.0), (x, -1.45, 2.55), 3.5 / n * 0.98, 0.05, mat_a if i % 2 else mat_b)
        b.poly([(x - 3.5 / n / 2, -1.45, 2.55), (x + 3.5 / n / 2, -1.45, 2.55), (x, -1.45, 2.2)], mat_a if i % 2 else mat_b, thick=0.03)
    for k in range(goods):
        x = -1.35 + k * 0.9
        b.tint = [(0.85, 0.15, 0.12), (0.95, 0.75, 0.15), (0.45, 0.7, 0.2), (0.9, 0.5, 0.15)][k % 4]
        b.box((x, -0.95, 1.2), (0.7, 0.6, 0.18), 'wood') if False else None
        for a in range(6):
            b.sph((x + rnd.uniform(-0.2, 0.2), -0.95 + rnd.uniform(-0.15, 0.15), 1.22 + 0.1 * (a % 3)), 0.11, 0.11, 0.11, 'vcol', 6, 4)
        b.tint = (1, 1, 1)
        b.box((x, -0.95, 1.14), (0.7, 0.55, 0.1), 'wood')
    b.tint = (0.82, 0.7, 0.45)
    for i in range(2):
        b.cyl((1.6 + i * 0.45, -1.8, 0.4), 0.28, 0.3, 0.8, 'vcol', 8); b.sph((1.6 + i * 0.45, -1.8, 0.82), 0.15, 0.15, 0.1, 'vcol', 6, 4)
    b.tint = (1, 1, 1)
    b.box((-1.3, 0.5, 1.25), (0.5, 0.4, 0.4), 'wood'); b.box((-0.7, 0.5, 1.2), (0.4, 0.4, 0.3), 'wood')
    b.build(loc=(gx, -gz, 0), rot=yaw)
    box_circles(gx, -gz, 3.4, 2.3, yaw, 0.85, name)


def build_well(gx, gz):
    b = B('Well', 'Props')
    b.tint = (1, 1, 1)
    b.cyl((0, 0, 0.55), 1.25, 1.25, 1.1, 'rubble', 20)
    b.cyl((0, 0, 1.08), 1.0, 1.0, 0.05, 'glass_dark', 20)
    annulus(b, 0.95, 1.4, 1.12, 'ashlar', seg=20, rings=1)
    for s in (-1, 1):
        b.box((s * 1.15, 0, 2.0), (0.22, 0.22, 3.0), 'timber')
        b.beam((s * 1.15, -0.2, 3.3), (s * 0.8, 0, 3.8), 0.1, 0.1, 'timber')
    b.cyl((0, 0, 2.5), 0.12, 0.12, 2.5, 'timber', 8, ry=math.pi / 2)
    b.cyl((0.8, 0, 2.5), 0.18, 0.18, 0.4, 'wood', 8, ry=math.pi / 2)
    b.beam((0, 0, 2.5), (0, 0, 1.35), 0.025, 0.025, 'cloth_cream')
    b.cyl((0, 0, 1.25), 0.22, 0.18, 0.3, 'wood', 10)
    gable_roof(b, 3.2, 2.2, 3.4, 1.0, 'roof_terracotta', over=0.35, gover=0.3)
    b.build(loc=(gx, -gz, 0), rot=0.4)
    add_col(gx, gz, 1.35, 'well')


def build_signpost(gx, gz):
    b = B('Signpost', 'Props')
    b.tint = (1, 1, 1)
    b.cyl((0, 0, 1.7), 0.1, 0.12, 3.4, 'timber', 8)
    b.cyl((0, 0, 3.45), 0.17, 0.0, 0.3, 'timber', 8)
    for i, (mat, a, w) in enumerate((('wood', 0.3, 1.5), ('paint_red', -0.5, 1.3), ('paint_blue', 0.9, 1.4))):
        z = 3.0 - i * 0.6
        b.box((0.6 * math.cos(a), 0.6 * math.sin(a), z), (w, 0.07, 0.4), mat, rz=a)
        b.poly([(1.35 * math.cos(a) + 0.2 * math.sin(a) * 0, 1.35 * math.sin(a), z - 0.2),
                (1.35 * math.cos(a), 1.35 * math.sin(a), z + 0.2),
                (1.65 * math.cos(a), 1.65 * math.sin(a), z)], mat, thick=0.07)
    b.build(loc=(gx, -gz, 0))
    add_col(gx, gz, 0.2, 'signpost')


def build_noticeboard(gx, gz, yaw):
    b = B('NoticeBoard', 'Props')
    b.tint = (1, 1, 1)
    for s in (-1, 1):
        b.box((s * 1.1, 0, 1.4), (0.14, 0.14, 2.8), 'timber')
    b.box((0, 0.04, 1.8), (2.5, 0.1, 1.5), 'wood')
    b.box((0, 0, 2.7), (2.8, 0.3, 0.12), 'timber')
    gable_roof(b, 2.9, 0.8, 2.75, 0.5, 'roof_terracotta', over=0.2, gover=0.1, thick=0.08)
    rnd = random.Random(4)
    for i in range(7):
        b.tint = (0.9, 0.85, 0.7)
        b.box((-0.9 + (i % 4) * 0.6, -0.04, 1.5 + (i // 4) * 0.6), (0.4, 0.02, 0.5), 'vcol', rz=0, rx=rnd.uniform(-0.1, 0.1))
    b.build(loc=(gx, -gz, 0), rot=yaw)
    add_col(gx, gz, 1.3, 'noticeboard')


def build_street_furniture():
    cx, cy = PLAZA[0], -PLAZA[1]
    # benches facing the fountain
    b = B('Benches', 'Props')
    for ang in (125, 215, 238, 302, 325):
        a = math.radians(ang)
        x, y = cx + math.cos(a) * 11.6, cy + math.sin(a) * 11.6
        bench(b, x, y, rz=a - math.pi / 2, L=2.0)
    for ang in (270,):
        pass
    b.build()
    # lamp posts on the kerb ring and along the streets (skip road corridors + gateways)
    lb = B('Lamps', 'Props')
    cand = []
    for k in range(16):
        a = math.radians(k * 22.5 + 11.25)
        cand.append((cx + math.cos(a) * 14.2, cy + math.sin(a) * 14.2))
    for gx_ in (-9, 9):
        for gz_ in (22, 30, 38):
            cand.append((gx_ * 0 + (3.9 if gx_ > 0 else -3.9), -gz_))
    for gx_ in (20, 30, 40):
        cand.append((gx_, cy + 2.3)); cand.append((-gx_, cy + 2.3))
    for (x, y) in cand:
        gx, gz = x, -y
        if abs(x) < 4.4 and y > 12:   # castle road
            continue
        if abs(x) < 4.4 and y < -9 and math.hypot(x, y - cy) > 13.2 and False:
            continue
        if math.hypot(x - 0, y - 14) < 3.4 or math.hypot(x - 8, y - 14) < 3.4:   # portal gates
            continue
        if any(math.hypot(x - f['x'], y - f['y']) < max(f['W'], f['D']) * 0.6 + 0.8 for f in LAYOUT['footprints']):
            continue
        top = lamp_post(lb, x, y, 3.7)
        LAYOUT['lamps'].append({'x': round(gx, 2), 'y': round(top[2], 2), 'z': round(gz, 2)})
    lb.build()
    # banners on the plaza kerb (between lamps)
    bb = B('PlazaBanners', 'Props')
    for k, ang in enumerate(range(0, 360, 45)):
        a = math.radians(ang + 22.5)
        x, y = cx + math.cos(a) * 13.9, cy + math.sin(a) * 13.9
        if abs(x) < 4.4 and y > 12:
            continue
        if math.hypot(x - 0, y - 14) < 3.6 or math.hypot(x - 8, y - 14) < 3.6:
            continue
        banner_pole(bb, x, y, ('cloth_red', 'cloth_blue', 'cloth_gold', 'cloth_green')[k % 4])
    bb.build()
    # festive bunting strung across the south street
    bg = B('Bunting', 'Props')
    for gz_ in (24, 34):
        y = -gz_
        for s in (-1, 1):
            bg.tint = (1, 1, 1)
            bg.cyl((s * 4.2, y, 2.4), 0.08, 0.1, 4.8, 'timber', 6)
        n = 14
        mats = ('cloth_red', 'cloth_gold', 'cloth_blue', 'cloth_green', 'cloth_cream')
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            def pt(t):
                return (-4.2 + 8.4 * t, y, 4.7 - 0.7 * math.sin(math.pi * t))
            p0, p1 = pt(t0), pt(t1)
            bg.beam(p0, p1, 0.02, 0.02, 'cloth_cream')
            m = ((p0[0] + p1[0]) / 2, y, (p0[2] + p1[2]) / 2)
            bg.poly([(p0[0] + 0.05, y, p0[2]), (p1[0] - 0.05, y, p1[2]), (m[0], y, m[2] - 0.5)], mats[i % 5], thick=0.02)
    bg.build()


def build_town_buildings():
    rnd = random.Random(2)
    build_tavern(17.5, -20.5, SOUTH)
    build_guildhall(-17.5, -20.5, SOUTH)
    build_smithy(22.0, 0.5, WEST)
    build_chapel(-24.0, 4.0, EAST)

    # (tag, gx, gz, yaw, W, D, floors, roof, wall, shutter, seed, extra kwargs)
    homes = [
        ('house_e1', 22.0, -9.5, WEST, 7.4, 6.0, 2, 'roof_teal', (1.0, 0.86, 0.62), 'paint_red', 11, {'dormers': 1}),
        ('house_e2', 22.0, 11.5, WEST, 7.2, 6.2, 2, 'roof_terracotta', (0.98, 0.82, 0.8), 'paint_blue', 12, {'dormers': 1}),
        ('house_e3', 22.5, 23.0, WEST, 6.6, 5.6, 2, 'roof_slate', (0.9, 0.92, 0.82), 'paint_green', 13, {'dormers': 1, 'sign': 'cloth_red'}),
        ('house_w1', -21.5, -10.5, EAST, 7.0, 6.0, 2, 'roof_slate', (0.86, 0.9, 0.8), 'paint_red', 14, {'dormers': 1}),
        ('house_w2', -21.5, 15.0, EAST, 6.4, 5.4, 2, 'thatch', (1.0, 0.9, 0.7), 'paint_green', 15, {'thatch': True, 'dormers': 0, 'jetty': False, 'chim': 1}),
        ('house_w3', -22.0, 25.0, EAST, 6.6, 5.6, 2, 'roof_terracotta', (0.95, 0.86, 0.7), 'paint_blue', 16, {'dormers': 1}),
        ('house_s1', 12.5, 20.0, NORTH, 7.4, 6.0, 2, 'roof_terracotta', (1.0, 0.9, 0.72), 'paint_green', 17, {'dormers': 1, 'sign': 'cloth_blue'}),
        ('house_s2', -12.0, 20.5, NORTH, 7.2, 6.0, 2, 'roof_teal', (0.96, 0.84, 0.74), 'paint_red', 18, {'dormers': 1}),
        ('house_s3', 12.0, 31.0, NORTH, 6.6, 5.6, 2, 'thatch', (0.98, 0.88, 0.68), 'paint_blue', 19, {'thatch': True, 'dormers': 0, 'jetty': False, 'chim': 1}),
        ('house_s4', -12.0, 32.0, NORTH, 7.0, 5.8, 2, 'roof_slate', (0.92, 0.9, 0.86), 'paint_green', 20, {'dormers': 1}),
    ]
    for (tag, gx, gz, yaw, W, D, fl, roof, wall, shut, seed, kw) in homes:
        yaw_j = yaw + rnd.uniform(-0.04, 0.04)
        b, info = town_house(tag, gx, gz, yaw_j, W, D, fl, roof, wall, shut, seed, **kw)
        finish_house(b, info, gx, gz, yaw_j, tag, W, D)


def build_market():
    stall('Stall_A', -9.6, 6.6, math.pi, 'cloth_red', 'cloth_cream', 4)
    stall('Stall_B', 9.8, 8.0, math.pi, 'cloth_blue', 'cloth_cream', 4)
    stall('Stall_C', -9.2, 22.0, math.pi / 2, 'cloth_green', 'cloth_cream', 3)
    build_well(-5.6, 16.5)
    build_signpost(4.2, 14.0)
    build_noticeboard(-4.2, 10.5, math.pi)
    # clutter near the stalls
    c = B('MarketClutter', 'Props')
    rnd = random.Random(8)
    for (x, y, n) in ((-12.6, -6.0, 3), (12.8, -8.9, 2), (-6.6, -22.5, 3), (8.0, -23.0, 2)):
        for i in range(n):
            crate(c, x + (i % 2) * 0.9, y - (i // 2) * 0.9, 0, rnd.uniform(0.7, 0.95), rnd.uniform(-0.3, 0.3))
        barrel(c, x - 1.1, y + 0.3, rnd=rnd)
    hay(c, -3.4, -25.0); hay(c, 3.4, -25.0, rz=0.4)
    c.build()
