"""
Long torso mannequins: 112-18-001 (female) and 112-18-002 (male).

A tailor's form covered in linen, from the neck to mid-thigh with the legs
apart, on a steel pole and round base; jointed oak arms with hands and an
oak neck cap. There is no drawing of these two: the figure is built to
ordinary body measures at the sizes the brand shows (EU 36, EU 48), and to
the overall sizes in the catalogue.

The body is lofted through cross-sections that are not plain ellipses:
each has its own width, its depth to the front and to the back, how square
it is, and how far the chest, the seat and the hollow of the spine stand
out — which is what makes it read as a body rather than a cushion.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import MM, cylinder, material

# What a cross-section is made of, in the order the tuples below give it.
FIELDS = ('z', 'w', 'f', 'b', 'n', 'cy', 'chest', 'seat', 'spine', 'cx')
DEFAULTS = dict(n=2.2, cy=0.0, chest=0.0, seat=0.0, spine=0.0, cx=0.0)


def sec(z, w, f, b, **more):
    """
    One cross-section at height `z`: half-width `w`, depth to the front `f`
    and to the back `b` (all mm). `n` is how square it is (2 = an ellipse),
    `cy` moves it backwards, `cx` sideways; `chest` and `seat` are how far
    the two halves of the chest and of the seat stand out, `spine` how deep
    the hollow down the back is.
    """
    return dict(DEFAULTS, z=z, w=w, f=f, b=b, **more)


def _monotone(xs, ys):
    """A smooth curve through (xs, ys) that never overshoots (Fritsch–Carlson)."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [d[0]] + [0.0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2 for i in range(1, n - 1)] + [d[-1]]
    for i in range(n - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0.0
            continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        s = a * a + b * b
        if s > 9:
            t = 3 / math.sqrt(s)
            m[i], m[i + 1] = t * a * d[i], t * b * d[i]

    def at(x):
        i = max(0, min(n - 2, next((k for k in range(n - 1) if x <= xs[k + 1]), n - 2)))
        t = (x - xs[i]) / h[i]
        return ((2 * t ** 3 - 3 * t ** 2 + 1) * ys[i] + (t ** 3 - 2 * t ** 2 + t) * h[i] * m[i]
                + (-2 * t ** 3 + 3 * t ** 2) * ys[i + 1] + (t ** 3 - t ** 2) * h[i] * m[i + 1])
    return at


def _ring(s, segments, chest_at, chest_wide):
    """The outline of one cross-section, anticlockwise from the right-hand side."""
    pts = []
    lobes = lambda u, at, wide: math.exp(-((u - at) ** 2) / (2 * wide * wide)) + math.exp(-((u + at) ** 2) / (2 * wide * wide))  # noqa: E731
    for k in range(segments):
        t = 2 * math.pi * k / segments
        c, sn = math.cos(t), math.sin(t)
        e = 2 / s['n']
        u = math.copysign(abs(c) ** e, c)
        y = (s['b'] if sn > 0 else s['f']) * math.copysign(abs(sn) ** e, sn)
        if sn < 0:
            y -= s['chest'] * lobes(u, chest_at, chest_wide) * (-sn) ** 1.3
        else:
            y += s['seat'] * lobes(u, 0.46, 0.27) * sn ** 1.3
            y -= s['spine'] * math.exp(-(u * u) / (2 * 0.13 ** 2)) * sn
        pts.append((u * s['w'] + s['cx'], y + s['cy'], s['z']))
    return pts


def body(name, sections, mat, segments=48, step=14.0, chest_at=0.5, chest_wide=0.27):
    """
    A smooth closed body through `sections` (see `sec`), bottom to top, a
    ring every `step` mm or so, capped flat at both ends.
    """
    zs = [s['z'] for s in sections]
    curves = {k: _monotone(zs, [s[k] for s in sections]) for k in FIELDS if k != 'z'}
    heights = []
    for lo, hi in zip(zs, zs[1:]):
        n = max(1, round((hi - lo) / step))
        heights += [lo + (hi - lo) * i / n for i in range(n)]
    heights.append(zs[-1])
    bm = bmesh.new()
    loops = []
    for z in heights:
        s = {k: curves[k](z) for k in curves}
        s['z'] = z
        loops.append([bm.verts.new((x * MM, y * MM, zz * MM)) for x, y, zz in _ring(s, segments, chest_at, chest_wide)])
    sides = []
    for lo, hi in zip(loops, loops[1:]):
        for k in range(segments):
            sides.append(bm.faces.new((lo[k], lo[(k + 1) % segments], hi[(k + 1) % segments], hi[k])))
    for f in sides:
        f.smooth = True
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(material(mat))
    return obj


def limb(name, a, b, ra, rb, mat, segments=20):
    """A round, tapering length from point `a` (radius `ra`) to point `b` (radius `rb`), mm."""
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    made = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                                 radius1=ra * MM, radius2=rb * MM, depth=(b - a).length * MM)
    turn = Vector((0, 0, 1)).rotation_difference((b - a).normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2 * MM) @ turn, verts=made['verts'])
    for f in bm.faces:
        f.smooth = len(f.verts) == 4
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(material(mat))
    return obj


def ball(name, r, at, mat, squash=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1, location=[c * MM for c in at])
    o = bpy.context.active_object
    o.name = name
    o.scale = (r * squash[0] * MM, r * squash[1] * MM, r * squash[2] * MM)
    o.data.materials.append(material(mat))
    o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    return o


def _flat_ends(obj):
    """Cylinders: smooth sides, crisp flat ends."""
    obj.data.polygons.foreach_set('use_smooth', [abs(p.normal.z) < 0.5 for p in obj.data.polygons])
    return obj


def _round_edge(obj, width):
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = width * MM
    m.segments = 3
    m.limit_method = 'ANGLE'
    return obj


def _stand(top):
    """The steel base and pole, up into the figure between the legs."""
    _round_edge(_flat_ends(cylinder('base', 150, 8, (0, 0, 4), mat='steel', verts=64)), 2.5)
    _round_edge(_flat_ends(cylinder('base.boss', 26, 22, (0, 0, 19), mat='steel', verts=32)), 3)
    _flat_ends(cylinder('pole', 12.5, top - 8, (0, 0, 8 + (top - 8) / 2), mat='steel', verts=24))
    # Where the height is set: a sleeve with its screw to the back.
    sleeve = top * 0.52
    _round_edge(_flat_ends(cylinder('pole.sleeve', 17, 46, (0, 0, sleeve), mat='steel', verts=24)), 1.5)
    _flat_ends(cylinder('pole.screw', 5, 26, (0, 26, sleeve), axis='y', mat='steel_dark', verts=12))
    ball('pole.knob', 9, (0, 42, sleeve), 'steel_dark', squash=(1, 0.7, 1))


def _hand(name, side, wrist, towards, size):
    """
    A wooden hand hanging from `wrist` in the direction `towards`: a flat
    palm running out into the fingers, thumb to the front, palm to the body.
    """
    k = size / 185.0
    hand = body(name, [
        sec(-185 * k, 5 * k, 18 * k, 16 * k, n=2.4),
        sec(-176 * k, 7.5 * k, 29 * k, 25 * k, n=2.6),
        sec(-140 * k, 9.5 * k, 37 * k, 33 * k, n=2.8),
        sec(-98 * k, 11.5 * k, 41 * k, 37 * k, n=2.8),
        sec(-55 * k, 14 * k, 39 * k, 37 * k, n=2.6),
        sec(-18 * k, 15 * k, 27 * k, 27 * k, n=2.3),
        sec(0, 14 * k, 21 * k, 21 * k, n=2.2),
    ], 'oak', segments=24, step=12)
    thumb = limb(f'{name}.thumb', (-side * 3 * k, -30 * k, -32 * k), (-side * 9 * k, -50 * k, -104 * k), 11 * k, 8 * k, 'oak', segments=12)
    tip = ball(f'{name}.thumb.tip', 8 * k, (-side * 9 * k, -50 * k, -104 * k), 'oak')
    turn = Vector((0, 0, -1)).rotation_difference(Vector(towards).normalized()).to_matrix().to_4x4()
    bpy.context.view_layer.update()
    for o in (hand, thumb, tip):
        o.matrix_world = Matrix.Translation(Vector(wrist) * MM) @ turn @ o.matrix_world
    return hand


def _arm(side, shoulder, upper, fore, hand, r):
    """
    One jointed oak arm, hanging a little out from the body with the
    forearm bent slightly forwards. `r` is the upper arm's radius at the
    shoulder; the rest follows from it.
    """
    s = Vector(shoulder)
    # Down, a touch outwards and back; then the forearm forwards and in again.
    elbow = s + Vector((side * math.sin(math.radians(2)), math.sin(math.radians(4)), -1)).normalized() * upper
    wrist = elbow + Vector((-side * math.sin(math.radians(1)), -math.sin(math.radians(14)), -1)).normalized() * fore
    # The joints are balls a little fuller than the lengths they join, as on a jointed wooden arm.
    ball(f'arm{side}.shoulder', r * 1.08, s, 'oak')
    limb(f'arm{side}.upper', s, elbow, r, r * 0.80, 'oak')
    ball(f'arm{side}.elbow', r * 0.92, elbow, 'oak')
    limb(f'arm{side}.fore', elbow, wrist, r * 0.78, r * 0.54, 'oak')
    ball(f'arm{side}.wrist', r * 0.64, wrist, 'oak')
    _hand(f'hand{side}', side, wrist, wrist - elbow + Vector((0, 0, -fore * 0.25)), hand)


def mannequin(torso, thigh, neck, arm, chest_at=0.5, chest_wide=0.27):
    """
    `torso`: its cross-sections, bottom to top, ending with the neck.
    `thigh`: (x of each leg at the top, at the cut; radius at the top, at the
    cut; height it starts inside the hip; height of the cut).
    `neck`: its radius. `arm`: (shoulder x, shoulder z, upper arm, forearm,
    hand, radius).
    """
    body('torso', torso, 'linen', chest_at=chest_at, chest_wide=chest_wide)
    x0, x1, r0, r1, z_top, z_cut = thigh
    for side in (-1, 1):
        mid = (z_top + z_cut) / 2
        body(f'thigh{side}', [
            sec(z_cut, r1, r1, r1, n=2.0, cx=side * x1, cy=4),
            sec(z_cut + 60, r1 * 1.04, r1 * 1.04, r1 * 1.05, n=2.0, cx=side * (x1 + (x0 - x1) * 0.25), cy=4),
            sec(mid, (r0 + r1) / 2 * 1.03, (r0 + r1) / 2 * 1.02, (r0 + r1) / 2 * 1.08, n=2.0, cx=side * (x0 + x1) / 2, cy=5),
            sec(z_top - 40, r0, r0 * 0.98, r0 * 1.08, n=2.0, cx=side * x0, cy=6),
            sec(z_top, r0 * 0.9, r0 * 0.85, r0 * 0.95, n=2.0, cx=side * x0, cy=6),
        ], 'linen', segments=32, step=16)
    top = torso[-1]['z']
    cap = _round_edge(_flat_ends(cylinder('neck.cap', neck + 5, 16, (0, torso[-1]['cy'], top + 8), mat='oak', verts=32)), 4)
    cap.name = 'neck.cap'
    _stand(z_top - 30)
    sx, sz, upper, fore, hand, r = arm
    for side in (-1, 1):
        _arm(side, (side * sx, 6, sz), upper, fore, hand, r)


def female():
    """112-18-001, EU 36: bust 84, waist 62, hips 90 cm."""
    mannequin(
        torso=[
            sec(752, 50, 34, 38),
            sec(772, 132, 76, 86, n=2.3),
            sec(800, 166, 96, 108, n=2.3, seat=10),
            sec(890, 170, 102, 114, n=2.3, seat=20, cy=7, spine=3),
            sec(975, 144, 94, 96, n=2.25, seat=5, cy=7, spine=6),
            sec(1065, 113, 82, 76, n=2.2, cy=5, spine=9),
            sec(1140, 121, 88, 82, n=2.25, cy=3, spine=10),
            sec(1180, 130, 95, 87, n=2.3, chest=8, cy=3, spine=9),
            sec(1208, 137, 100, 90, n=2.3, chest=30, cy=3, spine=8),
            sec(1240, 143, 103, 92, n=2.35, chest=34, cy=4, spine=7),
            sec(1290, 151, 99, 94, n=2.45, chest=11, cy=6, spine=4),
            sec(1346, 160, 87, 90, n=2.6, cy=8),
            sec(1378, 152, 75, 83, n=2.6, cy=10),
            sec(1400, 112, 64, 73, n=2.3, cy=12),
            sec(1420, 64, 53, 59, n=2.0, cy=12),
            sec(1445, 49, 48, 50, n=2.0, cy=11),
            sec(1477, 49, 49, 50, n=2.0, cy=10),
        ],
        thigh=(87, 84, 84, 71, 850, 590),
        neck=49,
        arm=(183, 1342, 268, 232, 170, 32),
        chest_at=0.5, chest_wide=0.25,
    )


def male():
    """112-18-002, EU 48: chest 96, waist 80, hips 94 cm."""
    mannequin(
        torso=[
            sec(712, 55, 38, 40),
            sec(732, 140, 82, 88, n=2.4),
            sec(760, 170, 102, 112, n=2.4, seat=8),
            sec(850, 172, 108, 118, n=2.4, seat=18, cy=6, spine=3),
            sec(925, 158, 103, 104, n=2.4, seat=5, cy=6, spine=6),
            sec(1010, 147, 96, 92, n=2.4, cy=5, spine=10),
            sec(1110, 155, 102, 97, n=2.45, cy=3, spine=11),
            sec(1168, 163, 108, 102, n=2.45, chest=2, cy=2, spine=11),
            sec(1200, 169, 114, 105, n=2.5, chest=9, cy=2, spine=10),
            sec(1250, 178, 119, 108, n=2.5, chest=12, cy=3, spine=8),
            sec(1300, 187, 113, 108, n=2.6, chest=6, cy=6, spine=5),
            sec(1358, 193, 97, 101, n=2.7, cy=9),
            sec(1394, 184, 84, 93, n=2.7, cy=11),
            sec(1418, 138, 71, 81, n=2.4, cy=13),
            sec(1440, 78, 61, 67, n=2.0, cy=13),
            sec(1470, 57, 56, 58, n=2.0, cy=12),
            sec(1507, 57, 57, 58, n=2.0, cy=11),
        ],
        thigh=(90, 88, 88, 76, 810, 545),
        neck=57,
        arm=(210, 1354, 288, 248, 186, 38),
        chest_at=0.47, chest_wide=0.34,
    )
