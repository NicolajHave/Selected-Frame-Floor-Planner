"""105-06-014, from the supplier's STEP file (see step_models.py)."""

from step_models import floor_rack, podium  # noqa: F401

ID = '105-06-014'


def build():
    floor_rack(taller=200)
