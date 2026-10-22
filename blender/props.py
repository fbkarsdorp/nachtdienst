"""Poly Haven models (CC0), placed in the room."""
import math

import bpy
from mathutils import Vector

from lib import ASSETS, bl, coll_bake, coll_live, empty, box, join
from layout import ROOM, TABLE, MAP

x0, x1, z0, z1, H = ROOM['x0'], ROOM['x1'], ROOM['z0'], ROOM['z1'], ROOM['h']


def import_model(mid):
    """Import a model once; returns its mesh objects (unlinked from any collection)."""
    path = ASSETS / 'models' / mid / f'{mid}.gltf'
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    # flatten the hierarchy so every mesh carries its own world transform
    for o in new:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    for o in meshes:
        for c in list(o.users_collection):
            c.objects.unlink(o)
    return meshes


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


_cache = {}


def place(mid, name, pos, ry=0.0, fit=None, live=False, atlas='furn', single=True, tilt=0.0):
    """Put a copy of model `mid` with its bottom centre at pos (three.js), turned by ry.

    fit=('h', 1.1) scales to a height, ('w', 0.6) to the larger footprint side.
    Returns an empty that parents the copy.
    """
    if mid not in _cache:
        _cache[mid] = import_model(mid)
    src = _cache[mid]
    objs = []
    coll = coll_live() if live else coll_bake()
    for o in src:
        c = o.copy()
        c.data = o.data.copy() if single else o.data
        coll.objects.link(c)
        objs.append(c)
    if tilt:
        # lay the model down: turn it about the world x axis first
        from mathutils import Matrix
        R = Matrix.Rotation(tilt, 4, 'X')
        for c in objs:
            c.matrix_world = R @ c.matrix_world
    bpy.context.view_layer.update()
    lo, hi = bounds(objs)
    size = hi - lo
    s = 1.0
    if fit:
        kind, val = fit
        s = val / size.z if kind == 'h' else val / max(size.x, size.y) if kind == 'w' else val / max(size)
    root = empty(name, pos, coll=coll, rot_y=ry)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for o in objs:
        mw = o.matrix_world.copy()
        o.matrix_world = root.matrix_world @ (Vector_scale(s) @ (translate(-centre) @ mw))
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
        o['imported'] = True
        if not live and atlas:
            o['lm'] = atlas
        o.name = f'{name}_{o.name.split(".")[0]}'
    bpy.context.view_layer.update()
    return root, objs


def Vector_scale(s):
    from mathutils import Matrix
    return Matrix.Diagonal((s, s, s, 1.0))


def translate(v):
    from mathutils import Matrix
    return Matrix.Translation(v)


def build(M):
    out = {}
    # the bookcase by the door (built in furniture.py): encyclopaedias on three of its shelves
    import furniture
    bc = furniture.bookcase(M)
    furniture.bookcase_contents(M, bc)
    t = bc['tops']
    spots = [(t[1], -1), (t[1], 1), (t[2], -1), (t[2], 1), (t[4], -1)]
    for k, (sy, side) in enumerate(spots):
        r, objs = place('book_encyclopedia_set_01', f'books{k}', (bc['cx'], sy, bc['cz'] + side * 0.26), ry=-math.pi / 2 + (0.015 * side), fit=None)
        # spines to the room, just behind the shelf's lip
        lo, hi = bounds(objs)
        r.location.x += bc['front'] + 0.03 - lo.x
        bpy.context.view_layer.update()
    out['bookcase'] = bpy.data.objects['bookcase']
    # the armchair by the window, with a side table and a cassette recorder
    out['chair_window'], _ = place('GreenChair_01', 'chair_window', (0.55, 0, z0 + 1.45), ry=0.35, fit=('h', 0.95))
    st, sto = place('small_wooden_table_01', 'side_table', (1.35, 0, z0 + 1.15), ry=0.2, fit=('h', 0.6))
    lo, hi = bounds(sto)
    place('portable_cassette_player', 'cassette', (1.33, hi.z, z0 + 1.12), ry=-0.4, fit=('max', 0.17), live=True)
    # a steel office desk on the right wall, with the bureau's tape recorder
    DZ = 4.2
    dk, dko = place('metal_office_desk', 'desk', (x1 - 0.4, 0, DZ), ry=-math.pi / 2, fit=('w', 1.25))
    lo, hi = bounds(dko)
    bc_dx = x1 - 0.02 - hi.x
    dk.location.x += bc_dx
    bpy.context.view_layer.update()
    lo, hi = bounds(dko)
    desk_top = hi.z
    desk_cx = (lo.x + hi.x) / 2
    out['desk_top'] = (desk_top, desk_cx, DZ)
    place('binder_notebook', 'binder', (desk_cx + 0.05, desk_top, DZ + 0.45), ry=-1.3, fit=('w', 0.3), live=True)
    place('standing_picture_frame_01', 'photo', (desk_cx + 0.1, desk_top, DZ - 0.5), ry=-math.pi / 2 - 0.35, fit=('h', 0.22), live=True)
    place('clipboard', 'clipboard', (desk_cx - 0.12, desk_top, DZ + 0.48), ry=-1.75, fit=('w', 0.32), live=True)
    # the pendant over the table, switched off
    lp, lpo = place('hanging_industrial_lamp', 'ceiling_lamp', (TABLE['x'], H - 0.8, TABLE['z']), fit=('h', 0.8))
    out['ceiling_lamp'] = lp
    # a light in the corridor
    place('caged_hanging_light', 'corridor_lamp', (0, 2.7 - 0.45, z1 + 2.9), fit=('h', 0.45))
    # on the table: a magnifying glass and a stapler, lit live
    place('magnifying_glass_01', 'magnifier', (TABLE['x'] - 0.7, TABLE['y'] + 0.002, TABLE['z'] + 0.3), ry=0.6, fit=('max', 0.24), live=True, tilt=math.pi / 2)
    place('vintage_stapler', 'stapler', (TABLE['x'] + 0.82, TABLE['y'] + 0.002, TABLE['z'] - 0.36), ry=-0.3, fit=('max', 0.17), live=True)
    # boxes waiting to be sorted (built in furniture.py), a painting, a suitcase
    import random
    import furniture
    rnd = random.Random(7)
    furniture.waiting_box(M, 'box_a', (-1.9, z0 + 1.4), (0.5, 0.34, 0.38), 0.25, rnd)
    furniture.waiting_box(M, 'box_b', (-1.6, z0 + 0.45), (0.44, 0.29, 0.34), -0.6, rnd, lid=True)
    place('fancy_picture_frame_01', 'painting', (-1.72, 1.45, z0 + 0.03), fit=('w', 0.62))
    place('vintage_suitcase', 'suitcase', (x1 - 0.95, 0, z1 - 0.35), ry=0.1, fit=('h', 0.42))
    return out
