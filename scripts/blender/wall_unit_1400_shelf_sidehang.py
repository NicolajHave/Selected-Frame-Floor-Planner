"""105-99-005 Wall Unit 1400 – Single Shelf Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-005'


def build():
    Unit(1496, 517).frame().hang_rail().beam(1150).shelves([380]).bolts()
