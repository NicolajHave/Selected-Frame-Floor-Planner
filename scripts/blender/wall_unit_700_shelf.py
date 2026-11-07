"""105-99-010 Wall Unit 700 – Shelf (wall unit system: see wall_units.py)."""

from wall_units import Unit

ID = '105-99-010'


def build():
    # Per 105-99-010-A: shelves at 484, 844, 1204 and 1564.
    Unit(810, 517).frame().shelves().bolts()
