"""
Shared helpers for the Blender-built catalog models.

Conventions (match the planner): millimetres in, metres out; the model
stands on z = 0, centred on x; its back (the wall side) faces +Y in
Blender, which the glTF exporter turns into -Z, the planner's "back".
"""

import math
import bpy
import bmesh

MM = 0.001

# Materials tuned for the planner's lighting (no environment map): metals
# stay well below metallic 1 or they render near-black in the browser.
MATERIALS = {
    'steel': dict(color=(0.84, 0.85, 0.86, 1), metallic=0.3, roughness=0.34),
    'steel_dark': dict(color=(0.55, 0.56, 0.57, 1), metallic=0.5, roughness=0.35),
    'laminate': dict(color=(0.86, 0.86, 0.86, 1), metallic=0.25, roughness=0.38),
    'oak': dict(color=(0.80, 0.60, 0.33, 1), metallic=0.0, roughness=0.62),
    # No reflections in the planner: a light, cool grey reads as mirror.
    'mirror': dict(color=(0.86, 0.90, 0.93, 1), metallic=0.15, roughness=0.05),
    'acrylic': dict(color=(0.93, 0.96, 0.97, 0.35), metallic=0.0, roughness=0.05),
    'mdf_paint': dict(color=(0.80, 0.82, 0.74, 1), metallic=0.0, roughness=0.5),
    'screen': dict(color=(0.05, 0.05, 0.06, 1), metallic=0.2, roughness=0.15),
    'light_panel': dict(color=(0.97, 0.97, 0.96, 1), metallic=0.0, roughness=0.3),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    spec = MATERIALS[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = spec['color']
    bsdf.inputs['Metallic'].default_value = spec['metallic']
    bsdf.inputs['Roughness'].default_value = spec['roughness']
    if spec['color'][3] < 1:
        bsdf.inputs['Alpha'].default_value = spec['color'][3]
        mat.blend_method = 'BLEND'
    return mat


def _finish(obj, mat, bevel):
    obj.data.materials.append(material(mat))
    if bevel:
        m = obj.modifiers.new('bevel', 'BEVEL')
        m.width = bevel * MM
        m.segments = 2
        m.limit_method = 'ANGLE'
    for f in obj.data.polygons:
        f.use_smooth = False
    return obj


def box(name, size, at, mat='steel', bevel=0.6):
    """Axis-aligned box; `size` (x, y, z) and `at` (its centre) in mm."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * size[0] * MM + at[0] * MM
        v.co.y = v.co.y * size[1] * MM + at[1] * MM
        v.co.z = v.co.z * size[2] * MM + at[2] * MM
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return _finish(obj, mat, bevel)


def angle(name, axis, length, at, legs=('-y', '-z'), size=40, t=4, mat='steel'):
    """
    An L-profile (size × size × t) running along `axis` ('x', 'y' or 'z'),
    `length` long, centred at `at`. `legs` gives the directions the two legs
    point from the corner (e.g. ('-y', '-z') for a rail whose legs go
    forwards and down).
    """
    parts = []
    for leg in legs:
        sign = -1 if leg[0] == '-' else 1
        ax = leg[1]
        dims = {'x': t, 'y': t, 'z': t}
        dims[axis] = length
        dims[ax] = size
        centre = list(at)
        idx = 'xyz'.index(ax)
        centre[idx] += sign * (size / 2 - t / 2)
        parts.append(box(f'{name}.{ax}', (dims['x'], dims['y'], dims['z']), centre, mat))
    return parts


def cylinder(name, radius, depth, at, axis='z', mat='steel_dark', verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius * MM, depth=depth * MM, location=[c * MM for c in at])
    obj = bpy.context.active_object
    obj.name = name
    if axis == 'x':
        obj.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'y':
        obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(material(mat))
    return obj


def bolt(name, at, axis='y'):
    """A small hex bolt head on a surface."""
    return cylinder(name, 5, 3, at, axis=axis, verts=6)


def export(glb_path, blend_path=None):
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == 'MESH')
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
