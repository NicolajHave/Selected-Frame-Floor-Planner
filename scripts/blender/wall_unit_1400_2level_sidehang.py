"""105-99-006 Wall Unit 1400 – 2-level Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-006'


def build():
    Unit(1496, 542).frame().hang_rail().beam(1090).hang_rail(1000).bolts()
