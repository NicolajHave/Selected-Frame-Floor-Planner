"""
105-99-004 Wall Unit 1400 – Shelves (1496 × 517 × 2288 mm).

Built from the &elements parts list (40×40×4 stainless angles, shelf
plates 19 mm MDF with brushed steel laminate and 2 mm oak edges, brackets
380 mm to the wall) and the catalog render.
"""

from common import MM, angle, bolt, box

ID = '105-99-004'
W, D, H = 1496, 517, 2288
FRONT = -D / 2           # the room side
COL = 40                 # column width (x) …
COL_D = 80               # … and depth (y): two angles back to back
FOOT = 30
POST = 2250              # column height above the feet
SHELF_TOPS = [420, 800, 1160, 1520]
SHELF_DEPTH = 400
SHELF_T = 19


def build():
    xo = W / 2 - 2              # outer corner of a column, x
    inner = W - 2 * COL         # clear span between the columns
    zc = FOOT + POST / 2

    for side in (-1, 1):
        x = side * xo
        inward = '-x' if side > 0 else '+x'
        # Column: a front and a back angle, legs inwards.
        angle(f'col{side}.front', 'z', POST, (x, FRONT + 2, zc), legs=(inward, '+y'))
        angle(f'col{side}.back', 'z', POST, (x, FRONT + COL_D - 2, zc), legs=(inward, '-y'))
        # Feet under both angles.
        for y in (FRONT + 20, FRONT + COL_D - 20):
            box(f'foot{side}.{y}', (30, 30, FOOT), (side * (W / 2 - 20), y, FOOT / 2), bevel=1)
        # Brackets to the wall, top and bottom, with a wall plate.
        bx = side * (W / 2 - 3)
        span = D - COL_D
        for name, z, h in (('top', H - 60, 40), ('bottom', 110, 90)):
            box(f'bracket.{name}{side}', (6, span, h), (bx, FRONT + COL_D + span / 2, z))
            box(f'plate.{name}{side}', (60, 6, h + 40), (bx - side * 27, D / 2 - 3, z), bevel=1)

    # Top and bottom rails across the front.
    angle('rail.top', 'x', inner, (0, FRONT + 2, H - 40), legs=('+y', '-z'))
    angle('rail.bottom', 'x', inner, (0, FRONT + 2, FOOT + 80), legs=('+y', '+z'))

    for i, top in enumerate(SHELF_TOPS):
        y0 = FRONT + 4
        yc = y0 + SHELF_DEPTH / 2
        # MDF core with oak edges, brushed steel laminate on top.
        box(f'shelf{i}.core', (inner - 4, SHELF_DEPTH, SHELF_T - 1), (0, yc, top - SHELF_T / 2 - 0.5), mat='oak', bevel=0.8)
        box(f'shelf{i}.top', (inner - 8, SHELF_DEPTH - 4, 1), (0, yc + 2, top - 0.5), mat='laminate', bevel=0)
        # Angles under the front and back edges carry it.
        angle(f'shelf{i}.front', 'x', inner, (0, FRONT + 2, top - SHELF_T - 2), legs=('+y', '-z'))
        angle(f'shelf{i}.back', 'x', inner, (0, y0 + SHELF_DEPTH - 2, top - SHELF_T - 2), legs=('-y', '-z'))

    # Bolt heads where rails and shelf angles meet the columns.
    for side in (-1, 1):
        x = side * (W / 2 - COL / 2)
        for z in [H - 50, FOOT + 90] + [t - SHELF_T - 20 for t in SHELF_TOPS]:
            for dz in (-8, 8):
                bolt(f'bolt{side}.{z}.{dz}', (x, FRONT - 1.5, z + dz))
