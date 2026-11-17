"""105-99-007 Wall Unit 1400 – Mirror Sidehang (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-007'


def build():
    # Per 105-99-007-B: the mirror box stands 65.4 mm in from the left
    # uprights and the sidehang bar runs the full 1316 mm above it.
    Unit(1506, 434).frame().mirror_box().hang_rail().bolts()
