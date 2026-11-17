"""105-06-011, the STEP floor rack with shelf sections (see step_models.py)."""

from step_models import jeans_rack

ID = '105-06-011'


def build():
    # Both shelf sections from the thick sign post (the left end) inwards, as in the catalog.
    jeans_rack([(-600, -180), (-180, 220)], posts=[-180, 220])
