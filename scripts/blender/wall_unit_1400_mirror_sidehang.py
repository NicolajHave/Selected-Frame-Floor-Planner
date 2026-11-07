"""105-99-007 Wall Unit 1400 – Mirror Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-007'


def build():
    u = Unit(1496, 434).frame()
    edge = u.mirror_box()
    u.hang_rail(x0=edge).bolts()
