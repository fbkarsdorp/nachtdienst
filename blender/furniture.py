"""Furniture built from scratch: card cabinets, reading table, chairs, banker's lamp,
wall clock, archive shelving, pin board, door leaf, coat stand, a bookcase, boxes waiting by the window,
a tape recorder, a wastepaper basket."""
import math
import random

import bmesh
import bpy

from lib import (Frame, bl, box, lathe, extrude, join, new_object, bm_box, add_bevel, apply_modifiers, coll_bake,
                 coll_live, coll_occ, empty, parent_keep, smooth)
from layout import ROOM, CAB, CABINET_Z, TABLE, LAMP_POS, DOOR, BOARD, CLOCK, MAP, TW_POS

x0, x1, z0, z1, H = ROOM['x0'], ROOM['x1'], ROOM['z0'], ROOM['z1'], ROOM['h']


def live(obj):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll_live().objects.link(obj)
    if 'lm' in obj:
        del obj['lm']
    return obj


# ------------------------------------------------------------------ card cabinets

def drawer_mesh(name, M, origin):
    """One drawer front with its brass label holder and bin pull, as a single mesh.
    The origin sits where room.js puts the drawer group; the front runs x 0..0.025."""
    dw, dh = CAB['dw'], CAB['dh']
    bm = bmesh.new()
    # oak front, with a bevel applied afterwards
    bm_box(bm, 0.025, dh - 0.012, dw - 0.012, (0.0125, 0, 0), mat_index=0)
    # label holder: four brass strips framing a 0.19 x 0.0625 card (label sits at x = 0.0262)
    ly = 0.045
    for (w, h, d, cy, cz) in ((0.0035, 0.007, 0.205, ly + 0.0345, 0), (0.0035, 0.006, 0.205, ly - 0.0345, 0),
                              (0.0035, 0.075, 0.007, ly, 0.099), (0.0035, 0.075, 0.007, ly, -0.099)):
        bm_box(bm, w, h, d, (0.025 + w / 2, cy, cz), mat_index=1)
    # bin pull: a thin hood curving out from the front, open underneath, with cheeks
    hood = [(0.0, -0.016), (0.008, -0.0175), (0.015, -0.022), (0.0195, -0.03), (0.021, -0.04),
            (0.018, -0.04), (0.0165, -0.031), (0.0125, -0.0245), (0.0065, -0.0205), (0.0, -0.0195)]
    half = 0.04
    a = [bm.verts.new(bl(0.025 + x, y, -half)) for x, y in hood]
    b = [bm.verts.new(bl(0.025 + x, y, half)) for x, y in hood]
    n = len(hood)
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((a[i], a[j], b[j], b[i]))
        f.material_index = 1
    for zc in (-half, half - 0.0035):
        cheek = [(0.0, -0.016), (0.008, -0.0175), (0.015, -0.022), (0.0195, -0.03), (0.021, -0.04), (0.0, -0.04)]
        for zz in (zc, zc + 0.0035):
            pass
        va = [bm.verts.new(bl(0.025 + x, y, zc)) for x, y in cheek]
        vb = [bm.verts.new(bl(0.025 + x, y, zc + 0.0035)) for x, y in cheek]
        m = len(cheek)
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((va[i], va[j], vb[j], vb[i])).material_index = 1
        bm.faces.new(va[::-1]).material_index = 1
        bm.faces.new(vb).material_index = 1
    # two screw heads on the backplate of the pull
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object(name, bm, coll_bake(), [M['drawer'], M['brass']], 'cab')
    obj.location = bl(*origin)
    add_bevel(obj, 0.0025, segments=2, angle=60)
    return obj


def cabinet(M, index, fam):
    z = CABINET_Z[index]
    w, h, d = CAB['w'], CAB['h'], CAB['d']
    F = Frame((x0, 0, z), 0.0)
    # in cabinet space: x out from the wall (0..d), y up, z along the wall
    def at(x, y, zz):
        return (x0 + x, y, z + zz)

    parts = []
    mat = M['cabinet']
    # sides: a carcass board with a frame and a raised panel on the outside face
    for s in (-1, 1):
        zs = s * (w / 2 - 0.02)
        parts.append(box(f'c{index}_side{s}', d, h - 0.12, 0.04, at(d / 2, 0.12 + (h - 0.12) / 2, zs), mat, bevel=0.003))
        zo = s * (w / 2 + 0.002)
        for (px, py, pw, ph) in ((d / 2, 0.12 + 0.05, d - 0.02, 0.07), (d / 2, h - 0.06, d - 0.02, 0.07),
                                 (0.04, 0.12 + (h - 0.12) / 2, 0.06, h - 0.12), (d - 0.04, 0.12 + (h - 0.12) / 2, 0.06, h - 0.12)):
            parts.append(box(f'c{index}_sf{s}{px:.2f}{py:.2f}', pw, ph, 0.012, at(px, py, zo), M['cabinet'], bevel=0.004))
        parts.append(box(f'c{index}_sp{s}', d - 0.16, h - 0.36, 0.014, at(d / 2, 0.12 + (h - 0.12) / 2, zo), mat, bevel=0.012))
    # top slab and cornice
    parts.append(box(f'c{index}_top', d + 0.05, 0.035, w + 0.07, at(d / 2 + 0.01, h + 0.0175, 0), mat, bevel=0.006))
    parts.append(box(f'c{index}_cor1', d + 0.08, 0.03, w + 0.12, at(d / 2 + 0.02, h + 0.05, 0), M['moulding'], bevel=0.01))
    parts.append(box(f'c{index}_cor2', d + 0.06, 0.02, w + 0.09, at(d / 2 + 0.015, h + 0.075, 0), M['moulding'], bevel=0.006))
    # plinth
    parts.append(box(f'c{index}_plinth', d - 0.02, 0.12, w - 0.02, at(d / 2 - 0.02, 0.06, 0), M['moulding'], bevel=0.004))
    parts.append(box(f'c{index}_plinthcap', d + 0.01, 0.025, w + 0.02, at(d / 2, 0.13, 0), mat, bevel=0.008))
    # header above the drawers, with a moulded frame round the name plate
    top_y = CAB['y0'] + CAB['rows'] * CAB['dh']
    parts.append(box(f'c{index}_header', 0.03, h - top_y, w - 0.06, at(d - 0.015, top_y + (h - top_y) / 2, 0), mat, bevel=0.003))
    py = h - 0.18
    for (fy, fh, fz, fw) in ((py + 0.122, 0.012, 0, 0.82), (py - 0.122, 0.012, 0, 0.82), (py, 0.256, 0.404, 0.012), (py, 0.256, -0.404, 0.012)):
        parts.append(box(f'c{index}_pf{fy:.2f}{fz:.2f}', 0.008, fh, fw, at(d + 0.004, fy, fz), M['moulding'], bevel=0.003))
    # face frame between the drawers, set back a little from the fronts
    gw = CAB['cols'] * CAB['dw']
    for c in range(CAB['cols'] + 1):
        zc = gw / 2 - c * CAB['dw']
        parts.append(box(f'c{index}_ff{c}', 0.02, CAB['rows'] * CAB['dh'] + 0.01, 0.012, at(d - 0.01, CAB['y0'] + CAB['rows'] * CAB['dh'] / 2, zc), mat, bevel=0.002))
    for r in range(CAB['rows'] + 1):
        yr = CAB['y0'] + r * CAB['dh']
        parts.append(box(f'c{index}_fr{r}', 0.02, 0.012, gw + 0.01, at(d - 0.01, yr, 0), mat, bevel=0.002))
    # back and the dark inside
    parts.append(box(f'c{index}_back', 0.02, h - 0.12, w - 0.06, at(0.01, 0.12 + (h - 0.12) / 2, 0), M['void'], bevel=0))
    parts.append(box(f'c{index}_inner', 0.01, CAB['rows'] * CAB['dh'], gw, at(d - 0.03, CAB['y0'] + CAB['rows'] * CAB['dh'] / 2, 0), M['void'], bevel=0))
    body = join(parts, f'cab{index}_body')
    body['lm'] = 'cab'
    # the drawers, one object each so the game can pull them out
    for r in range(CAB['rows']):
        for c in range(CAB['cols']):
            cz = gw / 2 - CAB['dw'] / 2 - c * CAB['dw']
            cy = CAB['y0'] + CAB['dh'] / 2 + r * CAB['dh']
            drawer_mesh(f'cab{index}_d{r}_{c}', M, at(d, cy, cz))


# ------------------------------------------------------------------ reading table and chairs

def table(M):
    tx, tz, tw, td, ty = TABLE['x'], TABLE['z'], TABLE['w'], TABLE['d'], TABLE['y']
    parts = []
    parts.append(box('table_top', tw, 0.04, td, (tx, ty - 0.02, tz), M['table'], bevel=0.009))
    parts.append(box('table_under', tw - 0.04, 0.012, td - 0.04, (tx, ty - 0.046, tz), M['table'], bevel=0.004))
    # apron
    ah = 0.1
    ay = ty - 0.052 - ah / 2
    for s in (-1, 1):
        parts.append(box(f'table_apron_z{s}', tw - 0.16, ah, 0.022, (tx, ay, tz + s * (td / 2 - 0.08)), M['table'], bevel=0.003))
        parts.append(box(f'table_apron_x{s}', 0.022, ah, td - 0.16, (tx + s * (tw / 2 - 0.08), ay, tz), M['table'], bevel=0.003))
    # a shallow drawer on the reader's side, with a brass knob
    parts.append(box('table_drawer', 0.5, 0.07, 0.018, (tx - 0.35, ay, tz + td / 2 - 0.068), M['table'], bevel=0.004))
    knob = lathe('table_knob', [(0.0, 0.0), (0.008, 0.0), (0.006, 0.012), (0.011, 0.02), (0.0, 0.026)], (0, 0, 0), M['brass'], segments=16)
    knob.rotation_euler = (math.pi / 2, 0, 0)
    knob.location = bl(tx - 0.35, ay, tz + td / 2 - 0.06)
    parts.append(knob)
    # turned legs with a square block under the apron
    prof = [(0.0, 0.0), (0.022, 0.0), (0.026, 0.015), (0.021, 0.04), (0.017, 0.1), (0.02, 0.3), (0.028, 0.4),
            (0.03, 0.43), (0.022, 0.47), (0.03, 0.5), (0.03, 0.53), (0.024, 0.555), (0.0, 0.555)]
    leg_h = ty - 0.052 - ah
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx, lz = tx + sx * (tw / 2 - 0.08), tz + sz * (td / 2 - 0.08)
            leg = lathe(f'table_leg{sx}{sz}', [(r, y * (leg_h / 0.555)) for r, y in prof], (lx, 0, lz), M['table'], segments=20)
            parts.append(leg)
            parts.append(box(f'table_block{sx}{sz}', 0.066, ah + 0.004, 0.066, (lx, ay, lz), M['table'], bevel=0.004))
    t = join(parts, 'table')
    t['lm'] = 'furn'
    # green leather writing surface, with a gilt line round it
    lw, ld = tw - 0.24, td - 0.24
    box('table_leather', lw, 0.002, ld, (tx, ty + 0.001, tz), M['leather'], atlas='furn', bevel=0)
    lines = []
    for s in (-1, 1):
        lines.append(box(f'gilt_z{s}', lw - 0.03, 0.0006, 0.003, (tx, ty + 0.0023, tz + s * (ld / 2 - 0.015)), M['darkbrass'], bevel=0))
        lines.append(box(f'gilt_x{s}', 0.003, 0.0006, ld - 0.03, (tx + s * (lw / 2 - 0.015), ty + 0.0023, tz), M['darkbrass'], bevel=0))
    g = join(lines, 'table_gilt')
    g['lm'] = 'furn'


def chair(M, name, x, z, ry):
    F = Frame((x, 0, z), ry)
    parts = []
    w = M['table']
    parts.append(F.box(f'{name}_seat', 0.44, 0.035, 0.42, (0, 0.46, 0), w, bevel=0.012))
    leg = [(0.0, 0.0), (0.014, 0.0), (0.017, 0.03), (0.015, 0.2), (0.019, 0.3), (0.016, 0.38), (0.019, 0.42), (0.0, 0.443)]
    for sx in (-1, 1):
        parts.append(F.lathe(f'{name}_fl{sx}', leg, (sx * 0.185, 0, -0.17), w, segments=14))
        # back legs run up into the back
        parts.append(F.box(f'{name}_bl{sx}', 0.034, 0.92, 0.034, (sx * 0.185, 0.46, 0.185), w, bevel=0.006))
    parts.append(F.box(f'{name}_top', 0.42, 0.08, 0.026, (0, 0.88, 0.19), w, bevel=0.01))
    parts.append(F.box(f'{name}_mid', 0.38, 0.03, 0.022, (0, 0.62, 0.19), w, bevel=0.006))
    for k in (-1, 0, 1):
        parts.append(F.box(f'{name}_slat{k}', 0.03, 0.22, 0.016, (k * 0.1, 0.75, 0.19), w, bevel=0.005))
    for sx in (-1, 1):
        parts.append(F.box(f'{name}_sts{sx}', 0.018, 0.02, 0.33, (sx * 0.185, 0.16, 0.0), w, bevel=0.005))
    parts.append(F.box(f'{name}_stf', 0.34, 0.02, 0.018, (0, 0.2, -0.17), w, bevel=0.005))
    c = join(parts, name)
    c['lm'] = 'furn'
    return c


# ------------------------------------------------------------------ banker's lamp (lit live)

def lamp(M):
    lx, ly, lz = LAMP_POS
    parts = []
    base = lathe('lamp_base', [(0.0, 0.0), (0.086, 0.0), (0.089, 0.005), (0.087, 0.011), (0.077, 0.016), (0.06, 0.021),
                               (0.034, 0.028), (0.018, 0.036), (0.014, 0.048), (0.0, 0.05)], (lx, ly, lz), M['brass'], segments=40)
    stem = lathe('lamp_stem', [(0.0, 0.0), (0.012, 0.0), (0.008, 0.01), (0.008, 0.16), (0.012, 0.17), (0.012, 0.18),
                               (0.008, 0.19), (0.008, 0.32), (0.011, 0.33), (0.0, 0.335)], (lx, ly + 0.048, lz), M['brass'], segments=16)
    arm = box('lamp_arm', 0.012, 0.012, 0.15, (lx, ly + 0.375, lz + 0.07), M['brass'], bevel=0.005)
    yoke = box('lamp_yoke', 0.2, 0.01, 0.012, (lx, ly + 0.38, lz + 0.14), M['brass'], bevel=0.004)
    parts += [base, stem, arm, yoke]
    # switch and pull chain under the shade
    beads = []
    for k in range(14):
        b = lathe(f'bead{k}', [(0.0, -0.0028), (0.0028, 0.0), (0.0, 0.0028)], (lx + 0.05, ly + 0.33 - k * 0.0062, lz + 0.14), M['brass'], segments=8)
        beads.append(b)
    beads.append(lathe('tassel', [(0.0, 0.0), (0.005, 0.0), (0.004, 0.02), (0.0, 0.022)], (lx + 0.05, ly + 0.22, lz + 0.14), M['brass'], segments=10))
    parts += beads
    body = join(parts, 'lamp_body')
    live(body)
    # the shade: a half-cylinder of green glass with brass end caps, open below
    cx, cy, cz = lx, ly + 0.42, lz + 0.14

    def half_shell(name, r, mat, inside=False):
        bm = bmesh.new()
        seg = 28
        length = 0.34
        rows = []
        for i in range(seg + 1):
            phi = math.pi * i / seg
            y, zz = r * math.sin(phi), r * math.cos(phi)
            rows.append((bm.verts.new(bl(cx - length / 2, cy + y, cz + zz)), bm.verts.new(bl(cx + length / 2, cy + y, cz + zz))))
        for i in range(seg):
            a0, a1 = rows[i]
            b0, b1 = rows[i + 1]
            # the glass faces out, the opal lining faces in towards the bulb
            f = bm.faces.new((a0, b0, b1, a1) if not inside else (a0, a1, b1, b0))
        obj = new_object(name, bm, coll_live(), mat)
        for p in obj.data.polygons:
            p.use_smooth = True
        return obj

    shade = half_shell('lamp_shade', 0.1, M['greenglass'])
    sol = shade.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.003
    lining = half_shell('lamp_lining', 0.096, M['opal'], inside=True)
    caps = []
    for s in (-1, 1):
        bm = bmesh.new()
        seg = 28
        xs = cx + s * 0.172
        ring_a, ring_b = [], []
        for i in range(seg + 1):
            phi = math.pi * i / seg
            y, zz = 0.102 * math.sin(phi), 0.102 * math.cos(phi)
            ring_a.append(bm.verts.new(bl(xs - 0.002, cy + y, cz + zz)))
            ring_b.append(bm.verts.new(bl(xs + 0.002, cy + y, cz + zz)))
        bm.faces.new(ring_a)
        bm.faces.new(ring_b[::-1])
        for i in range(seg):
            bm.faces.new((ring_a[i], ring_a[i + 1], ring_b[i + 1], ring_b[i]))
        bm.faces.new((ring_a[-1], ring_a[0], ring_b[0], ring_b[-1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        caps.append(new_object(f'lamp_cap{s}', bm, coll_live(), M['brass']))
    trims = []
    for s in (-1, 1):
        t = lathe(f'lamp_trim{s}', [(0.0, 0.0), (0.0045, 0.0), (0.0045, 0.34), (0.0, 0.34)], (0, 0, 0), M['brass'], segments=10)
        t.rotation_euler = (0, math.pi / 2, 0)
        t.location = bl(cx - 0.17, cy, cz + s * 0.1)
        trims.append(t)
    capj = join(caps + trims, 'lamp_trim')
    live(capj)
    bulb = lathe('lamp_bulb', [(0.0, -0.035), (0.016, -0.03), (0.022, -0.015), (0.02, 0.0), (0.012, 0.01), (0.0, 0.012)],
                 (cx, cy - 0.01, cz), M['bulb'], coll=coll_live(), segments=16)
    empty('anchor_lamp_light', (cx, cy - 0.02, cz))


# ------------------------------------------------------------------ wall clock

def clock(M):
    F = Frame((x1, 0, CLOCK['z']), -math.pi / 2)
    cy = CLOCK['y']
    parts = []
    w = M['table']
    parts.append(F.box('clk_body', 0.42, 1.08, 0.15, (0, cy - 0.2, 0.075), w, bevel=0.006))
    parts.append(F.box('clk_crown', 0.5, 0.06, 0.19, (0, cy + 0.37, 0.095), M['moulding'], bevel=0.012))
    parts.append(F.box('clk_crown2', 0.46, 0.04, 0.175, (0, cy + 0.41, 0.0875), M['moulding'], bevel=0.008))
    parts.append(F.box('clk_ped', 0.16, 0.08, 0.04, (0, cy + 0.47, 0.12), M['moulding'], bevel=0.015))
    parts.append(F.box('clk_foot', 0.48, 0.06, 0.19, (0, cy - 0.77, 0.095), M['moulding'], bevel=0.012))
    parts.append(F.box('clk_drop', 0.12, 0.06, 0.06, (0, cy - 0.83, 0.1), M['moulding'], bevel=0.02))
    # door frame round the dial and the pendulum glass
    for (fx, fy, fw, fh) in ((0, cy + 0.33, 0.4, 0.035), (0, cy - 0.05, 0.4, 0.035), (0, cy - 0.7, 0.4, 0.035),
                             (-0.185, cy - 0.18, 0.03, 1.04), (0.185, cy - 0.18, 0.03, 1.04)):
        parts.append(F.box(f'clk_fr{fx:.2f}{fy:.2f}', fw, fh, 0.02, (fx, fy, 0.16), w, bevel=0.004))
    # a ring, open in the middle: capped, it would be a brass disc over the dial
    bezel = F.lathe('clk_bezel', [(0.16, 0.0), (0.18, 0.0), (0.185, 0.006), (0.18, 0.012), (0.16, 0.012), (0.16, 0.0)],
                    (0, cy + 0.14, 0.15), M['brass'], segments=48, cap=False)
    bezel.rotation_euler = (0, math.pi / 2, 0)
    bezel.location = bl(*F.at((0, cy + 0.14, 0.164)))
    parts.append(bezel)
    case = join(parts, 'clock_case')
    case['lm'] = 'furn'
    # dial backing (the face itself is drawn by the game)
    dial = F.box('clock_dialback', 0.34, 0.34, 0.004, (0, cy + 0.14, 0.152), M['paper'], bevel=0)
    dial['lm'] = 'furn'
    empty('anchor_clock_face', F.at((0, cy + 0.14, 0.156)), rot_y=-math.pi / 2)
    empty('anchor_clock_hands', F.at((0, cy + 0.14, 0.16)), rot_y=-math.pi / 2)
    empty('anchor_clock_pend', F.at((0, cy - 0.06, 0.1)), rot_y=-math.pi / 2)
    glass = F.box('clock_glass', 0.34, 0.6, 0.002, (0, cy - 0.38, 0.165), M['glass'], bevel=0)
    live(glass)
    back = F.box('clock_inside', 0.36, 0.62, 0.004, (0, cy - 0.38, 0.02), M['void'], bevel=0)
    back['lm'] = 'furn'


# ------------------------------------------------------------------ steel archive shelving with boxes

def shelving(M, rnd):
    sx, sz = x0 + 0.25, z0 + 0.95
    length, depth = 1.7, 0.4
    root = empty('shelves', (sx, 0, sz))
    parts = []
    st = M['steel']
    levels = [0.1 + i * 0.5 for i in range(5)]
    for zc in (-length / 2 + 0.015, length / 2 - 0.015):
        for xc in (-depth / 2 + 0.015, depth / 2 - 0.015):
            parts.append(box(f'sh_post{zc:.2f}{xc:.2f}', 0.03, 2.3, 0.03, (sx + xc, 1.15, sz + zc), st, bevel=0.003))
    for i, y in enumerate(levels):
        parts.append(box(f'sh_shelf{i}', depth, 0.012, length - 0.02, (sx, y, sz), st, bevel=0.002))
        parts.append(box(f'sh_lip{i}', 0.006, 0.035, length - 0.02, (sx + depth / 2 - 0.003, y - 0.012, sz), st, bevel=0.001))
    for s in (-1, 1):
        for k in range(3):
            parts.append(box(f'sh_brace{s}{k}', 0.004, 0.02, depth - 0.03, (sx + 0, 0.6 + k * 0.7, sz + s * (length / 2 - 0.015)), st, bevel=0))
    rack = join(parts, 'shelves_rack')
    rack['lm'] = 'furn'
    parent_keep(rack, root)
    boxes = []
    archive = [M['archivebox'], M['archivebox'], M['archivebox_blue']]
    for i, y in enumerate(levels[:-1] + [levels[-1]]):
        zc = -length / 2 + 0.04
        while zc < length / 2 - 0.12:
            kind = rnd.random()
            if kind < 0.08:
                zc += 0.09
                continue
            if kind < 0.18 and y + 0.3 < 2.35:
                # archive boxes lying flat, two or three high, their ends to the room
                bw, n = 0.29, rnd.choice((2, 3))
                if zc + bw > length / 2 - 0.03:
                    break
                for k in range(n):
                    mat = rnd.choice(archive)
                    bx = sx + 0.02 + rnd.uniform(-0.01, 0.01)
                    b = box(f'abox{i}_{len(boxes)}', 0.27, 0.105, bw - 0.01, (bx, y + 0.006 + 0.0525 + k * 0.106, sz + zc + bw / 2), mat, bevel=0.004,
                            rot_y=rnd.uniform(-0.04, 0.04))
                    boxes.append(b)
                    boxes.append(box(f'alabel{i}_{len(boxes)}', 0.002, 0.04, rnd.uniform(0.08, 0.13), (bx + 0.136, y + 0.006 + 0.0525 + k * 0.106, sz + zc + bw / 2 + rnd.uniform(-0.03, 0.03)), M['label'], bevel=0))
                zc += bw
                continue
            if kind < 0.8:
                bw, bh, bd = 0.11, rnd.choice((0.33, 0.33, 0.31, 0.27)), 0.27
                mat = rnd.choice(archive)
            else:
                bw, bh, bd = 0.2, 0.24, 0.32
                mat = M['cardboard']
            if y + bh > 2.35:
                break
            if zc + bw > length / 2 - 0.03:
                break
            bx = sx + 0.02 + rnd.uniform(-0.015, 0.015)
            b = box(f'abox{i}_{len(boxes)}', bd, bh, bw - 0.006, (bx, y + 0.006 + bh / 2, sz + zc + bw / 2), mat, bevel=0.004,
                    rot_y=rnd.uniform(-0.03, 0.03))
            boxes.append(b)
            # most carry a label on the end that faces the room, a few lost theirs
            if mat is not M['cardboard'] and rnd.random() < 0.8:
                boxes.append(box(f'alabel{i}_{len(boxes)}', 0.002, rnd.uniform(0.05, 0.08), bw * rnd.uniform(0.5, 0.66), (bx + bd / 2 + 0.001, y + 0.006 + bh * rnd.uniform(0.62, 0.72), sz + zc + bw / 2), M['label'], bevel=0))
            zc += bw
    for b in boxes:
        b['lm'] = 'furn'
        parent_keep(b, root)
    # a few loose folders lying flat on the top shelf
    for k in range(4):
        f = box(f'folder{k}', 0.25, 0.012, 0.33, (sx + 0.01, levels[-1] + 0.012 + k * 0.013, sz + 0.55 + rnd.uniform(-0.02, 0.02)), M['cardboard'], bevel=0.002,
                rot_y=rnd.uniform(-0.15, 0.15))
        f['lm'] = 'furn'
        parent_keep(f, root)
    return root


# ------------------------------------------------------------------ pin board

def board(M):
    F = Frame((BOARD['x'], BOARD['y'], BOARD['z']), math.pi)
    w, h = BOARD['w'], BOARD['h']
    parts = [F.box('board_back', w, h, 0.015, (0, 0, 0.0075), M['moulding'], bevel=0.002),
             F.box('board_cloth', w - 0.06, h - 0.06, 0.004, (0, 0, 0.017), M['hessian'], bevel=0.001)]
    for (fx, fy, fw, fh) in ((0, h / 2 - 0.02, w, 0.04), (0, -h / 2 + 0.02, w, 0.04), (-w / 2 + 0.02, 0, 0.04, h), (w / 2 - 0.02, 0, 0.04, h)):
        parts.append(F.box(f'board_fr{fx:.2f}{fy:.2f}', fw, fh, 0.026, (fx, fy, 0.013), M['moulding'], bevel=0.006))
    b = join(parts, 'board')
    b['lm'] = 'furn'


# ------------------------------------------------------------------ door leaf

def door_leaf(M):
    """Four-panel door. The game hangs it on its hinge; the origin is the leaf's centre at floor level."""
    w, h = DOOR['w'], DOOR['h']
    zc = z1 + 0.01
    parts = []
    t = 0.045
    dm = M['door']
    # frame of the leaf: stiles and rails
    parts.append(box('dl_core', w - 0.004, h - 0.01, t - 0.01, (0, h / 2, zc), dm, bevel=0.002))
    for (px, py, pw, ph) in ((-w / 2 + 0.06, h / 2, 0.12, h - 0.01), (w / 2 - 0.06, h / 2, 0.12, h - 0.01),
                             (0, 0.11, w - 0.24, 0.2), (0, h - 0.07, w - 0.24, 0.13), (0, 1.05, w - 0.24, 0.2), (0, h / 2, 0.1, h - 0.3)):
        for sz in (-1, 1):
            parts.append(box(f'dl_fr{px:.2f}{py:.2f}{sz}', pw, ph, 0.006, (px, py, zc + sz * (t / 2 - 0.003)), dm, bevel=0.003))
    for (px, py, pw, ph) in ((-0.21, 0.58, 0.29, 0.72), (0.21, 0.58, 0.29, 0.72), (-0.21, 1.6, 0.29, 0.8), (0.21, 1.6, 0.29, 0.8)):
        for sz in (-1, 1):
            parts.append(box(f'dl_p{px:.2f}{py:.2f}{sz}', pw - 0.03, ph - 0.03, 0.01, (px, py, zc + sz * (t / 2 - 0.006)), dm, bevel=0.012))
            # bolection moulding round each panel
            for (mx, my, mw, mh) in ((px, py + ph / 2 - 0.006, pw, 0.014), (px, py - ph / 2 + 0.006, pw, 0.014),
                                     (px - pw / 2 + 0.006, py, 0.014, ph), (px + pw / 2 - 0.006, py, 0.014, ph)):
                parts.append(box(f'dl_m{px:.2f}{py:.2f}{mx:.2f}{my:.2f}{sz}', mw, mh, 0.012, (mx, my, zc + sz * (t / 2 + 0.002)), M['moulding'], bevel=0.005))
    # lock case, lever handle and keyhole escutcheon on the room side
    hx = -w / 2 + 0.12
    side = zc - t / 2
    parts.append(box('dl_lock', 0.06, 0.2, 0.012, (hx, 1.0, side - 0.006), M['brass'], bevel=0.004))
    parts.append(box('dl_rose', 0.05, 0.05, 0.01, (hx + 0.0, 1.05, side - 0.016), M['brass'], bevel=0.01))
    lev = box('dl_lever', 0.13, 0.016, 0.018, (hx + 0.055, 1.05, side - 0.045), M['brass'], bevel=0.007)
    parts.append(lev)
    parts.append(box('dl_neck', 0.016, 0.016, 0.035, (hx, 1.05, side - 0.03), M['brass'], bevel=0.006))
    parts.append(box('dl_esc', 0.026, 0.05, 0.006, (hx, 0.93, side - 0.015), M['brass'], bevel=0.008))
    parts.append(box('dl_keyhole', 0.006, 0.018, 0.002, (hx, 0.932, side - 0.0185), M['black'], bevel=0))
    # the same on the corridor side
    parts.append(box('dl_lever_b', 0.13, 0.016, 0.018, (hx + 0.055, 1.05, zc + t / 2 + 0.035), M['brass'], bevel=0.007))
    leaf = join(parts, 'door_leaf')
    leaf['lm'] = 'furn'
    # hinges on the frame
    hz = []
    for y in (0.25, 1.1, 1.95):
        hz.append(lathe(f'hinge{y}', [(0.0, 0.0), (0.009, 0.0), (0.009, 0.1), (0.0, 0.1)], (w / 2 + 0.004, y, z1 - 0.012), M['brass'], segments=12))
    hj = join(hz, 'door_hinges')
    hj['lm'] = 'furn'
    return leaf


# ------------------------------------------------------------------ coat stand with a coat

def coat_stand(M):
    cx, cz = x1 - 0.45, z1 - 0.55
    root = empty('coatstand', (cx, 0, cz))
    w = M['table']
    parts = [lathe('cs_pole', [(0.0, 0.0), (0.03, 0.0), (0.03, 0.06), (0.022, 0.08), (0.02, 0.5), (0.026, 0.55), (0.019, 0.6),
                               (0.017, 1.75), (0.024, 1.8), (0.024, 1.84), (0.03, 1.86), (0.0, 1.9)], (cx, 0, cz), w, segments=18)]
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        leg = box(f'cs_leg{k}', 0.035, 0.05, 0.34, (cx + math.sin(a) * 0.15, 0.03, cz + math.cos(a) * 0.15), w, bevel=0.012, rot_y=a)
        parts.append(leg)
    for k in range(4):
        a = k * math.pi / 2
        hook = box(f'cs_hook{k}', 0.012, 0.012, 0.11, (cx + math.sin(a) * 0.05, 1.78, cz + math.cos(a) * 0.05), M['brass'], bevel=0.005, rot_y=a)
        hook.rotation_euler.x = 0.5
        parts.append(hook)
    stand = join(parts, 'coatstand_pole')
    stand['lm'] = 'furn'
    parent_keep(stand, root)
    # a long dark coat: a lathe with folds, flattened front to back
    prof = [(0.0, 0.0), (0.24, 0.0), (0.22, 0.25), (0.19, 0.55), (0.17, 0.8), (0.15, 0.95), (0.14, 1.02), (0.06, 1.1), (0.0, 1.11)]
    coat = lathe('coat', prof, (cx + 0.05, 0.62, cz), M['wool'], segments=48)
    for v in coat.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r < 1e-4:
            continue
        a = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.06 * math.sin(7 * a + v.co.z * 4) * (1 - v.co.z / 1.2)
        v.co.x *= k
        v.co.y *= k * 0.72
    coat['lm'] = 'furn'
    parent_keep(coat, root)
    hat = lathe('hat', [(0.0, 0.0), (0.17, 0.0), (0.17, 0.008), (0.115, 0.012), (0.11, 0.1), (0.09, 0.125), (0.0, 0.13)],
                (cx + 0.02, 1.84, cz + 0.02), M['wool'], segments=40)
    hat.rotation_euler = (0.1, 0.12, 0)
    hat['lm'] = 'furn'
    parent_keep(hat, root)
    return root


# ------------------------------------------------------------------ the bookcase by the door

BOOKCASE = {'z': 5.6, 'w': 1.1, 'd': 0.34, 'h': 2.0}


def bookcase(M):
    """A plain oak bookcase against the right wall, solid shelves with a lipped front edge.
    Returns the shelves' tops, its front and its centre line, for what goes on them."""
    W, D, Hh, cz = BOOKCASE['w'], BOOKCASE['d'], BOOKCASE['h'], BOOKCASE['z']
    back = x1 - 0.02
    front = back - D
    cx = (front + back) / 2
    wood, dark = M['cabinet'], M['moulding']
    parts = []
    for s in (-1, 1):
        parts.append(box(f'bc_side{s}', D, Hh, 0.024, (cx, Hh / 2, cz + s * (W / 2 - 0.012)), wood, bevel=0.003))
        # the face frame's stiles, a little proud of the sides
        parts.append(box(f'bc_stile{s}', 0.02, Hh - 0.1, 0.045, (front + 0.008, 0.1 + (Hh - 0.1) / 2, cz + s * (W / 2 - 0.0225)), wood, bevel=0.003))
    parts.append(box('bc_back', 0.012, Hh - 0.1, W - 0.04, (back - 0.006, 0.1 + (Hh - 0.1) / 2, cz), dark, bevel=0))
    parts.append(box('bc_plinth', D - 0.03, 0.09, W - 0.03, (cx + 0.01, 0.045, cz), dark, bevel=0.004))
    shelves = [0.1 + i * 0.38 for i in range(5)]
    for i, y in enumerate(shelves):
        parts.append(box(f'bc_shelf{i}', D - 0.03, 0.022, W - 0.046, (cx + 0.01, y, cz), wood, bevel=0.002))
        # a solid lip on the front edge, a little deeper than the board
        parts.append(box(f'bc_lip{i}', 0.022, 0.034, W - 0.046, (front + 0.011, y - 0.004, cz), wood, bevel=0.004))
    parts.append(box('bc_top', D + 0.03, 0.026, W + 0.04, (cx - 0.015, Hh + 0.013, cz), wood, bevel=0.004))
    parts.append(box('bc_cornice', D + 0.055, 0.04, W + 0.09, (cx - 0.028, Hh + 0.046, cz), dark, bevel=0.01))
    parts.append(box('bc_cap', D + 0.04, 0.016, W + 0.06, (cx - 0.02, Hh + 0.074, cz), wood, bevel=0.005))
    case = join(parts, 'bookcase')
    case['lm'] = 'furn'
    return {'tops': [y + 0.011 for y in shelves], 'front': front, 'cx': cx, 'cz': cz, 'w': W - 0.046, 'top': Hh + 0.082}


def ordners(M, rnd, name, front, y, za, zb, lean_last=False):
    """Lever arch files standing in a row from za to zb, spines to the room, each with its
    paper label and finger hole; a gap now and then."""
    kinds = [M['ordner_grey'], M['ordner_grey'], M['ordner_black'], M['ordner_blue'], M['ordner_green']]
    parts = []
    run = rnd.choice(kinds)
    z = za
    k = 0
    while z + 0.08 <= zb:
        if rnd.random() < 0.3:
            run = rnd.choice(kinds)
        bw, bh, bd = 0.078, 0.318, 0.285
        x = front + 0.012 + bd / 2 + rnd.uniform(0, 0.01)
        zc = z + bw / 2
        parts.append(box(f'{name}{k}', bd, bh, bw - 0.003, (x, y + bh / 2, zc), run, bevel=0.004))
        sx = x - bd / 2 - 0.001
        if rnd.random() < 0.9:
            lh = rnd.uniform(0.075, 0.105)
            parts.append(box(f'{name}l{k}', 0.002, lh, rnd.uniform(0.042, 0.052), (sx, y + bh * rnd.uniform(0.66, 0.73), zc), M['label'], bevel=0))
        parts.append(box(f'{name}h{k}', 0.002, 0.026, 0.026, (sx, y + bh * 0.24, zc), M['black'], bevel=0.009))
        z += bw
        k += 1
    return parts


def archive_stack(M, rnd, name, front, y, zc, n):
    """Archive boxes lying flat, ends to the room, n high, each a little askew."""
    parts = []
    for k in range(n):
        mat = rnd.choice([M['archivebox'], M['archivebox'], M['archivebox_blue']])
        bx = front + 0.015 + 0.135 + rnd.uniform(0, 0.012)
        yy = y + 0.0525 + k * 0.106
        parts.append(box(f'{name}{k}', 0.27, 0.105, 0.28, (bx, yy, zc + rnd.uniform(-0.01, 0.01)), mat, bevel=0.004, rot_y=rnd.uniform(-0.05, 0.05)))
        parts.append(box(f'{name}l{k}', 0.002, 0.04, rnd.uniform(0.09, 0.13), (bx - 0.136, yy, zc + rnd.uniform(-0.03, 0.03)), M['label'], bevel=0))
    return parts


def bookcase_contents(M, bc):
    """What stands on the bookcase besides the encyclopaedias: files, archive boxes."""
    rnd = random.Random(1983)
    f, cz, w, t = bc['front'], bc['cz'], bc['w'], bc['tops']
    za, zb = cz - w / 2 + 0.01, cz + w / 2 - 0.01
    parts = []
    # bottom: files on the left, two stacks of archive boxes on the right
    parts += ordners(M, rnd, 'bco0_', f, t[0], za, za + 0.4)
    parts += archive_stack(M, rnd, 'bcs0_', f, t[0], zb - 0.15, 3)
    parts += archive_stack(M, rnd, 'bcs1_', f, t[0], zb - 0.45, 2)
    # the fourth: a whole shelf of files
    parts += ordners(M, rnd, 'bco3_', f, t[3], za, zb)
    # top shelf: boxes on their ends to the right of the encyclopaedia, a few folders lying
    zc = cz + 0.06
    while zc + 0.11 < zb:
        mat = rnd.choice([M['archivebox'], M['archivebox_blue']])
        bh = rnd.choice((0.33, 0.31, 0.27))
        if bh + t[4] > 2.0 - 0.02:
            bh = 0.27
        parts.append(box(f'bcb{zc:.2f}', 0.27, bh, 0.104, (f + 0.025 + 0.135, t[4] + bh / 2, zc + 0.055), mat, bevel=0.004, rot_y=rnd.uniform(-0.03, 0.03)))
        parts.append(box(f'bcbl{zc:.2f}', 0.002, 0.06, 0.07, (f + 0.024, t[4] + bh * 0.68, zc + 0.055), M['label'], bevel=0))
        zc += 0.11
    # on top of the case: two boxes lying, and a roll of something tied up
    parts += archive_stack(M, rnd, 'bct_', f, bc['top'], cz + 0.2, 2)
    parts.append(box('bct_roll', 0.08, 0.08, 0.6, (f + 0.12, bc['top'] + 0.04, cz - 0.22), M['paper'], bevel=0.035))
    stuff = join(parts, 'bookcase_contents')
    stuff['lm'] = 'furn'
    return stuff


# ------------------------------------------------------------------ boxes waiting by the window

def waiting_box(M, name, pos, size, ry, rnd, lid=False):
    """A removal box of documents: taped shut, or its lid laid on askew; a written label."""
    x, z = pos
    bw, bh, bd = size
    root = empty(name, (x, 0, z))
    parts = [box(f'{name}_body', bw, bh, bd, (x, bh / 2, z), M['cardboard'], bevel=0.006)]
    if lid:
        parts.append(box(f'{name}_lid', bw + 0.012, 0.05, bd + 0.012, (x + 0.01, bh + 0.02, z - 0.008), M['cardboard'], bevel=0.005, rot_y=0.06))
        parts.append(box(f'{name}_lbl', bw * 0.4, 0.002, bd * 0.3, (x, bh + 0.046, z), M['label'], bevel=0))
    else:
        # tape over the top and down both ends
        parts.append(box(f'{name}_tape', bw + 0.004, 0.002, 0.05, (x, bh + 0.001, z), M['packtape'], bevel=0))
        for s in (-1, 1):
            parts.append(box(f'{name}_tape{s}', 0.002, 0.12, 0.05, (x + s * (bw / 2 + 0.001), bh - 0.06, z), M['packtape'], bevel=0))
        # the label on the side to the room
        parts.append(box(f'{name}_lbl', 0.15, 0.09, 0.002, (x + rnd.uniform(-0.05, 0.05), bh * 0.62, z + bd / 2 + 0.001), M['label'], bevel=0))
    body = join(parts, f'{name}_box')
    body['lm'] = 'furn'
    parent_keep(body, root)
    root.rotation_euler = (0, 0, ry)
    bpy.context.view_layer.update()
    return root


# ------------------------------------------------------------------ the tape recorder on the side desk

def _reel(name, F, local, r, pack, M):
    """A ten-inch-style reel standing upright, facing +z: a tape pack between two flanges,
    the front flange a rim and three spokes, so the tape shows through."""
    parts = []
    x, y, z = local
    def disc(nm, r0, r1, z0_, z1_, mat, seg=48):
        # a ring is its closed profile spun round, uncapped (a cap would fill the hole)
        if r0 > 0:
            prof, cap = [(r0, z0_), (r1, z0_), (r1, z1_), (r0, z1_), (r0, z0_)], False
        else:
            prof, cap = [(0.0, z0_), (r1, z0_), (r1, z1_), (0.0, z1_)], True
        o = lathe(nm, prof, (0, 0, 0), mat, coll=coll_live(), segments=seg, cap=cap)
        # the lathe spins round y; turn it to face +z
        o.rotation_euler = (math.pi / 2, 0, F.ry)
        o.location = bl(*F.at((x, y, z)))
        return o
    parts.append(disc(f'{name}_back', 0.0, r, -0.012, -0.0105, M['deck']))
    parts.append(disc(f'{name}_pack', 0.028, pack, -0.0105, 0.0005, M['tape']))
    parts.append(disc(f'{name}_hub', 0.0, 0.03, -0.0105, 0.004, M['alu']))
    parts.append(disc(f'{name}_rim', r - 0.008, r, 0.0005, 0.002, M['alu']))
    parts.append(disc(f'{name}_cap', 0.0, 0.009, 0.004, 0.012, M['darkplastic'], seg=16))
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.3
        sp = box(f'{name}_spoke{k}', 0.026, r - 0.03, 0.0015, (0, 0, 0), M['alu'], coll=coll_live(), bevel=0)
        # out from the hub at angle a in the reel's plane (three's z is Blender's -y)
        mid = 0.03 + (r - 0.038) / 2
        lx, ly = x + math.cos(a) * mid, y + math.sin(a) * mid
        sp.rotation_euler = (0, math.pi / 2 - a, F.ry)
        sp.location = bl(*F.at((lx, ly, z + 0.001)))
        parts.append(sp)
    for o in parts:
        apply_modifiers(o)
    o = join(parts, name)
    return o


def tape_recorder(M, desk_top_y, cx, cz, ry):
    """A reel-to-reel recorder standing upright, as the collectors carried into kitchens
    and farmhouses to record the tellers, and its tapes in their boxes beside it."""
    F = Frame((cx, desk_top_y, cz), ry)
    W, Hh, D = 0.42, 0.34, 0.2
    root = empty('recorder', F.at((0, 0, 0)), coll=coll_live(), rot_y=ry)
    parts = []
    # a grey case with walnut cheeks, the deck plate in front
    parts.append(F.box('rec_case', W - 0.03, Hh, D, (0, Hh / 2 + 0.008, 0), M['steel'], coll=coll_live(), bevel=0.006))
    for s_ in (-1, 1):
        parts.append(F.box(f'rec_cheek{s_}', 0.018, Hh + 0.004, D + 0.006, (s_ * (W / 2 - 0.009), Hh / 2 + 0.008, 0), M['table'], coll=coll_live(), bevel=0.004))
    parts.append(F.box('rec_deck', W - 0.04, Hh - 0.012, 0.006, (0, Hh / 2 + 0.008, D / 2 + 0.002), M['deck'], coll=coll_live(), bevel=0.002))
    # the lower panel: head cover, the row of keys, two meters, three knobs
    parts.append(F.box('rec_panel', W - 0.05, 0.1, 0.004, (0, 0.062, D / 2 + 0.006), M['alu'], coll=coll_live(), bevel=0.001))
    parts.append(F.box('rec_heads', 0.12, 0.05, 0.03, (0, 0.145, D / 2 + 0.018), M['darkplastic'], coll=coll_live(), bevel=0.006))
    for k in range(6):
        parts.append(F.box(f'rec_key{k}', 0.022, 0.016, 0.012, (-0.075 + k * 0.03, 0.045, D / 2 + 0.012), M['chrome'] if k % 3 else M['darkplastic'], coll=coll_live(), bevel=0.002))
    for s_ in (-1, 1):
        parts.append(F.box(f'rec_meter{s_}', 0.05, 0.034, 0.003, (s_ * 0.145, 0.085, D / 2 + 0.008), M['meter'], coll=coll_live(), bevel=0.001))
        parts.append(F.box(f'rec_needle{s_}', 0.0015, 0.024, 0.001, (s_ * 0.145 - 0.008, 0.083, D / 2 + 0.0105), M['black'], coll=coll_live(), bevel=0, ry=0))
    for k, kx in enumerate((-0.16, 0.0, 0.16)):
        kn = F.lathe(f'rec_knob{k}', [(0.0, 0.0), (0.012, 0.0), (0.011, 0.012), (0.0, 0.013)], (kx, 0.03 if k != 1 else 0.02, D / 2 + 0.008), M['darkplastic'], coll=coll_live(), segments=20)
        kn.rotation_euler = (math.pi / 2, 0, ry)
        parts.append(kn)
    # spindles, and the tape running from reel to reel down past the heads
    for s_ in (-1, 1):
        parts.append(F.box(f'rec_guide{s_}', 0.006, 0.006, 0.02, (s_ * 0.07, 0.175, D / 2 + 0.014), M['chrome'], coll=coll_live(), bevel=0.001))
    body = join(parts, 'recorder_body')
    parent_keep(body, root)
    rl = _reel('recorder_reel_l', F, (-0.112, Hh - 0.085, D / 2 + 0.03), 0.09, 0.072, M)
    rr = _reel('recorder_reel_r', F, (0.112, Hh - 0.085, D / 2 + 0.03), 0.09, 0.046, M)
    for o in (rl, rr):
        parent_keep(o, root)
    # the tape between them, slanting down to the guides either side of the heads
    for s_, rx, pack in ((-1, -0.112, 0.072), (1, 0.112, 0.046)):
        x0_, y0_ = rx - s_ * 0.0, Hh - 0.085 - pack
        x1_, y1_ = s_ * 0.07, 0.178
        L = math.hypot(x1_ - x0_, y1_ - y0_)
        t = box(f'rec_tape{s_}', 0.0012, L, 0.006, (0, 0, 0), M['tape'], coll=coll_live(), bevel=0)
        t.rotation_euler = (0, math.atan2(x1_ - x0_, y1_ - y0_), ry)
        t.location = bl(*F.at(((x0_ + x1_) / 2, (y0_ + y1_) / 2, D / 2 + 0.03)))
        parent_keep(t, root)
    # tapes in their boxes, in a stack beside it, each with a label on its spine
    colours = [M['tapebox_red'], M['tapebox_cream'], M['tapebox_blue'], M['tapebox_red'], M['tapebox_cream']]
    stack = Frame(F.at((-0.33, 0, 0.1)), ry)
    for k, mat in enumerate(colours):
        b = stack.box(f'tapebox{k}', 0.19, 0.022, 0.19, (0, 0.011 + k * 0.0225, 0), mat, coll=coll_live(), bevel=0.0015, ry=(k * 0.37 % 0.2) - 0.1)
        lab = stack.box(f'tapelabel{k}', 0.11, 0.012, 0.001, (0, 0.011 + k * 0.0225, 0.0955), M['paper'], coll=coll_live(), bevel=0, ry=(k * 0.37 % 0.2) - 0.1)
        parent_keep(b, root)
        parent_keep(lab, root)
    return root


# ------------------------------------------------------------------ the wastepaper basket by the table

def wastebasket(M, pos):
    """A woven basket, the weavers passing in and out of the stakes, half full of paper."""
    rnd = random.Random(7)
    N, ROWS, Hh = 26, 26, 0.3
    seg = N * 4
    r_bot, r_top = 0.115, 0.145
    bm = bmesh.new()
    rings = []
    per = 4
    for j in range(ROWS * per + 1):
        y = 0.012 + (Hh - 0.012) * j / (ROWS * per)
        row, f = divmod(j, per)
        phase = math.pi * (row % 2)
        bulge = math.sin(math.pi * f / per) ** 0.6
        base = r_bot + (r_top - r_bot) * (y / Hh) ** 1.1
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            rr = base + 0.0028 * math.cos(N * a / 2 * 2 + phase) * (0.4 + 0.6 * bulge) - 0.0012 * (1 - bulge)
            ring.append(bm.verts.new(bl(rr * math.cos(a), y, rr * math.sin(a))))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for k in range(seg):
            a, b = rings[j][k], rings[j][(k + 1) % seg]
            c, d = rings[j + 1][(k + 1) % seg], rings[j + 1][k]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    side = new_object('basket_side', bm, coll_live(), M['wicker'])
    side.location = bl(*pos)
    smooth(side, angle=80)
    # solidify, so the rim has a thickness and the inside shows
    sol = side.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.006
    apply_modifiers(side)
    rim = lathe('basket_rim', [(r_top - 0.009 + 0.009 * math.cos(t), Hh + 0.009 * math.sin(t)) for t in [i * math.pi / 6 for i in range(13)]],
                pos, M['wicker'], coll=coll_live(), segments=64, cap=False)
    base = lathe('basket_base', [(0.0, 0.0), (r_bot + 0.004, 0.0), (r_bot + 0.004, 0.014), (0.0, 0.014)], pos, M['wicker'], coll=coll_live(), segments=48)
    parts = [side, rim, base]

    # waste paper filling it to a hand below the rim: a lumpy layer of crumpled sheets
    # (what is found in it, the game puts on top)
    b2 = bmesh.new()
    bmesh.ops.create_grid(b2, x_segments=16, y_segments=16, size=r_top - 0.012)
    for v in b2.verts:
        d = math.hypot(v.co.x, v.co.y)
        if d > r_top - 0.014:
            v.co.x, v.co.y = v.co.x * (r_top - 0.014) / d, v.co.y * (r_top - 0.014) / d
        v.co.z = rnd.uniform(0.0, 0.022) + 0.012 * math.sin(v.co.x * 60) * math.cos(v.co.y * 50)
    px, py, pz = pos
    fill = new_object('basket_fill', b2, coll_live(), M['paper'])
    fill.location = bl(px, py + 0.225, pz)
    parts.append(fill)
    return join(parts, 'basket')


# ------------------------------------------------------------------ the typewriter's body (keys and carriage move, and are the game's)

def typewriter(M):
    """An office typewriter of the fifties: base pan, sloped keyboard well, a hood over the
    type basket, a rear housing under the carriage, side panels, ribbon spool covers."""
    ry = -0.18
    F = Frame(TW_POS, ry)
    root = empty('typewriter_body', TW_POS, coll=coll_live(), rot_y=ry)
    parts = []

    def side_extrude(name, prof, x0_, length, mat, bevel=0.006):
        o = extrude(name, prof, length, (0, 0, 0), mat, axis='x', coll=coll_live())
        o.rotation_euler = (0, 0, ry)
        o.location = bl(*F.at((x0_, 0, 0)))
        if bevel:
            add_bevel(o, bevel, segments=3, angle=30)
        return o

    # base pan
    parts.append(side_extrude('tw_base', [(0.185, 0.012), (0.185, 0.045), (0.17, 0.052), (-0.165, 0.052), (-0.175, 0.04), (-0.175, 0.012)],
                              -0.2, 0.4, M['enamel'], bevel=0.008))
    # keyboard well: a sloped floor that rises towards the back, under the keys
    parts.append(side_extrude('tw_well', [(0.18, 0.045), (0.06, 0.082), (0.06, 0.07), (0.175, 0.04)], -0.185, 0.37, M['enamel'], bevel=0.003))
    # hood over the type basket, with an open slot where the bars fan up to the platen
    parts.append(side_extrude('tw_hood', [(0.075, 0.07), (0.07, 0.1), (0.055, 0.112), (0.035, 0.115), (0.03, 0.108), (0.05, 0.085), (0.055, 0.07)],
                              -0.2, 0.4, M['enamel'], bevel=0.005))
    # rear housing under the carriage
    parts.append(side_extrude('tw_rear', [(-0.04, 0.05), (-0.04, 0.12), (-0.06, 0.135), (-0.16, 0.135), (-0.172, 0.12), (-0.172, 0.05)],
                              -0.2, 0.4, M['enamel'], bevel=0.008))
    # side panels following the body
    for s_ in (-1, 1):
        prof = [(0.185, 0.012), (0.185, 0.05), (0.08, 0.1), (0.04, 0.12), (-0.05, 0.14), (-0.17, 0.14), (-0.178, 0.012)]
        parts.append(side_extrude(f'tw_side{s_}', prof, s_ * 0.2 - (0.014 if s_ > 0 else 0), 0.014, M['enamel'], bevel=0.005))
    # ribbon spool covers, chrome-rimmed
    for s_ in (-1, 1):
        parts.append(F.lathe(f'tw_spool{s_}', [(0.0, 0.0), (0.038, 0.0), (0.04, 0.004), (0.036, 0.012), (0.012, 0.016), (0.0, 0.016)],
                             (s_ * 0.13, 0.112, -0.005), M['enamel'], coll=coll_live(), segments=32))
        parts.append(F.lathe(f'tw_spoolrim{s_}', [(0.0375, 0.0), (0.041, 0.0), (0.041, 0.005), (0.0375, 0.005)],
                             (s_ * 0.13, 0.111, -0.005), M['chrome'], coll=coll_live(), segments=32))
    # chrome strip along the front, a scale bar in front of the platen, rubber feet
    parts.append(F.box('tw_trim', 0.37, 0.006, 0.004, (0, 0.034, 0.187), M['chrome'], coll=coll_live(), bevel=0.0015))
    parts.append(F.box('tw_scale', 0.3, 0.012, 0.004, (0, 0.142, -0.062), M['chrome'], coll=coll_live(), bevel=0.0015))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(F.lathe(f'tw_foot{sx}{sz}', [(0.0, 0.0), (0.014, 0.0), (0.016, 0.012), (0.0, 0.012)],
                                 (sx * 0.17, 0.0, sz * 0.13 + 0.005), M['rubber'], coll=coll_live(), segments=14))
    body = join(parts, 'typewriter_shell')
    parent_keep(body, root)
    return root


# ------------------------------------------------------------------ stand-ins for what the game builds itself

def occluders(M):
    """Shapes that cast shadows into the bake for objects the game draws itself."""
    occ = coll_occ()
    box('occ_map', 0.02, MAP['h'] + 0.05, MAP['w'], (MAP['cx'] - 0.01, MAP['y'], MAP['z']), M['paper'], coll=occ, bevel=0)
    for i, z in enumerate(CABINET_Z):
        box(f'occ_plate{i}', 0.004, 0.195, 0.78, (CAB['front'] + 0.002, CAB['h'] - 0.18, z), M['brass'], coll=occ, bevel=0)


def build(M):
    rnd = random.Random(1994)
    for i in range(5):
        cabinet(M, i, None)
    table(M)
    chair(M, 'chair_seat', TABLE['x'], TABLE['z'] + 0.72, 0.0)
    chair(M, 'chair_other', TABLE['x'] - 0.55, TABLE['z'] - 0.8, math.pi + 0.35)
    lamp(M)
    clock(M)
    shelving(M, rnd)
    board(M)
    door_leaf(M)
    coat_stand(M)
    typewriter(M)
    wastebasket(M, (1.4, 0, -0.62))
    occluders(M)
