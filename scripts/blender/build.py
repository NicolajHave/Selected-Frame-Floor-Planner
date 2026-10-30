"""
Builds Blender catalog models into the planner's GLB files.

    python scripts/blender/build.py [module ...] [--blend] [--preview DIR]

Needs Blender as a Python module (`pip install bpy==4.5.14`, Python 3.11).
Each module defines ID and build(). Output: public/assets/3d/<ID>.glb, and
with --blend also assets/blender/<ID>.blend for hand editing in Blender.
"""

import argparse
import importlib
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


def main():
    p = argparse.ArgumentParser()
    p.add_argument('models', nargs='*', default=MODELS)
    p.add_argument('--blend', action='store_true')
    p.add_argument('--preview', metavar='DIR')
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
        if a.preview:
            preview(os.path.join(a.preview, f'{mod.ID}.png'))


if __name__ == '__main__':
    main()
