"""105-99-003 Wall Unit 1400 – Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-003'


def build():
    Unit(1496, 434).frame().hang_rail().bolts()
