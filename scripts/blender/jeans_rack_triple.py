"""105-06-013, the STEP floor rack with shelf sections (see step_models.py)."""

from step_models import jeans_rack

ID = '105-06-013'


def build():
    jeans_rack([(-600, -213), (-213, 213), (213, 600)], posts=[-213, 213], width=1300)
