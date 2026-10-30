"""105-99-011 Wall Unit 700 – 2-Level Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-011'


def build():
    Unit(810, 389).frame().hang_rail().beam(1090).hang_rail(1000).bolts()
