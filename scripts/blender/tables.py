"""
Volume table 105-17-001 (1800 × 1280 mm, 430 / 815 mm high), from the
catalog render and the &elements quote ("stainless steel laminate,
brushed; 2 drawers on both sides"): a low drawer cabinet on a recessed
plinth, with an open display level on top. Panels are MDF with brushed
steel laminate and 2 mm oak edges.
"""

from common import box

W, D = 1800, 1280
LOW, HIGH = 430, 815
T = 19          # panel thickness
PLINTH = 60


def panel(name, size, at):
    """MDF panel: oak core (the edges show) with steel laminate faces."""
    box(f'{name}.core', size, at, mat='oak', bevel=0.8)
    sx, sy, sz = size
    # Laminate on the two large faces, set back from the edges by the oak edge.
    if sz <= min(sx, sy):        # lying flat: top and bottom faces
        for dz in (sz / 2, -sz / 2):
            box(f'{name}.lam{dz}', (sx - 4, sy - 4, 1), (at[0], at[1], at[2] + dz), mat='laminate', bevel=0)
    elif sx <= sy:               # standing, facing ±x
        for dx in (sx / 2, -sx / 2):
            box(f'{name}.lam{dx}', (1, sy - 4, sz - 4), (at[0] + dx, at[1], at[2]), mat='laminate', bevel=0)
    else:                        # standing, facing ±y
        for dy in (sy / 2, -sy / 2):
            box(f'{name}.lam{dy}', (sx - 4, 1, sz - 4), (at[0], at[1] + dy, at[2]), mat='laminate', bevel=0)


def volume_table():
    # Recessed steel plinth.
    box('plinth', (W - 80, D - 80, PLINTH), (0, 0, PLINTH / 2), mat='steel_dark', bevel=1)
    body = LOW - PLINTH - T
    zc = PLINTH + body / 2
    # Sides, a middle divider and the top.
    for x in (-W / 2 + T / 2, 0, W / 2 - T / 2):
        panel(f'side{x}', (T, D, body), (x, 0, zc))
    panel('top', (W, D, T), (0, 0, LOW - T / 2))
    # Two drawers on each long side, with a dark grip groove along their top.
    dw = (W - 3 * T) / 2 - 4
    for y, name in ((-D / 2 + T / 2, 'front'), (D / 2 - T / 2, 'back')):
        for k, x in enumerate((-(dw / 2 + T / 2 + 2), dw / 2 + T / 2 + 2)):
            panel(f'drawer.{name}{k}', (dw, T, body - 40), (x, y, zc - 15))
            box(f'grip.{name}{k}', (dw, 6, 14), (x, y, LOW - T - 12), mat='screen', bevel=0)
    # Open display level: three uprights carrying a top shelf, centred on the table.
    depth = 640
    rise = HIGH - LOW - T
    for x in (-W / 2 + T / 2, 0, W / 2 - T / 2):
        panel(f'upright{x}', (T, depth, rise), (x, 0, LOW + rise / 2))
    panel('shelf', (W, depth, T), (0, 0, HIGH - T / 2))
