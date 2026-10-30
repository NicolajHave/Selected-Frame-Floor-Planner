"""105-99-010 Wall Unit 700 – Shelf (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-010'


def build():
    Unit(810, 517).frame().shelves([420, 800, 1160, 1520]).bolts()
