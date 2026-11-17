"""105-06-010, the STEP floor rack with shelf sections (see step_models.py)."""

from step_models import jeans_rack

ID = '105-06-010'


def build():
    # The shelf section stands next to the thick sign post (the left end), as in the catalog.
    jeans_rack([(-600, -180)], posts=[-180])
