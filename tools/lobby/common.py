"""
Lobby world — shared builder utilities (run inside Blender; exec'd into a shared dict).

World frame (all authored at TRUE GAME SCALE, 1 unit = 1 metre):
    Blender X = game X (east)      Blender Y = -game Z (north is +Y)      Blender Z = up
glTF export (+Y up) then maps Blender (x, y, z) -> three (x, z, -y), i.e. three z = game z.
So the castle sits at game z < 0 == Blender Y > 0, and the spawn at game z = +12 == Blender Y = -12.
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector, Matrix

TEX = bpy.app.driver_namespace.get('LOBBY_TEX', {})

# texture tile size in metres (box-projected UVs)
TILE = {
    'cobble': 3.0, 'cobble2': 3.0, 'rubble': 1.7, 'ashlar': 5.2, 'ashlar_dark': 5.2,
    'plaster': 3.5, 'wood': 2.0, 'timber': 2.0,
    'roof_terracotta': 2.2, 'roof_teal': 2.2, 'roof_slate': 2.2, 'thatch': 2.2,
    'grass': 6.0, 'dirt': 6.0, 'rock': 4.0, 'bark': 1.6, 'foliage': 1.1, 'marble': 2.6,
}

COLL = {}


def lin(c):
    """Authoring colours are perceptual (sRGB-ish); Blender/glTF vertex + factor colours are linear."""
    return tuple(x ** 2.2 for x in c)


def collection(name):
    if name not in COLL:
        c = bpy.data.collections.get('Lobby_' + name) or bpy.data.collections.new('Lobby_' + name)
        if c.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(c)
        COLL[name] = c
    return COLL[name]


# ------------------------------------------------------------------ materials
MATS = {}


def _principled(m):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs[0])
    return nt, b


def tex_mat(name, rough=0.85, metal=0.0, nstr=1.0):
    m = bpy.data.materials.new(name)
    nt, b = _principled(m)
    t = TEX[name]
    img = bpy.data.images.load(t['albedo'], check_existing=True)
    nimg = bpy.data.images.load(t['normal'], check_existing=True)
    nimg.colorspace_settings.name = 'Non-Color'
    ti = nt.nodes.new('ShaderNodeTexImage'); ti.image = img
    va = nt.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(ti.outputs['Color'], mix.inputs[6]); nt.links.new(va.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nimg
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nstr
    nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def flat_mat(name, color, rough=0.7, metal=0.0, emit=None, es=0.0, alpha=1.0, vcol=False):
    m = bpy.data.materials.new(name)
    nt, b = _principled(m)
    if vcol:
        va = nt.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        mix.inputs[6].default_value = (*lin(color), 1)
        nt.links.new(va.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*lin(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = es
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
    return m


def make_materials():
    for n in TILE:
        r = {'cobble': .9, 'cobble2': .9, 'rubble': .92, 'ashlar': .9, 'ashlar_dark': .9, 'plaster': .95, 'wood': .8, 'timber': .8,
             'roof_terracotta': .72, 'roof_teal': .68, 'roof_slate': .6, 'thatch': 1.0, 'grass': 1.0, 'dirt': 1.0, 'rock': .95, 'bark': 1.0, 'foliage': .85, 'marble': .35}[n]
        MATS[n] = tex_mat(n, r, nstr=1.0)
    F = flat_mat
    MATS.update({
        'iron': F('iron', (0.07, 0.07, 0.08), 0.45, 0.9),
        'gold': F('gold', (1.0, 0.68, 0.18), 0.28, 1.0),
        'brass': F('brass', (0.8, 0.55, 0.22), 0.35, 0.9),
        'glass_lit': F('glass_lit', (1, 0.72, 0.35), 0.3, emit=(1.0, 0.62, 0.22), es=2.2),
        'glass_blue': F('glass_blue', (0.3, 0.5, 1.0), 0.2, emit=(0.25, 0.45, 1.0), es=1.6),
        'glass_red': F('glass_red', (1, 0.3, 0.25), 0.2, emit=(1.0, 0.22, 0.18), es=1.6),
        'glass_gold': F('glass_gold', (1, 0.8, 0.3), 0.2, emit=(1.0, 0.7, 0.2), es=1.8),
        'glass_dark': F('glass_dark', (0.06, 0.09, 0.14), 0.15, 0.2),
        'lantern': F('lantern', (1, 0.7, 0.3), 0.4, emit=(1.0, 0.55, 0.15), es=6.0),
        'flame': F('flame', (1, 0.6, 0.2), 0.5, emit=(1.0, 0.5, 0.1), es=9.0),
        'crystal': F('crystal', (0.45, 0.8, 1.0), 0.08, emit=(0.25, 0.65, 1.0), es=5.0),
        'water': F('water', (0.10, 0.36, 0.46), 0.04, alpha=0.78),
        'cloth_red': F('cloth_red', (0.55, 0.07, 0.07), 0.9),
        'cloth_blue': F('cloth_blue', (0.10, 0.22, 0.58), 0.9),
        'cloth_gold': F('cloth_gold', (0.85, 0.62, 0.15), 0.85),
        'cloth_green': F('cloth_green', (0.12, 0.40, 0.20), 0.9),
        'cloth_cream': F('cloth_cream', (0.85, 0.78, 0.62), 0.95),
        'paint_red': F('paint_red', (0.55, 0.12, 0.10), 0.7),
        'paint_green': F('paint_green', (0.14, 0.38, 0.28), 0.7),
        'paint_blue': F('paint_blue', (0.15, 0.28, 0.5), 0.7),
        'vcol': F('vcol', (1, 1, 1), 0.9, vcol=True),
    })
    return MATS


# ------------------------------------------------------------------ builder
class B:
    """Primitive mesh builder with a transform stack and per-primitive vertex tint."""

    def __init__(self, name, coll='Buildings'):
        self.name, self.coll = name, coll
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new('Col')
        self.mats = []
        self.stack = [Matrix.Identity(4)]
        self.tint = (1, 1, 1)
        self.smooth = False

    # --- transform stack
    def push(self, M):
        self.stack.append(self.stack[-1] @ M)

    def pop(self):
        self.stack.pop()

    @property
    def M(self):
        return self.stack[-1]

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _fin(self, verts, m):
        mi = self._mi(m)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = mi
            f.smooth = self.smooth
        tc = lin(self.tint) if m == 'vcol' else self.tint   # 'foliage' etc. take their tint from the painted vertex colours
        for v in verts:
            v[self.col] = (*tc, 1.0)
        return verts

    # --- primitives (local matrix `L` is applied inside the current stack matrix)
    def box(self, c, s, m, rz=0.0, rx=0.0, ry=0.0):
        L = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ \
            Matrix.Diagonal((s[0], s[1], s[2], 1))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self.M @ L)
        return self._fin(r['verts'], m)

    def beam(self, p0, p1, sx, sz, m, up=(0, 0, 1)):
        """Box of cross-section sx*sz running from p0 to p1 (local Y along the run)."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        ln = d.length
        if ln < 1e-5:
            return []
        y = d.normalized()
        u = Vector(up)
        if abs(y.dot(u)) > 0.98:
            u = Vector((1, 0, 0))
        x = y.cross(u).normalized()
        z = x.cross(y).normalized()
        R = Matrix(((x.x, y.x, z.x, 0), (x.y, y.y, z.y, 0), (x.z, y.z, z.z, 0), (0, 0, 0, 1)))
        L = Matrix.Translation((p0 + p1) / 2) @ R @ Matrix.Diagonal((sx, ln, sz, 1))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self.M @ L)
        return self._fin(r['verts'], m)

    def cyl(self, c, r1, r2, h, m, seg=16, rx=0.0, ry=0.0, rz=0.0, cap=True):
        L = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')
        r = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h,
                                  matrix=self.M @ L)
        return self._fin(r['verts'], m)

    def sph(self, c, rx, ry, rz, m, seg=10, rings=6):
        L = Matrix.Translation(c) @ Matrix.Diagonal((rx, ry, rz, 1))
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=self.M @ L)
        return self._fin(r['verts'], m)

    def ico(self, c, r, m, sub=1, squash=(1, 1, 1)):
        L = Matrix.Translation(c) @ Matrix.Diagonal((squash[0], squash[1], squash[2], 1))
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=self.M @ L)
        return self._fin(res['verts'], m)

    def poly(self, pts, m, thick=None):
        """Convex planar polygon (optionally extruded along its normal by `thick`)."""
        vs = [self.bm.verts.new(self.M @ Vector(p)) for p in pts]
        f = self.bm.faces.new(vs)
        out = list(vs)
        if thick:
            n = f.normal.copy()
            ext = bmesh.ops.extrude_face_region(self.bm, geom=[f])
            nv = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
            bmesh.ops.translate(self.bm, verts=nv, vec=n * thick)
            out += nv
        bmesh.ops.recalc_face_normals(self.bm, faces=list({f for v in out for f in v.link_faces}))
        return self._fin(out, m)

    # --- finish
    def build(self, loc=(0, 0, 0), rot=0.0, smooth=False, subdiv=0, parent=None):
        bm = self.bm
        if subdiv:
            bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=subdiv, use_grid_fill=True)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(MATS[m])
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        box_uv(me, self.mats)
        o = bpy.data.objects.new(self.name, me)
        o.location = loc
        o.rotation_euler[2] = rot
        collection(self.coll).objects.link(o)
        if parent:
            o.parent = parent
        return o


def box_uv(me, mat_names):
    if not me.polygons:
        return
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        nm = mat_names[p.material_index] if p.material_index < len(mat_names) else None
        T = TILE.get(nm, 3.0)
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            if nm == 'foliage':
                # continuous skewed-planar UVs: no seams, so the exporter keeps vertices welded (big size win)
                uv.data[li].uv = ((c.x + c.z * 0.55) / T, (c.y + c.z * 0.8) / T)
                continue
            if ax == 2:
                u, v = c.x, c.y
            elif ax == 0:
                u, v = c.y, c.z
            else:
                u, v = c.x, c.z
            uv.data[li].uv = (u / T, v / T)


def sm(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def g2b(gx, gz):
    """Game (x, z) -> Blender (X, Y)."""
    return gx, -gz


def b2g(bx, by):
    return bx, -by
