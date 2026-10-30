"""105-09-003, from the supplier's STEP file (see step_models.py)."""

from step_models import floor_rack, podium  # noqa: F401

ID = '105-09-003'


def build():
    podium(height=400)
