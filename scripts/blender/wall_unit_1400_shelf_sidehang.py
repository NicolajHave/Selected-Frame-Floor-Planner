"""105-99-005 Wall Unit 1400 – Single Shelf Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-005'


def build():
    # Per 105-99-005-C: sidehang bar at 1865, beam with light at 825, shelf at 484.
    Unit(1496, 517).frame().hang_rail().beam(825).shelves([484]).bolts()
