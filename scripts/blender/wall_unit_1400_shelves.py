"""105-99-004 Wall Unit 1400 – Shelves (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-004'


def build():
    Unit(1496, 517).frame().shelves().bolts()
