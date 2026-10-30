"""
Models made from the supplier's STEP files (SolidWorks exports), and
variants derived from them by stretching: the racks share profiles, so a
700 rack is the 1400 one with its rails 510 mm shorter, and an H1700 rack
the 1500 one with its posts 200 mm longer.

The STEP is converted to OBJ with OpenCascade (step-to-obj.mjs, cached in
.cache/); everything here is in millimetres until the export.
"""

import math
import os
import subprocess

import bpy

from common import MM, material

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, '.cache')


def _obj_for(step_name):
    step = os.path.join(ROOT, 'public', 'assets', '3d', f'{step_name}.step')
    obj = os.path.join(CACHE, f'{step_name}.obj')
    if not os.path.exists(obj) or os.path.getmtime(obj) < os.path.getmtime(step):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(['node', os.path.join(HERE, 'step-to-obj.mjs'), step, obj], check=True)
    return obj


def import_step(step_name, materials=lambda name: 'steel', drop=()):
    """
    Imports a STEP (via OBJ), turns it Y-up → Z-up, centres it on x and y
    with its lowest point on z = 0, and assigns a material per part name.
    Parts whose name contains any of `drop` (e.g. hidden felt pads) are
    left out.
    """
    bpy.ops.wm.obj_import(filepath=_obj_for(step_name), up_axis='Y', forward_axis='NEGATIVE_Z', global_scale=MM)
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in list(parts):
        if any(d in o.name for d in drop):
            bpy.data.objects.remove(o, do_unlink=True)
            parts.remove(o)
    # The importer turns and scales the objects; bake that into the vertices.
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo = [min(v.co[k] for o in parts for v in o.data.vertices) for k in range(3)]
    hi = [max(v.co[k] for o in parts for v in o.data.vertices) for k in range(3)]
    shift = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]]
    for o in parts:
        for v in o.data.vertices:
            v.co.x += shift[0]
            v.co.y += shift[1]
            v.co.z += shift[2]
        o.data.update()
        o.data.materials.clear()
        o.data.materials.append(material(materials(o.name)))
    return parts


def stretch(parts, *, taller=0.0, narrower=0.0, above=1200.0, scale_z=1.0):
    """
    Taller: everything above `above` mm moves up by `taller` mm. Narrower:
    both halves move towards the middle by half of `narrower` mm. scale_z
    scales heights uniformly (for plain blocks).
    """
    for o in parts:
        for v in o.data.vertices:
            if taller and v.co.z > above * MM:
                v.co.z += taller * MM
            if narrower:
                v.co.x -= (narrower / 2) * MM * (1 if v.co.x > 0 else -1)
            if scale_z != 1.0:
                v.co.z *= scale_z
        o.data.update()


def weld(parts):
    """Shares vertices between triangles (OBJ import keeps them apart), for a smaller file."""
    import bmesh

    for o in parts:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.05 * MM)
        # Flat faces split into many triangles by the tessellation: merge them.
        bmesh.ops.dissolve_limit(bm, angle_limit=0.5 * math.pi / 180, verts=bm.verts, edges=bm.edges)
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()
    # Rounded edges shade smooth (and share vertices in the GLB); corners stay crisp.
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))


# ---------------------------------------------------------------------------
# Floor racks (105-06-001-E.step: 1310 × 500 × 1512 mm)
# ---------------------------------------------------------------------------

def floor_rack(*, taller=0.0, narrower=0.0):
    # M6 bolts and felt pads are too small to see in a shop plan.
    parts = import_step('105-06-001-E', lambda name: 'steel', drop=('feltpad', 'ISO_4762'))
    stretch(parts, taller=taller, narrower=narrower)
    weld(parts)
    return parts


# ---------------------------------------------------------------------------
# Oak podiums (105-09-002-A.step: 400 × 400 × 550 mm)
# ---------------------------------------------------------------------------

def podium(height=550.0):
    parts = import_step('105-09-002-A', lambda name: 'oak')
    if height != 550.0:
        stretch(parts, scale_z=height / 550.0)
    return parts
