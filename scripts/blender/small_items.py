"""
The smaller catalog items, modelled from the catalog renders and their
catalog dimensions: the Iconic podium, logos, signs, trays, the
accessories rack, mannequins and the carpet. Millimetres; z up; the room
side faces -Y (wall-mounted items have their back on +Y).
"""

import math
import os

import addon_utils
import bmesh
import bpy

from common import MM, angle, box, cylinder, material


def smooth(obj):
    obj.data.polygons.foreach_set('use_smooth', [True] * len(obj.data.polygons))
    return obj


def round_sides(obj):
    """Cylinders: smooth sides, crisp flat ends."""
    obj.data.polygons.foreach_set('use_smooth', [abs(p.normal.z) < 0.5 for p in obj.data.polygons])
    return obj


# ---------------------------------------------------------------------------
# Podium
# ---------------------------------------------------------------------------

def iconic_podium():
    """105-09-001: lacquered MDF cylinder, Ø 450 × 750 mm."""
    round_sides(cylinder('podium', 225, 750, (0, 0, 375), mat='mint_gloss', verts=64))


# ---------------------------------------------------------------------------
# Logos: the Selected wordmark, 1200 × 225 mm
# ---------------------------------------------------------------------------

WORDMARK_SVG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'selected-wordmark.svg')


def _wordmark(name, depth, mat, y_front, width=1200.0, height=225.0):
    """
    The Selected wordmark (from the brand's vector file) standing up, its
    front at `y_front`, `depth` deep, as large as fits in width × height
    without distorting it, centred on x with its baseline-box bottom at z = 0.
    """
    addon_utils.enable('io_curve_svg')
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=WORDMARK_SVG)
    curves = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']
    for o in curves:
        o.data.dimensions = '2D'
        o.data.fill_mode = 'BOTH'
        o.data.extrude = 0.001
        o.data.resolution_u = 6
    bpy.ops.object.select_all(action='DESELECT')
    for o in curves:
        o.select_set(True)
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    # Bake the importer's object transform into the vertices.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for coll in list(obj.users_collection):
        if coll is not bpy.context.scene.collection and coll.name != 'Collection':
            bpy.context.scene.collection.objects.link(obj)
            coll.objects.unlink(obj)
            if not coll.objects:
                bpy.data.collections.remove(coll)
    me = obj.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    s = min(width / (max(xs) - min(xs)), height / (max(ys) - min(ys)))
    cx = (max(xs) + min(xs)) / 2
    z0, z1 = min(zs), max(zs)
    for v in me.vertices:
        x = (v.co.x - cx) * s
        z = (v.co.y - min(ys)) * s
        # Letter thickness: the extrusion (z0…z1) becomes `depth` mm, front at y_front.
        y = y_front + (z1 - v.co.z) / (z1 - z0) * depth
        v.co = (x * MM, y * MM, z * MM)
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(material(mat))
    obj.select_set(False)
    return obj


def logo(kind):
    """Centred on y = 0 with its back on the wall, as deep as the catalog says."""
    if kind == 'corona':
        # Steel letters on 20 mm spacers, lit from behind: a warm halo on the wall.
        # 6 mm steel letters on 14 mm spacers (20 mm in all).
        letters = _wordmark('letters', 6, 'steel', -10, width=1170, height=215)
        halo = _wordmark('halo', 1, 'glow_warm', 9)
        # Centre the letters on their slightly larger halo.
        lz = [v.co.z for v in letters.data.vertices]
        hz = [v.co.z for v in halo.data.vertices]
        dz = (max(hz) + min(hz) - max(lz) - min(lz)) / 2
        for v in letters.data.vertices:
            v.co.z += dz
    elif kind == 'steel':
        # Brushed steel, 6 mm, flat on the wall.
        _wordmark('letters', 6, 'steel', -3)
    else:
        # LED: white, front-lit letters, 25 mm deep.
        _wordmark('letters', 25, 'glow_white', -12.5)


# ---------------------------------------------------------------------------
# Signs
# ---------------------------------------------------------------------------

def table_sign():
    """105-13-023: A5 portrait (148 × 210) between two acrylic sheets, magnets, on a steel foot."""
    box('foot', (148, 50, 12), (0, 0, 6), bevel=1)
    for y in (-4, 4):
        box(f'acrylic{y}', (148, 3, 198), (0, y, 12 + 99), mat='acrylic', bevel=0.5)
    box('insert', (140, 1, 190), (0, 0, 12 + 99), mat='paper', bevel=0)
    for x in (-62, 62):
        for z in (30, 192):
            cylinder(f'magnet{x}.{z}', 4, 10, (x, 0, z), axis='y', mat='steel_dark', verts=16)


def floor_price_sign():
    """105-18-001: 2 mm stainless, a sloped A5 face rising to 51 mm at the back, 180 × 241."""
    rise = 51.2
    run = 241
    slope = math.atan2(rise - 2, run - 20)
    # Front flange on the floor.
    box('flange', (180, 20, 2), (0, -run / 2 + 10, 1), bevel=0.3)
    # Sloped face from the flange up to the back.
    length = math.hypot(run - 20, rise - 2)
    face = box('face', (180, length, 2), (0, 10, rise / 2), bevel=0.3)
    face.rotation_euler = (slope, 0, 0)
    bpy.context.view_layer.update()
    # Price card on the face.
    card = box('card', (150, length - 40, 1), (0, 10, rise / 2 + 1.5), mat='screen', bevel=0)
    card.rotation_euler = (slope, 0, 0)


def rack_sign():
    """105-06-011-22-C: A5 acrylic sign in a steel holder on a pin (148.5 × 19.6 × 324.9)."""
    cylinder('pin', 6, 95, (0, 0, 47.5), mat='steel', verts=16)
    box('holder', (148.5, 19.6, 20), (0, 0, 105), bevel=1)
    box('acrylic', (148.5, 6, 210), (0, 0, 115 + 105), mat='acrylic', bevel=0.5)
    box('insert', (140, 1, 200), (0, 0, 115 + 105), mat='paper', bevel=0)


# ---------------------------------------------------------------------------
# Trays and the accessories rack
# ---------------------------------------------------------------------------

def leather_tray():
    """105-15-001: leather tray 420 × 275 × 28 with a raised rim, on two runners."""
    w, d, h, rim = 420, 275, 28, 6
    box('runner.l', (30, d - 60, 6), (-w / 2 + 60, 0, 3), mat='leather', bevel=1)
    box('runner.r', (30, d - 60, 6), (w / 2 - 60, 0, 3), mat='leather', bevel=1)
    box('base', (w, d, 6), (0, 0, 9), mat='leather', bevel=1.5)
    for name, size, at in (
        ('front', (w, rim, h - 6), (0, -d / 2 + rim / 2, 6 + (h - 6) / 2)),
        ('back', (w, rim, h - 6), (0, d / 2 - rim / 2, 6 + (h - 6) / 2)),
        ('left', (rim, d, h - 6), (-w / 2 + rim / 2, 0, 6 + (h - 6) / 2)),
        ('right', (rim, d, h - 6), (w / 2 - rim / 2, 0, 6 + (h - 6) / 2)),
    ):
        box(f'rim.{name}', size, at, mat='leather', bevel=1.5)


def oak_tray(cols, rows, w, d, h=70):
    """Oak tray with a grid of compartments (105-15-003 / -004)."""
    t, base = 10, 8
    box('base', (w, d, base), (0, 0, base / 2), mat='oak', bevel=0.8)
    for name, size, at in (
        ('front', (w, t, h), (0, -d / 2 + t / 2, h / 2)),
        ('back', (w, t, h), (0, d / 2 - t / 2, h / 2)),
        ('left', (t, d, h), (-w / 2 + t / 2, 0, h / 2)),
        ('right', (t, d, h), (w / 2 - t / 2, 0, h / 2)),
    ):
        box(f'wall.{name}', size, at, mat='oak', bevel=0.8)
    inner_w, inner_d = w - 2 * t, d - 2 * t
    for i in range(1, cols):
        x = -inner_w / 2 + i * inner_w / cols
        box(f'div.x{i}', (5, inner_d, h - 15), (x, 0, base + (h - 15) / 2), mat='oak', bevel=0.4)
    for j in range(1, rows):
        y = -inner_d / 2 + j * inner_d / rows
        box(f'div.y{j}', (inner_w, 5, h - 15), (0, y, base + (h - 15) / 2), mat='oak', bevel=0.4)


def accessories_rack():
    """105-15-002: slotted steel panel on two posts with T-feet, 756.2 × 500 × 1508."""
    w, d, h = 756.2, 500, 1508
    for side in (-1, 1):
        inward = '-x' if side > 0 else '+x'
        angle(f'post{side}.f', 'z', h - 8, (side * (w / 2 - 2), -2, 8 + (h - 8) / 2), legs=(inward, '-y'))
        angle(f'post{side}.b', 'z', h - 8, (side * (w / 2 - 2), 2, 8 + (h - 8) / 2), legs=(inward, '+y'))
        box(f'foot{side}', (80, d, 8), (side * (w / 2 - 40), 0, 4), bevel=1)
    pw, ph = w - 90, h - 140
    z0 = 90
    box('panel', (pw, 3, ph), (0, 0, z0 + ph / 2), mat='steel_dark', bevel=0.5)
    # Two columns of slots, both faces.
    n = 24
    for k in range(n):
        z = z0 + 60 + k * (ph - 120) / (n - 1)
        for x in (-pw / 4, pw / 4):
            for y in (-1.6, 1.6):
                box(f'slot{k}.{x}.{y}', (pw / 2 - 70, 0.6, 6), (x, y, z), mat='screen', bevel=0)
    # A few hooks.
    for k, (x, z) in enumerate(((-pw / 4, 1100), (pw / 4, 1100), (-pw / 4, 700), (pw / 4, 700))):
        box(f'hook{k}', (120, 60, 8), (x, -32, z), mat='steel', bevel=1)


# ---------------------------------------------------------------------------
# Mannequins: long torso dress forms with wooden arms, on a pole and base
# ---------------------------------------------------------------------------

def _ellipsoid(name, r, at, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=[c * MM for c in at])
    o = bpy.context.active_object
    o.name = name
    o.scale = (r[0] * MM, r[1] * MM, r[2] * MM)
    o.data.materials.append(material(mat))
    return smooth(o)


def _loft(name, sections, mat, segments=40, steps=6):
    """
    A smooth closed body through elliptical cross-sections
    [(z, rx, ry), ...] (mm, bottom to top), interpolated with a
    Catmull-Rom curve and capped at both ends.
    """
    def catmull(p0, p1, p2, p3, t):
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)

    pts = [sections[0]] + list(sections) + [sections[-1]]
    rings = []
    for i in range(1, len(pts) - 2):
        for k in range(steps):
            t = k / steps
            rings.append(tuple(catmull(pts[i - 1][j], pts[i][j], pts[i + 1][j], pts[i + 2][j], t) for j in range(3)))
    rings.append(sections[-1])
    bm = bmesh.new()
    loops = []
    for z, rx, ry in rings:
        loops.append([
            bm.verts.new((math.cos(2 * math.pi * k / segments) * rx * MM,
                          math.sin(2 * math.pi * k / segments) * ry * MM, z * MM))
            for k in range(segments)
        ])
    for lo, hi in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((lo[k], lo[(k + 1) % segments], hi[(k + 1) % segments], hi[k]))
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(material(mat))
    return smooth(obj)


def mannequin(height, shoulders, chest, waist, hips):
    """
    A long torso dress form: one smooth body from mid-thigh to neck,
    birch arms and neck cap, on a steel pole and round base.
    """
    round_sides(cylinder('base', 150, 8, (0, 0, 4), mat='steel', verts=48))
    bottom = height * 0.43
    round_sides(cylinder('pole', 10, bottom - 8, (0, 0, 8 + (bottom - 8) / 2), mat='steel', verts=16))
    neck = height - 85
    span = neck - bottom
    at = lambda f: bottom + f * span  # noqa: E731
    _loft('torso', [
        (at(0.00), hips * 0.34, hips * 0.24),     # mid-thigh, closing
        (at(0.06), hips * 0.46, hips * 0.31),
        (at(0.20), hips * 0.50, hips * 0.33),     # hips
        (at(0.42), waist * 0.50, waist * 0.36),   # waist
        (at(0.66), chest * 0.50, chest * 0.37),   # chest
        (at(0.84), shoulders * 0.50, chest * 0.33),  # shoulders
        (at(0.93), shoulders * 0.36, chest * 0.26),
        (at(1.00), 60, 52),                        # base of the neck
    ], 'linen')
    round_sides(cylinder('neck', 52, 70, (0, 0, neck + 35), mat='linen', verts=24))
    round_sides(cylinder('neck.cap', 56, 8, (0, 0, neck + 74), mat='birch', verts=24))
    for side in (-1, 1):
        x = side * (shoulders / 2 + 12)
        top = at(0.84)
        upper = round_sides(cylinder(f'arm{side}.upper', 27, 290, (x, 0, top - 150), mat='birch', verts=16))
        upper.rotation_euler = (0, side * 0.06, 0)
        round_sides(cylinder(f'arm{side}.elbow', 26, 20, (x + side * 9, -4, top - 300), mat='birch', verts=16))
        lower = round_sides(cylinder(f'arm{side}.lower', 22, 260, (x + side * 14, -26, top - 435), mat='birch', verts=16))
        lower.rotation_euler = (0.2, side * 0.03, 0)
        _ellipsoid(f'hand{side}', (20, 34, 68), (x + side * 18, -52, top - 600), 'birch')


# ---------------------------------------------------------------------------
# Carpet: an organic shape, 2424 × 2809 × 25
# ---------------------------------------------------------------------------

def carpet(w=2424.0, d=2809.0, h=25.0):
    n = 160
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = 1 + 0.16 * math.sin(2 * a + 0.6) + 0.09 * math.sin(3 * a + 2.1) + 0.05 * math.sin(5 * a + 0.3)
        pts.append((math.cos(a) * r, math.sin(a) * r))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    sx = w / (max(xs) - min(xs))
    sy = d / (max(ys) - min(ys))
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    bm = bmesh.new()
    verts = [bm.verts.new(((x - cx) * sx * MM, (y - cy) * sy * MM, 0)) for x, y in pts]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z = h * MM
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('carpet')
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new('carpet', me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(material('carpet'))
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = 6 * MM
    m.segments = 3
    return obj
