"""
Lobby world — orchestration: build everything from scratch, optional dusk preview rig.

    G = {}
    for f in ('common', 'buildings', 'world_a', 'world_b', 'world_c', 'world_d', 'world_e'):
        exec(open(f'/Users/alessandro/Developer/game/tools/lobby/{f}.py').read(), G)
    G['build_all']()
"""
import math
import random
import json


def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    for i in list(bpy.data.images):
        bpy.data.images.remove(i)
    COLL.clear()
    MATS.clear()
    for k in LAYOUT:
        LAYOUT[k].clear()
    PROTO.clear()


def build_all():
    import time
    t0 = time.time()
    reset_scene()
    ns = {'__file__': '/Users/alessandro/Developer/game/tools/lobby/textures.py'}
    exec(open('/Users/alessandro/Developer/game/tools/lobby/textures.py').read(), ns)
    TEX.clear(); TEX.update(ns['OUT'])
    make_materials()
    stages = [
        ('terrain', build_terrain), ('ground', build_ground), ('plaza', build_plaza), ('roads', build_roads), ('fountain', build_fountain),
        ('portals', lambda: (build_portal_gate('PortalGate_Arena', 0.0, -14.0, '#ff7a3a'), build_portal_gate('PortalGate_Zombie', 8.0, -14.0, '#7dff6a'))),
        ('buildings', build_town_buildings), ('market', build_market), ('castle', build_castle),
        ('furniture', build_street_furniture), ('protos', build_prototypes),
        ('nature', scatter_nature), ('grass', scatter_grass),
    ]
    log = {}
    for name, fn in stages:
        t = time.time()
        r = fn()
        log[name] = round(time.time() - t, 1)
    LAYOUT_JSON = '/Users/alessandro/Developer/game/tools/lobby/layout.json'
    json.dump(LAYOUT, open(LAYOUT_JSON, 'w'))
    log['total'] = round(time.time() - t0, 1)
    log['objects'] = len(bpy.data.objects)
    log['colliders'] = len(LAYOUT['colliders'])
    return log


def preview_rig(sun_energy=3.0):
    sc = bpy.context.scene
    for o in [o for o in bpy.data.objects if o.name.startswith('PV_')]:
        bpy.data.objects.remove(o, do_unlink=True)
    w = sc.world or bpy.data.worlds.new('W')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.34, 0.30, 0.50, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.85
    sun = bpy.data.lights.new('PV_Sun', 'SUN'); sun.energy = sun_energy; sun.color = (1.0, 0.70, 0.42); sun.angle = math.radians(2)
    so = bpy.data.objects.new('PV_Sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(58), 0, math.radians(35))
    for i, l in enumerate(LAYOUT['lights']):
        pl = bpy.data.lights.new(f'PV_L{i}', 'POINT')
        pl.energy = l['i'] * 60
        pl.color = tuple(int(l['color'][j:j + 2], 16) / 255 for j in (1, 3, 5))
        pl.shadow_soft_size = 0.2
        po = bpy.data.objects.new(f'PV_L{i}', pl)
        sc.collection.objects.link(po)
        po.location = (l['x'], -l['z'], l['y'])
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    try:
        sc.eevee.use_raytracing = True
    except Exception:
        pass
    cam = bpy.data.objects.get('PV_Cam')
    if not cam:
        cd = bpy.data.cameras.new('PV_Cam'); cd.clip_end = 1500
        cam = bpy.data.objects.new('PV_Cam', cd); sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def aim(cam, loc, target, lens=28):
    cam.location = loc
    cam.data.lens = lens
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
