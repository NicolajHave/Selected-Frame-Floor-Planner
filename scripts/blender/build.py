"""
Builds Blender catalog models into the planner's GLB files.

    python scripts/blender/build.py [module ...] [--blend] [--preview DIR] [--thumbs] [--plan]

Needs Blender as a Python module (`pip install bpy==4.5.14`, Python 3.11).
Each module defines ID and build(). Output: public/assets/3d/<ID>.glb, and
with --blend also assets/blender/<ID>.blend for hand editing in Blender,
with --thumbs the library picture public/assets/thumbs/<ID>.png, and with
--plan the model seen from above for the 2D plan (src/lib/planShapes.json;
needs shapely).
"""

import argparse
import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from common import export, reset  # noqa: E402

MODELS = [
    'wall_unit_1400_shelves',
    'wall_unit_1400_sidehang',
    'wall_unit_1400_shelf_sidehang',
    'wall_unit_1400_2level_sidehang',
    'wall_unit_1400_mirror_sidehang',
    'wall_unit_jeans',
    'wall_unit_1400_screen',
    'wall_unit_700_shelf',
    'wall_unit_700_2level_sidehang',
    'wall_unit_700_sidehang',
    'floor_rack_1400',
    'floor_rack_700',
    'floor_rack_1400_h1700',
    'floor_rack_700_h1700',
    'podium_tall_oak',
    'podium_short_oak',
    'jeans_rack_single',
    'jeans_rack_double',
    'jeans_rack_triple',
    'table_volume',
    'table_iconic',
    'podium_iconic',
    'logo_corona',
    'logo_steel',
    'logo_led',
    'sign_table',
    'sign_floor_price',
    'sign_rack',
    'tray_leather',
    'tray_3x3',
    'tray_3x5',
    'accessories_rack',
    'mannequin_female',
    'mannequin_male',
    'carpet',
]


def model_size():
    """Width × depth × height of everything built, mm (Blender x, y, z)."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            me = o.evaluated_get(dg).to_mesh()
            pts += [o.matrix_world @ v.co for v in me.vertices]
            o.evaluated_get(dg).to_mesh_clear()
    return [round((max(p[k] for p in pts) - min(p[k] for p in pts)) * 1000) for k in range(3)]


def preview(path, look_from=(-1.7, -4.4, 1.35), target=(0, 0, 1.12)):
    """A still in a white room, roughly matching the catalog renders."""
    scene = bpy.context.scene
    # Wall behind (at +Y, the back) and floor.
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    floor = bpy.context.active_object
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0.262, 6), rotation=(math.pi / 2, 0, 0))
    wall = bpy.context.active_object
    for obj, colour in ((floor, (0.78, 0.76, 0.72, 1)), (wall, (0.93, 0.94, 0.92, 1))):
        m = bpy.data.materials.new(obj.name)
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = colour
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
        obj.data.materials.append(m)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    scene.world = world
    bpy.ops.object.light_add(type='AREA', location=(-1.5, -3, 3.2))
    light = bpy.context.active_object
    light.data.energy = 220
    light.data.size = 3
    light.rotation_euler = (math.radians(50), 0, math.radians(-25))
    bpy.ops.object.camera_add(location=look_from)
    cam = bpy.context.active_object
    cam.data.lens = 38
    direction = [t - f for t, f in zip(target, look_from)]
    import mathutils
    cam.rotation_euler = mathutils.Vector(direction).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.device = 'CPU'
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 625
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def thumbnail(path, width=360, height=192):
    """
    The library card picture: the model alone on a transparent background
    with its shadow, seen from the front left and a little above, framed
    to fill the card.
    """
    import mathutils
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in scene.objects:
        if o.type == 'MESH':
            me = o.evaluated_get(dg).to_mesh()
            pts += [o.matrix_world @ v.co for v in me.vertices]
            o.evaluated_get(dg).to_mesh_clear()
    lo = mathutils.Vector([min(p[k] for p in pts) for k in range(3)])
    hi = mathutils.Vector([max(p[k] for p in pts) for k in range(3)])
    centre = (lo + hi) / 2
    corners = [mathutils.Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]

    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, lo.z))
    bpy.context.active_object.is_shadow_catcher = True
    world = bpy.data.worlds.new('thumb')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    scene.world = world
    bpy.ops.object.light_add(type='AREA', location=(centre.x - 2.5, centre.y - 4, hi.z + 3.5))
    light = bpy.context.active_object
    light.data.energy = 500
    light.data.size = 4
    light.rotation_euler = (mathutils.Vector(centre) - light.location).to_track_quat('-Z', 'Y').to_euler()

    w, d, h = hi - lo
    # Flat things (carpet, trays) from higher up; thin wall pieces (logos) more square-on.
    elevation = math.radians(48 if h < 0.25 * max(w, d) else 20)
    azimuth = math.radians(-16 if d < 0.1 * w else -32)
    view = mathutils.Vector((math.sin(azimuth) * math.cos(elevation),
                             -math.cos(azimuth) * math.cos(elevation),
                             math.sin(elevation)))
    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.data.lens = 50
    cam.rotation_euler = (-view).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    # Fit: move the camera back until every corner of the box is inside the frame.
    aspect = width / height
    sensor = cam.data.sensor_width / 2 / cam.data.lens
    tan_h = sensor if aspect >= 1 else sensor * aspect
    tan_v = tan_h / aspect
    rot = cam.rotation_euler.to_matrix()
    right, up, fwd = rot.col[0], rot.col[1], -rot.col[2]
    dist = 0.0
    for c in corners:
        rel = c - centre
        depth = rel.dot(fwd)
        dist = max(dist,
                   abs(rel.dot(right)) / (tan_h * 0.9) - depth,
                   abs(rel.dot(up)) / (tan_v * 0.86) - depth)
    cam.location = centre + view * dist

    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.device = 'CPU'
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.compression = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


PLAN_SHAPES = os.path.join(ROOT, 'src', 'lib', 'planShapes.json')


def plan_shape(tolerance=4.0):
    """
    The model seen from above, in plan mm around its origin (plan x = model
    x, plan y = −model y, since the plan's y runs to the front): the filled
    silhouette, and the outline of each part inside it for detail.
    """
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    dg = bpy.context.evaluated_depsgraph_get()
    parts = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        mw = o.matrix_world
        tris = []
        for t in me.loop_triangles:
            pts = [mw @ me.vertices[i].co for i in t.vertices]
            poly = Polygon([(p.x * 1000, -p.y * 1000) for p in pts])
            if poly.area > 0.5:
                tris.append(poly)
        ev.to_mesh_clear()
        if tris:
            # Close hairline gaps between neighbouring faces, then tidy.
            parts.append(unary_union(tris).buffer(0.6, join_style=2).buffer(-0.6, join_style=2))
    if not parts:
        return None
    silhouette = unary_union(parts).simplify(tolerance / 2)

    def rings(geom):
        polys = getattr(geom, 'geoms', [geom])
        out = []
        for p in polys:
            if p.is_empty or p.geom_type != 'Polygon' or p.area < 40:
                continue
            for r in [p.exterior, *p.interiors]:
                pts = [(round(x), round(y)) for x, y in list(r.coords)[:-1]]
                if len(pts) >= 3:
                    out.append(pts)
        return out

    fill = rings(silhouette)
    edge = silhouette.boundary
    lines = []
    for part in parts:
        # Only the outline that lies inside the silhouette adds anything.
        inner = part.simplify(tolerance).boundary.difference(edge.buffer(tolerance))
        for seg in getattr(inner, 'geoms', [inner]):
            if seg.is_empty or seg.length < 3 * tolerance:
                continue
            pts = [(round(x), round(y)) for x, y in seg.coords]
            dedup = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
            if len(dedup) >= 2:
                lines.append(dedup)
    return {'fill': fill, 'lines': lines}


def save_plan_shape(asset_id, shape):
    data = {}
    if os.path.exists(PLAN_SHAPES):
        with open(PLAN_SHAPES) as f:
            data = json.load(f)
    data[asset_id] = shape
    with open(PLAN_SHAPES, 'w') as f:
        json.dump(dict(sorted(data.items())), f, separators=(',', ':'))
        f.write('\n')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('models', nargs='*', default=MODELS)
    p.add_argument('--blend', action='store_true')
    p.add_argument('--preview', metavar='DIR')
    p.add_argument('--thumbs', action='store_true')
    p.add_argument('--plan', action='store_true')
    a = p.parse_args()
    for name in a.models:
        mod = importlib.import_module(name)
        reset()
        mod.build()
        glb = os.path.join(ROOT, 'public', 'assets', '3d', f'{mod.ID}.glb')
        blend = os.path.join(ROOT, 'assets', 'blender', f'{mod.ID}.blend') if a.blend else None
        if blend:
            os.makedirs(os.path.dirname(blend), exist_ok=True)
        size = model_size()
        export(glb, blend)
        print(f'{mod.ID}: {size[0]} × {size[1]} × {size[2]} mm, {os.path.getsize(glb) // 1024} kB → {os.path.relpath(glb, ROOT)}')
        if a.plan:
            shape = plan_shape()
            if shape:
                save_plan_shape(mod.ID, shape)
                print(f'  plan: {len(shape["fill"])} rings, {len(shape["lines"])} detail lines')
        if a.thumbs:
            thumbs = os.path.join(ROOT, 'public', 'assets', 'thumbs')
            os.makedirs(thumbs, exist_ok=True)
            thumbnail(os.path.join(thumbs, f'{mod.ID}.png'))
        if a.preview:
            preview(os.path.join(a.preview, f'{mod.ID}.png'))


if __name__ == '__main__':
    main()
