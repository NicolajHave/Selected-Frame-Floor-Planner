"""
The Selected Frame wall unit system, after the &elements technical
drawings (105-99-005-C, -007-B, -009-A, -010-A): every unit is the same
frame, whatever its depth. Each side is a pair of 40 mm uprights (95 mm
over both) standing 345–388 mm from the wall on arms at the top and the
bottom; top and bottom beams, any cross beams and the slotted sidehang bar
all run straight between the uprights, in their plane. Only the contents
reach further forward: shelves (117–517 mm from the wall), the mirror box,
the screen, the jeans unit. 2288 mm high; the wall is at +Y (the back of
the catalog footprint) and the room side faces -Y.
"""

from common import angle, bolt, box

H = 2288
POST_W = 95       # one side's pair of uprights, across
UPRIGHT = 40      # each upright: a 40×40 angle
POST_D = 43       # front to back
POST_BACK = 345   # wall to the back of the uprights
ARM_H = 43
FOOT = 30
POST = H - FOOT   # upright height above the feet
SHELF_FROM, SHELF_TO = 117, 517   # shelves, mm from the wall
SHELF_T = 19
SHELF_TOPS = (484, 844, 1204, 1564)
HANG_Z = 1865     # the slotted sidehang bar


class Unit:
    def __init__(self, width, depth):
        self.W = width
        self.D = depth
        self.wall = depth / 2                       # catalog footprint: wall at its back
        self.back = self.wall - POST_BACK           # back face of the uprights
        self.front = self.back - POST_D             # front face of the uprights
        self.mid = (self.front + self.back) / 2     # the frame's plane
        self.inner = width - 2 * POST_W             # clear span between the uprights
        self.left = -width / 2 + POST_W             # inside faces of the uprights
        self.right = width / 2 - POST_W
        self.bolts_z = [H - 50, FOOT + 90]

    def from_wall(self, mm):
        """Y of a point `mm` in front of the wall."""
        return self.wall - mm

    # -- the frame -----------------------------------------------------------

    def frame(self):
        W = self.W
        zc = FOOT + POST / 2
        for side in (-1, 1):
            inward = '-x' if side > 0 else '+x'
            outward = '+x' if side > 0 else '-x'
            # Outer and inner upright of the pair, a gap between them for the arms.
            outer = side * (W / 2 - 2)
            inner = side * (W / 2 - POST_W + 2)
            angle(f'col{side}.outer', 'z', POST, (outer, self.front + 2, zc), legs=(inward, '+y'))
            angle(f'col{side}.inner', 'z', POST, (inner, self.front + 2, zc), legs=(outward, '+y'))
            for x in (side * (W / 2 - UPRIGHT / 2), side * (W / 2 - POST_W + UPRIGHT / 2)):
                box(f'foot{side}.{x}', (UPRIGHT - 6, POST_D - 6, FOOT), (x, self.mid, FOOT / 2), bevel=1)
            # Arms from the uprights back to the wall, top and bottom, with wall plates.
            ax = side * (W / 2 - POST_W / 2)
            # Top arm flush with the top (2288), bottom arm's top edge at 87 mm.
            for name, z, plate_z in (('top', H - ARM_H / 2, H - 50), ('bottom', 87 - ARM_H / 2, 70)):
                box(f'arm.{name}{side}', (15, POST_BACK, ARM_H), (ax, self.back + POST_BACK / 2, z))
                box(f'plate.{name}{side}', (60, 6, 100), (ax, self.wall - 3, plate_z), bevel=1)
        # Top and bottom beams between the uprights, in their plane.
        self.beam(H - 9, name='beam.top')
        self.beam(FOOT + 87, name='beam.bottom')
        return self

    def bolts(self):
        for side in (-1, 1):
            for x in (side * (self.W / 2 - UPRIGHT / 2), side * (self.W / 2 - POST_W + UPRIGHT / 2)):
                for z in self.bolts_z:
                    bolt(f'bolt{side}.{x}.{z}', (x, self.front - 1.5, z))
        return self

    # -- contents --------------------------------------------------------------

    def beam(self, z, x0=None, x1=None, name=None):
        """A cross beam (40×40 angle) straight between the uprights, in the frame's plane."""
        x0 = self.left if x0 is None else x0
        x1 = self.right if x1 is None else x1
        angle(name or f'beam.{z}', 'x', x1 - x0, ((x0 + x1) / 2, self.front + 2, z), legs=('+y', '-z'))
        self.bolts_z.append(z - 20)
        return self

    def hang_rail(self, z=HANG_Z, x0=None, x1=None):
        """
        The slotted sidehang bar ("Styles"): one bar straight between the
        uprights, in their plane; hangers hook into its slots.
        """
        x0 = self.left if x0 is None else x0
        x1 = self.right if x1 is None else x1
        w = x1 - x0
        xc = (x0 + x1) / 2
        box(f'hang.{z}', (w, POST_D - 3, 40), (xc, self.mid, z), bevel=1)
        # The slots, as dark marks along its top.
        n = max(2, int(w // 38))
        for i in range(n):
            x = x0 + (i + 0.5) * w / n
            box(f'hang.{z}.slot{i}', (6, POST_D - 14, 2), (x, self.mid, z + 20.5), mat='steel_dark', bevel=0)
        self.bolts_z.append(z)
        return self

    def shelves(self, tops=SHELF_TOPS, x0=None, x1=None):
        """
        Oak-edged MDF shelves 117–517 mm from the wall (so through the frame's
        plane), on L-beams under their front and back edges.
        """
        x0 = self.left if x0 is None else x0
        x1 = self.right if x1 is None else x1
        w = x1 - x0
        xc = (x0 + x1) / 2
        y_front = self.from_wall(SHELF_TO)
        y_back = self.from_wall(SHELF_FROM)
        depth = y_back - y_front
        yc = (y_front + y_back) / 2
        for i, top in enumerate(tops):
            box(f'shelf{i}.core', (w - 4, depth, SHELF_T - 1), (xc, yc, top - SHELF_T / 2 - 0.5), mat='oak', bevel=0.8)
            box(f'shelf{i}.top', (w - 8, depth - 4, 1), (xc, yc, top - 0.5), mat='laminate', bevel=0)
            angle(f'shelf{i}.front', 'x', w, (xc, y_front + 22, top - SHELF_T - 2), legs=('-y', '-z'), size=20, t=3)
            angle(f'shelf{i}.back', 'x', w, (xc, y_back - 22, top - SHELF_T - 2), legs=('+y', '-z'), size=20, t=3)
            # Brackets from the uprights under the shelf.
            for x in (x0 + 4, x1 - 4):
                box(f'shelf{i}.bracket{x}', (8, depth - 50, 30), (x, yc, top - SHELF_T - 16))
            self.bolts_z.append(top - SHELF_T - 20)
        return self

    def mirror_box(self, width=300, depth=104, height=1772):
        """Steel box with a full-height mirror on its front, at the left uprights, 330–434 mm from the wall."""
        x0 = self.left
        z0 = 87
        y_front = self.from_wall(330 + depth)
        box('mirror.box', (width, depth, height), (x0 + width / 2, y_front + depth / 2, z0 + height / 2), mat='steel', bevel=1)
        box('mirror.glass', (width - 30, 2, height - 60), (x0 + width / 2, y_front - 1, z0 + height / 2), mat='mirror', bevel=0)
        return x0 + width

    def jeans_unit(self, width=872, depth=400, height=1774):
        """The 3 mm stainless jeans unit: two columns of pigeonholes either side of a light panel."""
        x1 = self.right
        x0 = x1 - width
        z0 = 87
        y0 = self.from_wall(self.D)     # its front is the unit's front
        t = 3
        zc = z0 + height / 2
        yc = y0 + depth / 2
        for name, x in (('l', x0 + t / 2), ('r', x1 - t / 2)):
            box(f'jeans.side.{name}', (t, depth, height), (x, yc, zc), bevel=0.4)
        box('jeans.back', (width, t, height), ((x0 + x1) / 2, y0 + depth - t / 2, zc), bevel=0.4)
        for name, z in (('bottom', z0 + t / 2), ('top', z0 + height - t / 2)):
            box(f'jeans.{name}', (width, depth, t), ((x0 + x1) / 2, yc, z), bevel=0.4)
        strip = 150
        cx = (x0 + x1) / 2
        for name, x in (('l', cx - strip / 2), ('r', cx + strip / 2)):
            box(f'jeans.divider.{name}', (t, depth, height), (x, yc, zc), bevel=0.4)
        box('jeans.light', (strip - 2 * t, 2, height - 2 * t), (cx, y0 + depth - t - 1, zc), mat='light_panel', bevel=0)
        cols = ((x0 + t, cx - strip / 2), (cx + strip / 2, x1 - t))
        for k in range(1, 5):
            z = z0 + k * height / 5
            for j, (a, b) in enumerate(cols):
                box(f'jeans.shelf{k}.{j}', (b - a, depth - t, t), ((a + b) / 2, yc - t / 2, z), bevel=0.4)
        return x0

    def screen(self, width=968, depth=55, height=1690):
        """A digital screen in a steel housing in front of the uprights (390–445 mm from the wall), 318–2008 mm up."""
        z0 = 318
        y_front = self.from_wall(390 + depth)
        box('screen.housing', (width, depth, height), (0, y_front + depth / 2, z0 + height / 2), mat='steel_dark', bevel=1.5)
        box('screen.glass', (width - 24, 2, height - 24), (0, y_front - 1, z0 + height / 2), mat='screen', bevel=0)
        self.beam(425)
        self.beam(1905)
        return self
