"""105-06-011, the STEP floor rack with shelf sections (see step_models.py)."""

from step_models import jeans_rack

ID = '105-06-011'


def build():
    jeans_rack([(-220, 180), (180, 600)], posts=[-220, 180])
