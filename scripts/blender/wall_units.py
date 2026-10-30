"""
The Selected Frame wall unit system, built from the &elements parts list:
every unit is the same frame (two columns of 40×40×4 stainless angles back
to back, top and bottom rails, brackets with wall plates to the wall),
`W` wide and `D` deep, with its contents: shelves, hanging rails, a mirror
box, the jeans unit or a screen. 2288 mm high; the room side faces -Y.
"""

from common import angle, bolt, box

H = 2288
COL = 40          # column width (x) …
COL_D = 80        # … and depth (y): two angles back to back
FOOT = 30
POST = H - FOOT   # column height above the feet
SHELF_DEPTH = 400
SHELF_T = 19
HANG_Z = 1950     # top hanging rail, just under the top rail


class Unit:
    def __init__(self, width, depth):
        self.W = width
        self.D = depth
        self.front = -depth / 2
        self.inner = width - 2 * COL               # clear span between the columns
        self.left = -width / 2 + COL               # inside faces of the columns
        self.right = width / 2 - COL
        self.bolts_z = [H - 50, FOOT + 90]

    # -- the frame -----------------------------------------------------------

    def frame(self):
        W, D, front = self.W, self.D, self.front
        xo = W / 2 - 2
        zc = FOOT + POST / 2
        for side in (-1, 1):
            x = side * xo
            inward = '-x' if side > 0 else '+x'
            angle(f'col{side}.front', 'z', POST, (x, front + 2, zc), legs=(inward, '+y'))
            angle(f'col{side}.back', 'z', POST, (x, front + COL_D - 2, zc), legs=(inward, '-y'))
            for y in (front + 20, front + COL_D - 20):
                box(f'foot{side}.{y}', (30, 30, FOOT), (side * (W / 2 - 20), y, FOOT / 2), bevel=1)
            bx = side * (W / 2 - 3)
            span = D - COL_D
            for name, z, h in (('top', H - 60, 40), ('bottom', 110, 90)):
                box(f'bracket.{name}{side}', (6, span, h), (bx, front + COL_D + span / 2, z))
                box(f'plate.{name}{side}', (60, 6, h + 40), (bx - side * 27, D / 2 - 3, z), bevel=1)
        angle('rail.top', 'x', self.inner, (0, front + 2, H - 40), legs=('+y', '-z'))
        angle('rail.bottom', 'x', self.inner, (0, front + 2, FOOT + 80), legs=('+y', '+z'))
        return self

    def bolts(self):
        for side in (-1, 1):
            x = side * (self.W / 2 - COL / 2)
            for z in self.bolts_z:
                for dz in (-8, 8):
                    bolt(f'bolt{side}.{z}.{dz}', (x, self.front - 1.5, z + dz))
        return self

    # -- contents --------------------------------------------------------------

    def shelves(self, tops, x0=None, x1=None):
        """Shelves (MDF, oak edge, steel laminate) on angles under their front and back edges."""
        x0 = self.left if x0 is None else x0
        x1 = self.right if x1 is None else x1
        w = x1 - x0
        xc = (x0 + x1) / 2
        y0 = self.front + 4
        yc = y0 + SHELF_DEPTH / 2
        for i, top in enumerate(tops):
            box(f'shelf{i}.core', (w - 4, SHELF_DEPTH, SHELF_T - 1), (xc, yc, top - SHELF_T / 2 - 0.5), mat='oak', bevel=0.8)
            box(f'shelf{i}.top', (w - 8, SHELF_DEPTH - 4, 1), (xc, yc + 2, top - 0.5), mat='laminate', bevel=0)
            angle(f'shelf{i}.front', 'x', w, (xc, self.front + 2, top - SHELF_T - 2), legs=('+y', '-z'))
            angle(f'shelf{i}.back', 'x', w, (xc, y0 + SHELF_DEPTH - 2, top - SHELF_T - 2), legs=('-y', '-z'))
            self.bolts_z.append(top - SHELF_T - 20)
        return self

    def hang_rail(self, z=HANG_Z, x0=None, x1=None):
        """A 30×15 hanging rail across the unit, halfway back so garments hang side-on."""
        x0 = self.left if x0 is None else x0
        x1 = self.right if x1 is None else x1
        y = self.front + min(self.D, 450) / 2
        box(f'hang.{z}', (x1 - x0, 15, 30), ((x0 + x1) / 2, y, z))
        # Holders from the columns' sides to the rail.
        for x in (x0 + 4, x1 - 4):
            box(f'hang.{z}.holder{x}', (8, y - self.front - COL_D + 20, 40), (x, (self.front + COL_D + y) / 2, z))
        return self

    def beam(self, z):
        """A front cross beam (40×40 angle) between the columns."""
        angle(f'beam.{z}', 'x', self.inner, (0, self.front + 2, z), legs=('+y', '-z'))
        self.bolts_z.append(z - 20)
        return self

    def mirror_box(self, width=300, depth=100, height=1772):
        """Steel box with a full-height mirror on its front, at the left column."""
        x0 = self.left
        z0 = FOOT + 100
        box('mirror.box', (width, depth, height), (x0 + width / 2, self.front + depth / 2 + 4, z0 + height / 2), mat='steel', bevel=1)
        box('mirror.glass', (width - 30, 2, height - 700), (x0 + width / 2, self.front + 3, z0 + height - (height - 700) / 2 - 20), mat='mirror', bevel=0)
        return x0 + width

    def jeans_unit(self, width=872, depth=400, height=1774):
        """The 3 mm stainless jeans unit: two columns of pigeonholes either side of a light panel."""
        x1 = self.right
        x0 = x1 - width
        z0 = FOOT + 100
        y0 = self.front + 4
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

    def screen(self, width=968, depth=100, height=1690):
        """A digital screen in a 3 mm steel housing, on beams top and bottom."""
        z0 = FOOT + 150
        box('screen.housing', (width, depth, height), (0, self.front + depth / 2 + 4, z0 + height / 2), mat='steel_dark', bevel=1.5)
        box('screen.glass', (width - 24, 2, height - 24), (0, self.front + 3, z0 + height / 2), mat='screen', bevel=0)
        self.beam(z0 + 60)
        self.beam(z0 + height - 20)
        return self
