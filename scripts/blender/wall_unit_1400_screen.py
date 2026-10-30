"""105-99-009 Wall Unit 1400 – Screen (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-009'


def build():
    Unit(1496, 445).frame().screen().bolts()
