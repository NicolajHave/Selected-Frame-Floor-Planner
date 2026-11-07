"""105-99-008 Wall Unit – Category Library (jeans unit) (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-008'


def build():
    u = Unit(1496, 529.5).frame()
    edge = u.jeans_unit()
    u.hang_rail(x1=edge).bolts()
