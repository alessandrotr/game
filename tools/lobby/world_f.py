"""
Lobby world — bake + export.

    G['bake_ao']()         # per-object vertex AO (contact shadows, eaves, window reveals, wall bases)
    G['export_glb']()      # merge tree instances into chunks, write public/models/lobby_world.glb + layout.json

Vertex colours end up as  Col = Tint * (floor + (1-floor) * AO)  — the engine multiplies them into the
albedo (COLOR_0), so the baked depth is "free" at runtime and stays correct under any dynamic light.
"""
import math
import os
import time
import numpy as np

OUT_GLB = '/Users/alessandro/Developer/game/apps/client/public/models/lobby_world.glb'
AO_FLOOR = {'Ground': 0.38, 'Plaza': 0.40, 'default': 0.30}


def _subdivide_big_faces(ob, min_area=2.4, cuts=1):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    edges = set()
    for f in bm.faces:
        if f.calc_area() > min_area and len(f.verts) == 4:
            edges.update(f.edges)
    if edges:
        bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=cuts, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()


def bake_ao(samples=20, distance=2.6):
    sc = bpy.context.scene
    t0 = time.time()
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    try:
        sc.world.light_settings.distance = distance
    except Exception:
        pass
    hidden = []
    for o in bpy.data.objects:
        if o.name.startswith(('Grass_', 'Flowers_', 'PV_')):
            hidden.append((o, o.hide_render))
            o.hide_render = True
    targets = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith(('P_', 'PV_', 'Grass_', 'Flowers_', 'Terrain', 'Lake')):
            continue
        if o.data.users > 1:       # instanced prototypes
            continue
        targets.append(o)
    # subdivide large flat faces on architecture so AO has a gradient to write into
    for o in targets:
        if o.users_collection and o.users_collection[0].name in ('Lobby_Buildings', 'Lobby_Castle', 'Lobby_Props'):
            _subdivide_big_faces(o)
    done = 0
    for o in targets:
        me = o.data
        if 'Col' not in me.color_attributes:
            continue
        n = len(me.vertices)
        tint = np.zeros(n * 4, dtype=np.float32)
        me.color_attributes['Col'].data.foreach_get('color', tint)
        tint = tint.reshape(-1, 4)
        me.color_attributes.active_color = me.color_attributes['Col']
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
        ao = np.zeros(n * 4, dtype=np.float32)
        me.color_attributes['Col'].data.foreach_get('color', ao)
        ao = ao.reshape(-1, 4)[:, 0]
        coll = o.users_collection[0].name.replace('Lobby_', '') if o.users_collection else 'default'
        floor = AO_FLOOR.get(o.name, AO_FLOOR.get(coll, AO_FLOOR['default']))
        k = floor + (1 - floor) * np.clip(ao, 0, 1)
        out = tint.copy()
        out[:, :3] *= k[:, None]
        me.color_attributes['Col'].data.foreach_set('color', out.ravel())
        me.update()
        done += 1
    for o, h in hidden:
        o.hide_render = h
    sc.render.engine = 'BLENDER_EEVEE'
    return {'objects': done, 'sec': round(time.time() - t0, 1)}


def merge_nature(cell=36.0):
    """Join tree/bush/rock instances into spatial chunks (few draw calls, still frustum-culled)."""
    chunks = {}
    for o in list(collection('Nature').objects):
        if o.name.startswith('P_') or o.data is None:
            continue
        key = (int(math.floor(o.location.x / cell)), int(math.floor(o.location.y / cell)))
        chunks.setdefault(key, []).append(o)
    made = []
    for (cx, cy), objs in chunks.items():
        copies = []
        for o in objs:
            c = o.copy()
            c.data = o.data.copy()
            c.hide_render = c.hide_viewport = False
            collection('Nature').objects.link(c)
            copies.append(c)
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.ops.object.select_all(action='DESELECT')
        for c in copies:
            c.select_set(True)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = f'NatureChunk_{cx}_{cy}'
        made.append(j)
    return len(made)


def export_glb():
    t0 = time.time()
    n_chunks = merge_nature()
    for o in bpy.data.objects:
        if o.name.startswith(('P_', 'PV_')):
            o.hide_render = True
    sel = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(('P_', 'PV_'))]
    for o in sel:
        me = o.data
        if 'Col' in me.color_attributes:
            me.color_attributes.active_color = me.color_attributes['Col']
    bpy.ops.object.select_all(action='DESELECT')
    for o in sel:
        o.select_set(True)
    bpy.context.view_layer.objects.active = sel[0]
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, use_selection=True, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_vertex_color='ACTIVE', export_lights=False, export_cameras=False,
                              export_extras=False, export_image_format='JPEG', export_jpeg_quality=86,
                              export_meshopt_compression_enable=True)
    return {'chunks': n_chunks, 'meshes': len(sel), 'bytes': os.path.getsize(OUT_GLB), 'sec': round(time.time() - t0, 1)}
