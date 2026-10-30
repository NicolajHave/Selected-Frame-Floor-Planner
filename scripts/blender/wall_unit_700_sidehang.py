"""105-99-012 Wall Unit 700 – Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-012'


def build():
    Unit(810, 389).frame().beam(1890).hang_rail(1750).bolts()
