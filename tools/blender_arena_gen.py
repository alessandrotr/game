"""
Blender Arena Generator — Gladiator Colosseum
==============================================
Blender 4.x Python script that procedurally generates a Roman gladiator arena
with all 30 numbered elements from the reference floor plan.

Usage
-----
  1. Open Blender 4.x
  2. Switch to the **Scripting** workspace
  3. Click **Open** → select this file → click **Run Script**

  OR from command line::

      blender --python blender_arena_gen.py

After running, use the export helpers from Blender's Python console::

    import bpy
    # The script registers two operators you can also call directly:
    export_arena_shell("C:/output/")
    export_individual_pieces("C:/output/")

Coordinate system (Blender default, Z-up):
  * Z = height (up)
  * X = East / West
  * Y = North / South
  * Arena centre = world origin (0, 0, 0)
  * The GLTF exporter converts Z-up → Y-up automatically.
"""

from __future__ import annotations

import bpy
import bmesh
import math
import os
from mathutils import Vector

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CONFIGURATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARENA_RADIUS = 25.0             # Outer wall radius (matches ARENA_HALF_SIZE)
WALL_THICKNESS = 1.5            # Radial wall thickness
WALL_HEIGHT = 6.0               # Wall height
INNER_WALL_R = ARENA_RADIUS - WALL_THICKNESS  # 23.5

SEAT_ROWS = 4                   # Number of spectator seating tiers
SEAT_DEPTH = 0.8                # Radial depth per row
SEAT_STEP_H = 0.5               # Height step per row

# Inner edge of the lowest seat row = start of the arena floor
FLOOR_RADIUS = INNER_WALL_R - SEAT_ROWS * SEAT_DEPTH  # ≈ 20.3

PARAPET_H = 1.0                 # Low wall between arena floor and seating
PARAPET_T = 0.25                # Parapet thickness

GATE_WIDTH = 4.0                # Opening width
GATE_HEIGHT = 5.0               # Opening height

CROSS_W = 3.0                   # Width of the cross pathways
CROSS_LEN = 13.0                # Arm length from centre

DAIS_R1 = 4.5                   # Outer dais radius
DAIS_R2 = 3.0                   # Inner (raised) dais radius
DAIS_H1 = 0.12                  # Outer tier height
DAIS_H2 = 0.25                  # Inner tier height

SEG = 48                        # Default cylinder resolution

# Gate angles (standard math convention: counter-clockwise from +X)
_G = {
    'East':  0.0,
    'North': math.pi / 2,
    'West':  math.pi,
    'South': 3 * math.pi / 2,
}
# Half-angle that each gate opening subtends on the circle
GATE_HALF_A = math.atan2(GATE_WIDTH / 2 + 0.5, INNER_WALL_R)

# Pre-compute arc ranges between gates (wall segments with gaps for gates)
_SORTED_GATE_ANGLES = sorted(_G.values())

def _arc_ranges() -> list[tuple[float, float]]:
    """Return (start, end) angle pairs for the 4 wall arc segments."""
    arcs: list[tuple[float, float]] = []
    g = _SORTED_GATE_ANGLES
    for i in range(4):
        s = g[i] + GATE_HALF_A
        e = g[(i + 1) % 4] - GATE_HALF_A
        if e <= s:
            e += 2 * math.pi
        arcs.append((s, e))
    return arcs

ARC_RANGES = _arc_ranges()

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# UTILITY FUNCTIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def clear_scene():
    """Wipe every object, mesh, material, and custom collection."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras):
        for item in block:
            block.remove(item)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    # Reset active collection to scene root
    bpy.context.view_layer.active_layer_collection = (
        bpy.context.view_layer.layer_collection
    )


def col_get(name: str):
    """Get-or-create a collection linked to the scene."""
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def col_move(obj, target):
    """Move *obj* into *target* collection, unlinking from everywhere else."""
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    target.objects.link(obj)


def hex_rgba(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip('#')
    return (int(h[0:2], 16) / 255,
            int(h[2:4], 16) / 255,
            int(h[4:6], 16) / 255,
            1.0)


def mat_pbr(name, color, roughness=0.5, metallic=0.0,
            emission=None, emission_str=0.0):
    """Create a Principled-BSDF material."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (
        hex_rgba(color) if isinstance(color, str) else color
    )
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        ec = hex_rgba(emission) if isinstance(emission, str) else emission
        bsdf.inputs['Emission Color'].default_value = ec
        bsdf.inputs['Emission Strength'].default_value = emission_str
    return m


def mat_assign(obj, m):
    if obj.data.materials:
        obj.data.materials[0] = m
    else:
        obj.data.materials.append(m)


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def _ensure_active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def join(objects: list, name: str):
    """Join *objects* into a single object named *name*."""
    if not objects:
        return None
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    r = bpy.context.active_object
    r.name = name
    return r


# ── primitive helpers ──

def _box(name, sx, sy, sz, loc=(0, 0, 0)):
    """Create a box whose *bottom* centre sits at *loc*."""
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(loc[0], loc[1], loc[2] + sz / 2),
    )
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return o


def _cyl(name, r, h, segs=24, loc=(0, 0, 0)):
    """Cylinder with bottom at *loc*."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=r, depth=h, vertices=segs,
        location=(loc[0], loc[1], loc[2] + h / 2),
    )
    o = bpy.context.active_object
    o.name = name
    return o


def _cone(name, r, h, segs=16, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        radius1=r, radius2=0, depth=h, vertices=segs,
        location=(loc[0], loc[1], loc[2] + h / 2),
    )
    o = bpy.context.active_object
    o.name = name
    return o


def _disk(name, r, segs=48, loc=(0, 0, 0)):
    """Flat disc (circle with ngon fill)."""
    bpy.ops.mesh.primitive_circle_add(
        radius=r, vertices=segs, fill_type='NGON',
        location=loc,
    )
    o = bpy.context.active_object
    o.name = name
    return o


def _sphere(name, r, segs=16, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=r, segments=segs, ring_count=segs // 2,
        location=loc,
    )
    o = bpy.context.active_object
    o.name = name
    return o


def _torus(name, major_r, minor_r, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_r, minor_radius=minor_r,
        major_segments=32, minor_segments=12,
        location=loc,
    )
    o = bpy.context.active_object
    o.name = name
    return o


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ARC SEGMENT BUILDER  (avoids Booleans for the wall / seating)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _arc_seg(name: str, ri: float, ro: float, h: float,
             a0: float, a1: float, n: int = 16, z0: float = 0.0):
    """Solid arc (section of a thick-walled cylinder).

    Parameters
    ----------
    ri, ro : inner / outer radius
    h      : height
    a0, a1 : start / end angle (radians, CCW)
    n      : number of angular subdivisions
    z0     : base z offset
    """
    bm = bmesh.new()
    angles = [a0 + (a1 - a0) * i / n for i in range(n + 1)]

    bi, bo, ti, to_ = [], [], [], []
    for a in angles:
        c, s = math.cos(a), math.sin(a)
        bi.append(bm.verts.new((ri * c, ri * s, z0)))
        bo.append(bm.verts.new((ro * c, ro * s, z0)))
        ti.append(bm.verts.new((ri * c, ri * s, z0 + h)))
        to_.append(bm.verts.new((ro * c, ro * s, z0 + h)))

    for i in range(n):
        bm.faces.new([bo[i], bo[i + 1], to_[i + 1], to_[i]])     # outer
        bm.faces.new([bi[i + 1], bi[i], ti[i], ti[i + 1]])        # inner
        bm.faces.new([to_[i], to_[i + 1], ti[i + 1], ti[i]])      # top
        bm.faces.new([bi[i], bi[i + 1], bo[i + 1], bo[i]])        # bottom

    # end-caps
    bm.faces.new([bi[0], bo[0], to_[0], ti[0]])
    bm.faces.new([bo[-1], bi[-1], ti[-1], to_[-1]])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MATERIALS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_materials() -> dict:
    return {
        'sand':        mat_pbr('Sand',        '#C4A96A', roughness=0.92),
        'sand_dark':   mat_pbr('Sand_Dark',   '#A08B55', roughness=0.95),
        'stone':       mat_pbr('Stone_Light', '#B0A89A', roughness=0.72),
        'stone_dk':    mat_pbr('Stone_Dark',  '#7A7268', roughness=0.78),
        'stone_w':     mat_pbr('Stone_White', '#D8D0C0', roughness=0.60),
        'gold':        mat_pbr('Gold_Ornate', '#C9A54E', roughness=0.30, metallic=0.70),
        'wood':        mat_pbr('Wood_Brown',  '#6B4226', roughness=0.82),
        'iron':        mat_pbr('Iron_Dark',   '#3A3A3C', roughness=0.50, metallic=0.65),
        'fire':        mat_pbr('Fire',        '#FF6B1A', roughness=0.50,
                               emission='#FF6B1A', emission_str=10.0),
        'banner':      mat_pbr('Banner_Red',  '#8B1A1A', roughness=0.72),
        'water':       mat_pbr('Water_Blue',  '#4A8BA8', roughness=0.10, metallic=0.15),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SHELL BUILDERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_outer_wall(M: dict):
    """(1) Outer Arena Wall — 4 arc segments with gate gaps."""
    parts = []
    for i, (a0, a1) in enumerate(ARC_RANGES):
        seg = _arc_seg(f'wall_{i}', INNER_WALL_R, ARENA_RADIUS,
                       WALL_HEIGHT, a0, a1, n=18)
        mat_assign(seg, M['stone'])
        smooth(seg)
        parts.append(seg)
    # Wall-top coping (slightly wider decorative lip)
    for i, (a0, a1) in enumerate(ARC_RANGES):
        lip = _arc_seg(f'wall_lip_{i}',
                       INNER_WALL_R - 0.15, ARENA_RADIUS + 0.15,
                       0.25, a0, a1, n=18, z0=WALL_HEIGHT)
        mat_assign(lip, M['stone_dk'])
        parts.append(lip)
    return join(parts, 'Outer_Arena_Wall')


def build_spectator_ring(M: dict):
    """(2) Spectator Ring / Colosseum Edge — 4 stepped tiers."""
    parts = []
    for row in range(SEAT_ROWS):
        r_outer = INNER_WALL_R - row * SEAT_DEPTH
        r_inner = r_outer - SEAT_DEPTH
        z_top = (SEAT_ROWS - row) * SEAT_STEP_H
        for i, (a0, a1) in enumerate(ARC_RANGES):
            seg = _arc_seg(f'seat_{row}_{i}', r_inner, r_outer,
                           z_top, a0, a1, n=16)
            mat_assign(seg, M['stone_dk'])
            parts.append(seg)
    return join(parts, 'Spectator_Ring')


def build_parapet(M: dict):
    """Low wall between arena floor and spectator seating."""
    parts = []
    for i, (a0, a1) in enumerate(ARC_RANGES):
        seg = _arc_seg(f'parapet_{i}',
                       FLOOR_RADIUS - PARAPET_T, FLOOR_RADIUS,
                       PARAPET_H, a0, a1, n=16)
        mat_assign(seg, M['stone'])
        parts.append(seg)
    return join(parts, 'Parapet_Wall')


def build_floor(M: dict):
    """Arena sand floor — thin disc at z = 0."""
    f = _cyl('Arena_Floor', FLOOR_RADIUS - PARAPET_T, 0.08, segs=SEG,
             loc=(0, 0, -0.08))
    mat_assign(f, M['sand'])
    return f


def build_cross_pathways(M: dict):
    """(7) Central Combat Zone — cross-shaped stone walkway."""
    parts = []
    # North-South arm (full length, centred at origin)
    ns = _box('path_NS', CROSS_W, CROSS_LEN * 2, 0.06, loc=(0, 0, 0))
    mat_assign(ns, M['stone_w'])
    parts.append(ns)
    # East-West arm
    ew = _box('path_EW', CROSS_LEN * 2, CROSS_W, 0.06, loc=(0, 0, 0))
    mat_assign(ew, M['stone_w'])
    parts.append(ew)
    return join(parts, 'Central_Combat_Zone')


def build_dais(M: dict):
    """(8) Raised Stone Dais — two-tier circular platform at centre."""
    parts = []
    # Outer ring
    d1 = _cyl('dais_outer', DAIS_R1, DAIS_H1, segs=SEG)
    mat_assign(d1, M['stone_w'])
    parts.append(d1)
    # Inner ring (taller)
    d2 = _cyl('dais_inner', DAIS_R2, DAIS_H2, segs=SEG)
    mat_assign(d2, M['stone_w'])
    parts.append(d2)
    # Decorative inlay ring on top
    d3 = _torus('dais_ring', DAIS_R2 - 0.3, 0.06,
                loc=(0, 0, DAIS_H2 + 0.06))
    mat_assign(d3, M['gold'])
    parts.append(d3)
    return join(parts, 'Raised_Stone_Dais')


def build_gate_frame(gate_name: str, angle: float, M: dict,
                     ornament: bool = False):
    """Build one gate frame (pillars + lintel + bars) at *angle*."""
    parts = []
    hw = GATE_WIDTH / 2 + 0.3
    pillar_w = 0.5
    pillar_d = WALL_THICKNESS + 0.2
    pillar_h = GATE_HEIGHT + 0.8

    # Two pillars (built at origin then repositioned)
    for side in (-1, 1):
        px = side * hw
        p = _box(f'gate_{gate_name}_pillar_{side}',
                 pillar_w, pillar_d, pillar_h,
                 loc=(px - pillar_w / 2, -pillar_d / 2, 0))
        mat_assign(p, M['stone'])
        parts.append(p)

    # Lintel across the top
    lintel_w = GATE_WIDTH + 2 * pillar_w + 0.6
    lt = _box(f'gate_{gate_name}_lintel',
              lintel_w, pillar_d, 0.6,
              loc=(-lintel_w / 2, -pillar_d / 2, GATE_HEIGHT))
    mat_assign(lt, M['stone'])
    parts.append(lt)

    # Iron bars (vertical cylinders)
    n_bars = 6
    spacing = GATE_WIDTH / (n_bars + 1)
    for bi in range(n_bars):
        bx = -GATE_WIDTH / 2 + spacing * (bi + 1)
        bar = _cyl(f'gate_{gate_name}_bar_{bi}', 0.06, GATE_HEIGHT,
                   segs=8, loc=(bx, 0, 0))
        mat_assign(bar, M['iron'])
        parts.append(bar)

    # Horizontal crossbar
    cb = _box(f'gate_{gate_name}_cross', GATE_WIDTH, 0.08, 0.08,
              loc=(-GATE_WIDTH / 2, 0, GATE_HEIGHT * 0.55))
    mat_assign(cb, M['iron'])
    parts.append(cb)

    # Optional golden ornament (North gate)
    if ornament:
        ov = _box(f'gate_{gate_name}_orn_v', 0.12, 0.12, 1.4,
                  loc=(-0.06, -0.06, GATE_HEIGHT + 0.6))
        mat_assign(ov, M['gold'])
        parts.append(ov)
        oh = _box(f'gate_{gate_name}_orn_h', 0.9, 0.12, 0.12,
                  loc=(-0.45, -0.06, GATE_HEIGHT + 1.4))
        mat_assign(oh, M['gold'])
        parts.append(oh)

    frame = join(parts, f'Gate_{gate_name}')

    # Rotate and position at the wall
    mid_r = (ARENA_RADIUS + INNER_WALL_R) / 2
    frame.rotation_euler.z = angle + math.pi / 2
    frame.location = (mid_r * math.cos(angle),
                      mid_r * math.sin(angle), 0)
    return frame


def build_banner_pole(name: str, x: float, y: float, rot_z: float,
                      M: dict):
    """(28) Banner Pole with red cloth."""
    parts = []
    # Pole shaft
    pole = _cyl(f'{name}_shaft', 0.08, 3.5, segs=8, loc=(x, y, 0))
    mat_assign(pole, M['iron'])
    parts.append(pole)
    # Banner cloth (simple quad plane)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x + 0.45, y, 2.8))
    cloth = bpy.context.active_object
    cloth.name = f'{name}_cloth'
    cloth.scale = (0.8, 0.05, 1.2)
    bpy.ops.object.transform_apply(scale=True)
    mat_assign(cloth, M['banner'])
    parts.append(cloth)
    # Pole top finial
    fin = _sphere(f'{name}_fin', 0.1, segs=8, loc=(x, y, 3.5))
    mat_assign(fin, M['gold'])
    parts.append(fin)
    r = join(parts, name)
    r.rotation_euler.z = rot_z
    return r


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PROP BUILDERS  (individual pieces for separate GLB export)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── Fluted column shaft (bmesh) ─────────────────────────────

def _fluted_shaft(name: str, radius: float, height: float,
                  flutes: int = 8, depth: float = 0.04,
                  rings: int = 6, spf: int = 3):
    """Create a column shaft with vertical fluting via bmesh."""
    bm = bmesh.new()
    total_seg = flutes * spf
    for ring_i in range(rings + 1):
        z = height * ring_i / rings
        for seg_i in range(total_seg):
            a = 2 * math.pi * seg_i / total_seg
            # Every other flute group is indented
            fl = seg_i // spf
            local = seg_i % spf
            if fl % 2 == 0:
                r = radius
            else:
                t = local / max(1, spf - 1)
                r = radius - depth * math.sin(t * math.pi)
            bm.verts.new((r * math.cos(a), r * math.sin(a), z))

    bm.verts.ensure_lookup_table()

    # Side faces
    for ri in range(rings):
        for si in range(total_seg):
            ns = (si + 1) % total_seg
            v0 = ri * total_seg + si
            v1 = ri * total_seg + ns
            v2 = (ri + 1) * total_seg + ns
            v3 = (ri + 1) * total_seg + si
            bm.faces.new([bm.verts[v0], bm.verts[v1],
                          bm.verts[v2], bm.verts[v3]])

    # Bottom cap
    bc = bm.verts.new((0, 0, 0))
    bm.verts.ensure_lookup_table()
    for si in range(total_seg):
        ns = (si + 1) % total_seg
        bm.faces.new([bc, bm.verts[ns], bm.verts[si]])

    # Top cap
    top_off = rings * total_seg
    tc = bm.verts.new((0, 0, height))
    bm.verts.ensure_lookup_table()
    for si in range(total_seg):
        ns = (si + 1) % total_seg
        bm.faces.new([tc, bm.verts[top_off + si],
                       bm.verts[top_off + ns]])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# ── (9-12) Standing Column ──────────────────────────────────

def build_column(name: str, x: float, y: float, M: dict):
    parts = []
    # Square base
    base = _box(f'{name}_base', 1.0, 1.0, 0.25, loc=(x, y, 0))
    mat_assign(base, M['stone'])
    parts.append(base)
    # Fluted shaft
    shaft = _fluted_shaft(f'{name}_shaft', 0.42, 3.4)
    shaft.location = (x, y, 0.25)
    mat_assign(shaft, M['gold'])
    smooth(shaft)
    parts.append(shaft)
    # Capital (wider piece on top)
    cap = _cyl(f'{name}_cap', 0.55, 0.2, segs=8, loc=(x, y, 3.65))
    mat_assign(cap, M['gold'])
    parts.append(cap)
    # Abacus (top slab)
    top = _box(f'{name}_top', 0.85, 0.85, 0.15, loc=(x, y, 3.85))
    mat_assign(top, M['stone'])
    parts.append(top)
    return join(parts, name)


# ── (13) Fallen Broken Column ───────────────────────────────

def build_fallen_column(name: str, x: float, y: float,
                        rot_z: float, M: dict):
    # Horizontal cylinder (lying on its side)
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.4, depth=2.8, vertices=16,
        location=(x, y, 0.4),
    )
    shaft = bpy.context.active_object
    shaft.name = name
    shaft.rotation_euler = (math.pi / 2, 0, rot_z)  # lay flat
    bpy.ops.object.transform_apply(rotation=True)
    mat_assign(shaft, M['stone'])
    smooth(shaft)

    # Broken chunk near the break
    chunk = _sphere(f'{name}_chunk', 0.22, segs=8,
                    loc=(x + 1.2 * math.cos(rot_z),
                         y + 1.2 * math.sin(rot_z), 0.15))
    chunk.scale = (1.0, 0.8, 0.6)
    _ensure_active(chunk)
    bpy.ops.object.transform_apply(scale=True)
    mat_assign(chunk, M['stone'])
    return join([shaft, chunk], name)


# ── (14) Stone Barricade ────────────────────────────────────

def build_barricade(name: str, x: float, y: float,
                    rot_z: float, M: dict):
    b = _box(name, 2.5, 0.6, 1.0, loc=(x, y, 0))
    mat_assign(b, M['stone'])
    b.rotation_euler.z = rot_z
    # Add bevel for a carved-stone look
    mod = b.modifiers.new('Bevel', 'BEVEL')
    mod.width = 0.06
    mod.segments = 2
    _ensure_active(b)
    bpy.ops.object.modifier_apply(modifier='Bevel')
    return b


# ── (15) Pushable Stone Block ───────────────────────────────

def build_stone_block(name: str, x: float, y: float,
                      rot_z: float, M: dict):
    b = _box(name, 0.9, 0.9, 0.9, loc=(x, y, 0))
    mat_assign(b, M['stone'])
    b.rotation_euler.z = rot_z
    mod = b.modifiers.new('Bevel', 'BEVEL')
    mod.width = 0.05
    mod.segments = 1
    _ensure_active(b)
    bpy.ops.object.modifier_apply(modifier='Bevel')
    return b


# ── (16) Breakable Crate ────────────────────────────────────

def build_crate(name: str, x: float, y: float,
                rot_z: float, M: dict):
    parts = []
    # Main box
    body = _box(f'{name}_body', 0.8, 0.8, 0.8, loc=(x, y, 0))
    mat_assign(body, M['wood'])
    parts.append(body)
    # Cross-braces (iron strips)
    for offset in (-0.25, 0.25):
        strip = _box(f'{name}_strip', 0.82, 0.06, 0.82,
                     loc=(x, y + offset, 0))
        mat_assign(strip, M['iron'])
        parts.append(strip)
    r = join(parts, name)
    r.rotation_euler.z = rot_z
    return r


# ── (17) Explosive Barrel Stack ─────────────────────────────

def build_barrel_stack(name: str, x: float, y: float,
                       rot_z: float, M: dict):
    parts = []
    # Bottom barrels (two side by side)
    b1 = _cyl(f'{name}_b1', 0.3, 0.9, segs=12, loc=(x - 0.32, y, 0))
    mat_assign(b1, M['wood'])
    parts.append(b1)
    b2 = _cyl(f'{name}_b2', 0.3, 0.9, segs=12, loc=(x + 0.32, y, 0))
    mat_assign(b2, M['wood'])
    parts.append(b2)
    # Top barrel (resting on the two)
    b3 = _cyl(f'{name}_b3', 0.3, 0.9, segs=12, loc=(x, y, 0.62))
    mat_assign(b3, M['wood'])
    parts.append(b3)
    # Iron bands (two per barrel, near top and bottom)
    for b, base_z in ((b1, 0), (b2, 0), (b3, 0.62)):
        for bh in (base_z + 0.15, base_z + 0.75):
            band = _torus(f'{name}_band', 0.31, 0.025,
                          loc=(b.location.x, b.location.y, bh))
            mat_assign(band, M['iron'])
            parts.append(band)
    r = join(parts, name)
    r.rotation_euler.z = rot_z
    return r


# ── (18) Rubble Pile ────────────────────────────────────────

def build_rubble(name: str, x: float, y: float, M: dict):
    parts = []
    bpy.ops.mesh.primitive_ico_sphere_add(
        radius=0.9, subdivisions=2, location=(x, y, 0.2))
    pile = bpy.context.active_object
    pile.name = name
    pile.scale.z = 0.35
    _ensure_active(pile)
    bpy.ops.object.transform_apply(scale=True)
    # Add noise with a Displace modifier
    mod = pile.modifiers.new('Noise', 'DISPLACE')
    mod.strength = 0.15
    tex = bpy.data.textures.new(f'{name}_tex', type='CLOUDS')
    tex.noise_scale = 0.5
    mod.texture = tex
    bpy.ops.object.modifier_apply(modifier='Noise')
    mat_assign(pile, M['stone'])
    parts.append(pile)
    # A few extra rocks
    for i, (dx, dy) in enumerate([(0.6, 0.3), (-0.5, -0.4), (0.2, -0.6)]):
        rock = _sphere(f'{name}_r{i}', 0.18 + i * 0.05, segs=8,
                       loc=(x + dx, y + dy, 0.12))
        mat_assign(rock, M['stone'])
        parts.append(rock)
    return join(parts, name)


# ── (19) Torch Brazier A ────────────────────────────────────

def build_brazier_a(name: str, x: float, y: float, M: dict):
    parts = []
    # Pedestal (tapered cylinder)
    ped = _cyl(f'{name}_ped', 0.35, 1.2, segs=8, loc=(x, y, 0))
    mat_assign(ped, M['stone'])
    parts.append(ped)
    # Bowl (half-sphere)
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.5, segments=12, ring_count=6,
        location=(x, y, 1.4))
    bowl = bpy.context.active_object
    bowl.name = f'{name}_bowl'
    # Flatten bottom half by deleting lower verts
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(bowl.data)
    for v in bm.verts:
        if v.co.z < -0.05:
            v.select = True
    bm.select_flush(True)
    bmesh.update_edit_mesh(bowl.data)
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    mat_assign(bowl, M['iron'])
    parts.append(bowl)
    # Flame proxy (emissive sphere)
    flame = _sphere(f'{name}_flame', 0.3, segs=8,
                    loc=(x, y, 1.7))
    mat_assign(flame, M['fire'])
    parts.append(flame)
    return join(parts, name)


# ── (20) Torch Brazier B  (taller variant) ──────────────────

def build_brazier_b(name: str, x: float, y: float, M: dict):
    parts = []
    # Taller pedestal
    ped = _cyl(f'{name}_ped', 0.3, 1.6, segs=8, loc=(x, y, 0))
    mat_assign(ped, M['stone_dk'])
    parts.append(ped)
    # Wide bowl
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.55, segments=12, ring_count=6,
        location=(x, y, 1.85))
    bowl = bpy.context.active_object
    bowl.name = f'{name}_bowl'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(bowl.data)
    for v in bm.verts:
        if v.co.z < -0.05:
            v.select = True
    bm.select_flush(True)
    bmesh.update_edit_mesh(bowl.data)
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    mat_assign(bowl, M['iron'])
    parts.append(bowl)
    flame = _sphere(f'{name}_flame', 0.35, segs=8,
                    loc=(x, y, 2.15))
    mat_assign(flame, M['fire'])
    parts.append(flame)
    return join(parts, name)


# ── (21) Spike Trap ─────────────────────────────────────────

def build_spike_trap(name: str, x: float, y: float, M: dict):
    parts = []
    # Plate
    plate = _box(f'{name}_plate', 1.6, 1.6, 0.08, loc=(x, y, 0))
    mat_assign(plate, M['iron'])
    parts.append(plate)
    # Array of spikes (4 × 4 grid)
    for ix in range(4):
        for iy in range(4):
            sx = x - 0.6 + ix * 0.4
            sy = y - 0.6 + iy * 0.4
            spike = _cone(f'{name}_s{ix}{iy}', 0.06, 0.5,
                          segs=6, loc=(sx, sy, 0.08))
            mat_assign(spike, M['iron'])
            parts.append(spike)
    return join(parts, name)


# ── (22) Pressure Plate ─────────────────────────────────────

def build_pressure_plate(name: str, x: float, y: float, M: dict):
    p = _box(name, 1.0, 1.0, 0.07, loc=(x, y, 0))
    mat_assign(p, M['stone_dk'])
    mod = p.modifiers.new('Bevel', 'BEVEL')
    mod.width = 0.04
    mod.segments = 1
    _ensure_active(p)
    bpy.ops.object.modifier_apply(modifier='Bevel')
    return p


# ── (23) Lever Switch ───────────────────────────────────────

def build_lever(name: str, x: float, y: float,
                rot_z: float, M: dict):
    parts = []
    # Base block
    base = _box(f'{name}_base', 0.4, 0.4, 0.3, loc=(x, y, 0))
    mat_assign(base, M['stone'])
    parts.append(base)
    # Lever rod (angled cylinder)
    rod = _cyl(f'{name}_rod', 0.04, 0.8, segs=8, loc=(x, y, 0.3))
    rod.rotation_euler.x = -0.5  # Tilt ~30°
    mat_assign(rod, M['iron'])
    parts.append(rod)
    # Handle knob
    knob = _sphere(f'{name}_knob', 0.07, segs=8,
                   loc=(x, y + 0.35, 0.95))
    mat_assign(knob, M['iron'])
    parts.append(knob)
    r = join(parts, name)
    r.rotation_euler.z = rot_z
    return r


# ── (24) Trap Door ──────────────────────────────────────────

def build_trap_door(name: str, x: float, y: float, M: dict):
    parts = []
    # Wooden door panel
    door = _box(f'{name}_panel', 1.2, 1.2, 0.1, loc=(x, y, -0.05))
    mat_assign(door, M['wood'])
    parts.append(door)
    # Iron frame border
    for dx, dy, sw, sh in [
        (0, -0.6, 1.3, 0.08),
        (0, 0.6, 1.3, 0.08),
        (-0.6, 0, 0.08, 1.3),
        (0.6, 0, 0.08, 1.3),
    ]:
        frame = _box(f'{name}_fr', sw, sh, 0.12,
                     loc=(x + dx, y + dy, -0.06))
        mat_assign(frame, M['iron'])
        parts.append(frame)
    return join(parts, name)


# ── (25) Treasure Chest ─────────────────────────────────────

def build_chest(name: str, x: float, y: float,
                rot_z: float, M: dict):
    parts = []
    # Body
    body = _box(f'{name}_body', 0.7, 0.45, 0.35, loc=(x, y, 0))
    mat_assign(body, M['wood'])
    parts.append(body)
    # Lid (bevelled box for curved appearance)
    lid = _box(f'{name}_lid', 0.72, 0.47, 0.22, loc=(x, y, 0.35))
    mat_assign(lid, M['wood'])
    mod = lid.modifiers.new('Bevel', 'BEVEL')
    mod.width = 0.08
    mod.segments = 3
    _ensure_active(lid)
    bpy.ops.object.modifier_apply(modifier='Bevel')
    parts.append(lid)
    # Metal bands
    for off_y in (-0.12, 0.12):
        band = _box(f'{name}_band', 0.74, 0.05, 0.58,
                    loc=(x, y + off_y, 0))
        mat_assign(band, M['iron'])
        parts.append(band)
    # Lock
    lock = _box(f'{name}_lock', 0.1, 0.06, 0.1,
                loc=(x, y + 0.24, 0.2))
    mat_assign(lock, M['gold'])
    parts.append(lock)
    r = join(parts, name)
    r.rotation_euler.z = rot_z
    return r


# ── (26) Healing Fountain ───────────────────────────────────

def build_fountain(name: str, x: float, y: float, M: dict):
    parts = []
    # Pedestal
    ped = _cyl(f'{name}_ped', 0.4, 0.6, segs=8, loc=(x, y, 0))
    mat_assign(ped, M['stone_w'])
    parts.append(ped)
    # Basin (wide shallow cylinder)
    basin = _cyl(f'{name}_basin', 0.8, 0.25, segs=16, loc=(x, y, 0.6))
    mat_assign(basin, M['stone_w'])
    parts.append(basin)
    # Water surface disc inside the basin
    water = _disk(f'{name}_water', 0.7, segs=16,
                  loc=(x, y, 0.82))
    mat_assign(water, M['water'])
    parts.append(water)
    return join(parts, name)


# ── (27) Movable Cover Cart ─────────────────────────────────

def build_cart(name: str, x: float, y: float,
               rot_z: float, M: dict):
    parts = []
    # Body
    body = _box(f'{name}_body', 1.6, 0.9, 0.6, loc=(x, y, 0.35))
    mat_assign(body, M['wood'])
    parts.append(body)
    # Side planks (slightly extended)
    for side_y in (-0.48, 0.48):
        plank = _box(f'{name}_side', 1.7, 0.06, 0.7,
                     loc=(x, y + side_y, 0.35))
        mat_assign(plank, M['wood'])
        parts.append(plank)
    # Wheels (4 short cylinders)
    wheel_pos = [(-0.65, -0.52), (0.65, -0.52),
                 (-0.65, 0.52), (0.65, 0.52)]
    for i, (wx, wy) in enumerate(wheel_pos):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.25, depth=0.08, vertices=16,
            location=(x + wx, y + wy, 0.25),
        )
        w = bpy.context.active_object
        w.name = f'{name}_wheel_{i}'
        w.rotation_euler.x = math.pi / 2
        _ensure_active(w)
        bpy.ops.object.transform_apply(rotation=True)
        mat_assign(w, M['wood'])
        parts.append(w)
    # Axle rods
    for ax in (-0.65, 0.65):
        rod = _cyl(f'{name}_axle', 0.04, 1.1, segs=8,
                   loc=(x + ax, y - 0.55, 0.25))
        rod.rotation_euler.x = math.pi / 2
        _ensure_active(rod)
        bpy.ops.object.transform_apply(rotation=True)
        mat_assign(rod, M['iron'])
        parts.append(rod)
    r = join(parts, name)
    r.rotation_euler.z = rot_z
    return r


# ── (29) Sand Pit ───────────────────────────────────────────

def build_sand_pit(name: str, x: float, y: float, M: dict):
    """Shallow depression in the arena floor."""
    bpy.ops.mesh.primitive_cone_add(
        radius1=1.2, radius2=0.8, depth=0.2, vertices=24,
        location=(x, y, -0.1),
    )
    pit = bpy.context.active_object
    pit.name = name
    # Flip it so the wider end faces up (the depression rim)
    pit.rotation_euler.x = math.pi
    _ensure_active(pit)
    bpy.ops.object.transform_apply(rotation=True)
    mat_assign(pit, M['sand_dark'])
    return pit


# ── (30) Small Debris Scatter ───────────────────────────────

def build_debris(name: str, x: float, y: float, M: dict):
    parts = []
    offsets = [(0, 0), (0.3, 0.2), (-0.25, 0.15),
              (0.15, -0.3), (-0.1, -0.2)]
    for i, (dx, dy) in enumerate(offsets):
        sz = 0.08 + i * 0.03
        bpy.ops.mesh.primitive_ico_sphere_add(
            radius=sz, subdivisions=1,
            location=(x + dx, y + dy, sz * 0.5))
        s = bpy.context.active_object
        s.name = f'{name}_d{i}'
        s.scale = (1.0 + i * 0.1, 0.8, 0.5)
        _ensure_active(s)
        bpy.ops.object.transform_apply(scale=True)
        mat_assign(s, M['stone'])
        parts.append(s)
    return join(parts, name)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PLACEMENT DATA  (approximate positions from floor plan)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Each tuple: (x, y, rotation_z_radians)
# Positive Y = North, Positive X = East

COLUMNS = [
    ('Standing_Column_A',  -6,   7,   0),
    ('Standing_Column_B',   7,   6,   0),
    ('Standing_Column_C',  -6,  -5,   0),
    ('Standing_Column_D1',  6,  -5,   0),
    ('Standing_Column_D2', -4, -11,   0),
    ('Standing_Column_D3',  4, -11,   0),
]

FALLEN_COLS = [
    ('Fallen_Column_1', -3,  10,  0.4),
    ('Fallen_Column_2',  5, -10, -0.8),
]

BARRICADES = [
    ('Stone_Barricade', 0, 12, 0),
]

STONE_BLOCKS = [
    ('Pushable_Stone_A',  9,  5,  0.2),
    ('Pushable_Stone_B', -9, -5, -0.3),
]

CRATES = [
    ('Breakable_Crate', -8, 9, 0.3),
]

BARREL_STACKS = [
    ('Explosive_Barrels', -10, 7, 0),
]

RUBBLE_PILES = [
    ('Rubble_Pile_1', -5,  4),
    ('Rubble_Pile_2',  5, -4),
]

BRAZIERS_A = [
    ('Torch_Brazier_A', -16, 3),
]

BRAZIERS_B = [
    ('Torch_Brazier_B', 16, -3),
]

SPIKE_TRAPS = [
    ('Spike_Trap', -10, -9),
]

PRESSURE_PLATES = [
    ('Pressure_Plate', 7, -11),
]

LEVERS = [
    ('Lever_Switch', 13, -7, 0.3),
]

TRAP_DOORS = [
    ('Trap_Door', 0, -15),
]

CHESTS = [
    ('Treasure_Chest', 3, -14, 0.5),
]

FOUNTAINS = [
    ('Healing_Fountain', -3, -14),
]

CARTS = [
    ('Movable_Cart', 0, -7, 0),
]

SAND_PITS = [
    ('Sand_Pit', 10, -6),
]

DEBRIS = [
    ('Debris_1',  3,  5),
    ('Debris_2', -6, -8),
    ('Debris_3',  8, -3),
]

BANNER_POSITIONS = [
    # (name, x, y, rot_z)  — near each gate, flanking
    ('Banner_Pole_N1', -2.5,  FLOOR_RADIUS - 1,  0),
    ('Banner_Pole_N2',  2.5,  FLOOR_RADIUS - 1,  0),
    ('Banner_Pole_S1', -2.5, -(FLOOR_RADIUS - 1), math.pi),
    ('Banner_Pole_S2',  2.5, -(FLOOR_RADIUS - 1), math.pi),
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN BUILD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_arena():
    print('━' * 60)
    print('  Arena Generator — building …')
    print('━' * 60)

    clear_scene()
    M = create_materials()

    # ── Collections ──
    shell_col = col_get('Arena_Shell')
    props_col = col_get('Arena_Props')

    # ── Shell (combined export) ──────────────────────────────
    print('  [1] Outer Wall …')
    col_move(build_outer_wall(M), shell_col)

    print('  [2] Spectator Ring …')
    col_move(build_spectator_ring(M), shell_col)

    print('  [·] Parapet …')
    col_move(build_parapet(M), shell_col)

    print('  [·] Arena Floor …')
    col_move(build_floor(M), shell_col)

    print('  [7] Cross Pathways …')
    col_move(build_cross_pathways(M), shell_col)

    print('  [8] Raised Dais …')
    col_move(build_dais(M), shell_col)

    print('  [3-6] Gate Frames …')
    gate_defs = [
        ('North', _G['North'], True),
        ('South', _G['South'], False),
        ('East',  _G['East'],  False),
        ('West',  _G['West'],  False),
    ]
    for gname, gangle, gorn in gate_defs:
        col_move(build_gate_frame(gname, gangle, M, ornament=gorn),
                 shell_col)

    print('  [28] Banner Poles …')
    for bname, bx, by, brot in BANNER_POSITIONS:
        col_move(build_banner_pole(bname, bx, by, brot, M), shell_col)

    # ── Individual Props (separate export) ───────────────────
    print('  [9-12] Standing Columns …')
    for cname, cx, cy, _ in COLUMNS:
        col_move(build_column(cname, cx, cy, M), props_col)

    print('  [13] Fallen Columns …')
    for cname, cx, cy, crot in FALLEN_COLS:
        col_move(build_fallen_column(cname, cx, cy, crot, M), props_col)

    print('  [14] Stone Barricade …')
    for bname, bx, by, brot in BARRICADES:
        col_move(build_barricade(bname, bx, by, brot, M), props_col)

    print('  [15] Stone Blocks …')
    for bname, bx, by, brot in STONE_BLOCKS:
        col_move(build_stone_block(bname, bx, by, brot, M), props_col)

    print('  [16] Crates …')
    for cname, cx, cy, crot in CRATES:
        col_move(build_crate(cname, cx, cy, crot, M), props_col)

    print('  [17] Barrel Stacks …')
    for bname, bx, by, brot in BARREL_STACKS:
        col_move(build_barrel_stack(bname, bx, by, brot, M), props_col)

    print('  [18] Rubble Piles …')
    for args in RUBBLE_PILES:
        col_move(build_rubble(args[0], args[1], args[2], M), props_col)

    print('  [19] Torch Brazier A …')
    for args in BRAZIERS_A:
        col_move(build_brazier_a(args[0], args[1], args[2], M), props_col)

    print('  [20] Torch Brazier B …')
    for args in BRAZIERS_B:
        col_move(build_brazier_b(args[0], args[1], args[2], M), props_col)

    print('  [21] Spike Traps …')
    for args in SPIKE_TRAPS:
        col_move(build_spike_trap(args[0], args[1], args[2], M), props_col)

    print('  [22] Pressure Plates …')
    for args in PRESSURE_PLATES:
        col_move(build_pressure_plate(args[0], args[1], args[2], M), props_col)

    print('  [23] Levers …')
    for lname, lx, ly, lrot in LEVERS:
        col_move(build_lever(lname, lx, ly, lrot, M), props_col)

    print('  [24] Trap Doors …')
    for args in TRAP_DOORS:
        col_move(build_trap_door(args[0], args[1], args[2], M), props_col)

    print('  [25] Treasure Chests …')
    for cname, cx, cy, crot in CHESTS:
        col_move(build_chest(cname, cx, cy, crot, M), props_col)

    print('  [26] Healing Fountains …')
    for args in FOUNTAINS:
        col_move(build_fountain(args[0], args[1], args[2], M), props_col)

    print('  [27] Carts …')
    for cname, cx, cy, crot in CARTS:
        col_move(build_cart(cname, cx, cy, crot, M), props_col)

    print('  [29] Sand Pits …')
    for args in SAND_PITS:
        col_move(build_sand_pit(args[0], args[1], args[2], M), props_col)

    print('  [30] Debris …')
    for args in DEBRIS:
        col_move(build_debris(args[0], args[1], args[2], M), props_col)

    # ── Lighting + Camera ────────────────────────────────────
    print('  [·] Lighting & Camera …')
    _setup_lighting()
    _setup_camera()

    print()
    print('  ✓ Arena build complete!')
    print(f'    Shell objects: {len(shell_col.objects)}')
    print(f'    Prop objects:  {len(props_col.objects)}')
    print()
    print('  Export helpers available:')
    print('    export_arena_shell("C:/output/")')
    print('    export_individual_pieces("C:/output/")')
    print('━' * 60)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LIGHTING & CAMERA
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _setup_lighting():
    bpy.ops.object.light_add(type='SUN', location=(10, 10, 20))
    sun = bpy.context.active_object
    sun.name = 'Arena_Sun'
    sun.data.energy = 4
    sun.data.color = (1.0, 0.95, 0.85)
    sun.rotation_euler = (math.radians(50), math.radians(15),
                          math.radians(30))

    # Warm fill light from below for the sandy look
    bpy.ops.object.light_add(type='AREA', location=(0, 0, 0.5))
    fill = bpy.context.active_object
    fill.name = 'Arena_Fill'
    fill.data.energy = 50
    fill.data.color = (0.85, 0.72, 0.50)
    fill.data.size = 40


def _setup_camera():
    bpy.ops.object.camera_add(location=(32, -32, 28))
    cam = bpy.context.active_object
    cam.name = 'Arena_Camera'
    cam.rotation_euler = (math.radians(58), 0, math.radians(45))
    bpy.context.scene.camera = cam


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EXPORT HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def export_arena_shell(output_dir: str):
    """Export all Arena_Shell objects as a single GLB file."""
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, 'arena_shell.glb')

    bpy.ops.object.select_all(action='DESELECT')
    shell_col = bpy.data.collections.get('Arena_Shell')
    if not shell_col:
        print('ERROR: Arena_Shell collection not found.')
        return
    for obj in shell_col.objects:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
    )
    print(f'Exported arena shell → {filepath}')


def export_individual_pieces(output_dir: str):
    """Export each Arena_Props object as its own GLB file."""
    os.makedirs(output_dir, exist_ok=True)
    props_col = bpy.data.collections.get('Arena_Props')
    if not props_col:
        print('ERROR: Arena_Props collection not found.')
        return

    for obj in props_col.objects:
        filepath = os.path.join(output_dir, f'{obj.name}.glb')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
        )
        print(f'  Exported {obj.name} → {filepath}')

    print(f'Exported {len(props_col.objects)} prop files.')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENTRY POINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Always run when executed — works both from Blender's scripting
# editor (where __name__ == '__main__' is NOT set) and from the
# command line (blender --python this_file.py).
build_arena()
