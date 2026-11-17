"""105-99-006 Wall Unit 1400 – 2-level Sidehang (wall unit system: see wall_units.py)."""

from wall_units import MID_HANG_Z, TOP_HANG_Z, Unit

ID = '105-99-006'


def build():
    # Upper level right under the top beam, lower bar at mid height (catalog renders).
    Unit(1506, 542).frame().hang_rail(TOP_HANG_Z).hang_rail(MID_HANG_Z).bolts()
