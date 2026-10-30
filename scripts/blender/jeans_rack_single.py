"""105-06-010, the STEP floor rack with shelf sections (see step_models.py)."""

from step_models import jeans_rack

ID = '105-06-010'


def build():
    jeans_rack([(180, 600)], posts=[180])
