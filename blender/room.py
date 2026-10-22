"""The room itself: floor, walls with panelling, ceiling and beams, window, door frame, corridor."""
import math

from lib import box, extrude, join, coll_bake, coll_live, empty, lathe, bl
from layout import ROOM, WINDOW, DOOR, WAIN

x0, x1, z0, z1, H = ROOM['x0'], ROOM['x1'], ROOM['z0'], ROOM['z1'], ROOM['h']
W, L = x1 - x0, z1 - z0
ZC = (z0 + z1) / 2
A = 'arch'


def rot(local, ry):
    """three.js rotation about y applied to a local (x, y, z)."""
    x, y, z = local
    c, s = math.cos(ry), math.sin(ry)
    return (x * c + z * s, y, -x * s + z * c)


def place(origin, ry, local):
    rx, ry_, rz = rot(local, ry)
    return (origin[0] + rx, origin[1] + ry_, origin[2] + rz)


# each wall: origin (three.js), rotation, length. Local x runs along the wall,
# local z points into the room.
WALLS = {
    'left': ((x0, 0, z1), math.pi / 2, L),
    'right': ((x1, 0, z0), -math.pi / 2, L),
    'far': ((x0, 0, z0), 0.0, W),
    'near': ((x1, 0, z1), math.pi, W),
}
WIN_U = (W / 2 - WINDOW['w'] / 2, W / 2 + WINDOW['w'] / 2)
DOOR_U = (x1 - DOOR['w'] / 2 - 0.0, x1 + DOOR['w'] / 2)  # local u of the door on the near wall


def piece(name, wall, u0, u1, y0, y1, w0, w1, mat, bevel=0.003, atlas=A):
    """A box spanning u0..u1 along a wall, y0..y1 up, w0..w1 out from the wall face."""
    origin, ry, _ = WALLS[wall]
    c = place(origin, ry, ((u0 + u1) / 2, (y0 + y1) / 2, (w0 + w1) / 2))
    return box(name, u1 - u0, y1 - y0, w1 - w0, c, mat, atlas=atlas, bevel=bevel, rot_y=ry)


def moulding(name, wall, u0, u1, profile, mat, atlas=A):
    """Extrude a (w, y) profile along a wall from u0 to u1."""
    origin, ry, _ = WALLS[wall]
    start = place(origin, ry, (u0, 0, 0))
    o = extrude(name, [(w, y) for w, y in profile], u1 - u0, (0, 0, 0), mat, axis='x', atlas=atlas)
    # extrude() runs along +x with the profile in (z, y); turn it onto the wall
    o.location = bl(*start)
    o.rotation_euler = (0, 0, ry)
    return o


SKIRT = [(0, 0), (0.024, 0), (0.024, 0.12), (0.018, 0.135), (0.016, 0.15), (0.008, 0.16), (0, 0.16)]
CHAIR = [(0, -0.03), (0.018, -0.03), (0.03, -0.018), (0.034, 0.0), (0.028, 0.016), (0.02, 0.024), (0.012, 0.03), (0, 0.03)]
CROWN = [(0, 0), (0.0, -0.14), (0.02, -0.14), (0.03, -0.12), (0.06, -0.06), (0.1, -0.03), (0.13, -0.012), (0.14, 0), ]
PICTURE = [(0, -0.018), (0.01, -0.018), (0.022, -0.008), (0.024, 0.004), (0.016, 0.012), (0, 0.014)]


def wainscot(M, wall, u0, u1, tag):
    """Panelled wainscot from u0 to u1: backing, rails, stiles, raised panels, skirting, chair rail."""
    parts = []
    run = u1 - u0
    parts.append(piece(f'wb_{tag}', wall, u0, u1, 0.16, WAIN - 0.03, 0.0, 0.012, M['panel'], bevel=0))
    parts.append(piece(f'wr0_{tag}', wall, u0, u1, 0.16, 0.25, 0.012, 0.03, M['moulding']))
    parts.append(piece(f'wr1_{tag}', wall, u0, u1, WAIN - 0.12, WAIN - 0.03, 0.012, 0.03, M['moulding']))
    n = max(1, round(run / 0.62))
    step = run / n
    for i in range(n + 1):
        u = u0 + i * step
        a, b = max(u0, u - 0.035), min(u1, u + 0.035)
        parts.append(piece(f'ws_{tag}{i}', wall, a, b, 0.25, WAIN - 0.12, 0.012, 0.03, M['moulding']))
        if i < n:
            parts.append(piece(f'wp_{tag}{i}', wall, u + 0.055, u + step - 0.055, 0.29, WAIN - 0.16, 0.012, 0.026,
                               M['panel'], bevel=0.009))
    parts.append(moulding(f'sk_{tag}', wall, u0, u1, SKIRT, M['moulding']))
    parts.append(moulding(f'cr_{tag}', wall, u0, u1, [(w, y + WAIN - 0.015) for w, y in CHAIR], M['moulding']))
    return join(parts, f'wainscot_{tag}')


def build(M):
    objs = {}
    # floor, with the corridor floor beyond the door
    objs['floor'] = box('floor', W, 0.05, L, (0, -0.025, ZC), M['floor'], atlas=A, bevel=0)
    box('corridor_floor', 1.6, 0.05, 5.2, (0, -0.025, z1 + 2.6), M['floor'], atlas=A, bevel=0)
    box('threshold', DOOR['w'] + 0.04, 0.018, 0.26, (0, 0.009, z1 + 0.125), M['door'], atlas=A, bevel=0.004)
    # ceiling and beams
    box('ceiling', W + 0.5, 0.06, L + 0.5, (0, H + 0.03, ZC), M['ceiling'], atlas=A, bevel=0)
    z = z0 + 1.0
    i = 0
    while z < z1 - 0.2:
        box(f'beam{i}', W, 0.22, 0.18, (0, H - 0.11, z), M['beam'], atlas=A, bevel=0.012)
        z += 1.7
        i += 1

    T = 0.28  # wall thickness
    # side walls: plaster above the wainscot, full length
    for wall in ('left', 'right'):
        piece(f'wall_{wall}', wall, -0.3, L + 0.3, WAIN - 0.03, H + 0.05, -T, 0.0, M['plaster'], bevel=0)
        piece(f'wall_{wall}_lo', wall, -0.3, L + 0.3, -0.05, WAIN, -T, -0.0, M['plaster'], bevel=0)
        wainscot(M, wall, 0, L, wall)
        moulding(f'crown_{wall}', wall, 0, L, [(w, y + H) for w, y in CROWN], M['moulding'])
        moulding(f'prail_{wall}', wall, 0, L, [(w, y + 2.36) for w, y in PICTURE], M['moulding'])

    # far wall with the window opening
    wu0, wu1 = WIN_U
    y0w, y1w = WINDOW['y0'], WINDOW['y1']
    piece('wall_far_l', 'far', -0.3, wu0, -0.05, H + 0.05, -T, 0, M['plaster'], bevel=0)
    piece('wall_far_r', 'far', wu1, W + 0.3, -0.05, H + 0.05, -T, 0, M['plaster'], bevel=0)
    piece('wall_far_top', 'far', wu0, wu1, y1w, H + 0.05, -T, 0, M['plaster'], bevel=0)
    piece('wall_far_bot', 'far', wu0, wu1, -0.05, y0w, -T, 0, M['plaster'], bevel=0)
    wainscot(M, 'far', 0, W, 'far')
    moulding('crown_far', 'far', 0, W, [(w, y + H) for w, y in CROWN], M['moulding'])
    moulding('prail_far_l', 'far', 0, wu0 - 0.09, [(w, y + 2.36) for w, y in PICTURE], M['moulding'])
    moulding('prail_far_r', 'far', wu1 + 0.09, W, [(w, y + 2.36) for w, y in PICTURE], M['moulding'])
    window(M)

    # near wall with the door opening
    du0, du1 = DOOR_U
    dh = DOOR['h']
    piece('wall_near_l', 'near', -0.3, du0, -0.05, H + 0.05, -T, 0, M['plaster'], bevel=0)
    piece('wall_near_r', 'near', du1, W + 0.3, -0.05, H + 0.05, -T, 0, M['plaster'], bevel=0)
    piece('wall_near_top', 'near', du0, du1, dh, H + 0.05, -T, 0, M['plaster'], bevel=0)
    wainscot(M, 'near', 0, du0 - 0.1, 'near_l')
    wainscot(M, 'near', du1 + 0.1, W, 'near_r')
    moulding('crown_near', 'near', 0, W, [(w, y + H) for w, y in CROWN], M['moulding'])
    moulding('prail_near_l', 'near', 0, du0 - 0.1, [(w, y + 2.36) for w, y in PICTURE], M['moulding'])
    moulding('prail_near_r', 'near', du1 + 0.1, W, [(w, y + 2.36) for w, y in PICTURE], M['moulding'])
    door_frame(M)
    corridor(M)
    switch(M)
    return objs


def window(M):
    """Deep reveal, oak sill, a painted frame with two casements and a fanlight, a curtain."""
    wu0, wu1 = WIN_U
    y0, y1 = WINDOW['y0'], WINDOW['y1']
    ww = wu1 - wu0
    fz = -0.17  # frame plane, set back into the reveal
    parts = []
    t = 0.07
    parts.append(piece('wf_l', 'far', wu0, wu0 + t, y0, y1, fz - 0.03, fz + 0.03, M['paint']))
    parts.append(piece('wf_r', 'far', wu1 - t, wu1, y0, y1, fz - 0.03, fz + 0.03, M['paint']))
    parts.append(piece('wf_t', 'far', wu0, wu1, y1 - t, y1, fz - 0.03, fz + 0.03, M['paint']))
    parts.append(piece('wf_b', 'far', wu0, wu1, y0, y0 + t + 0.02, fz - 0.035, fz + 0.035, M['paint']))
    ytr = y1 - 0.38  # transom under the fanlight
    parts.append(piece('wf_tr', 'far', wu0, wu1, ytr - 0.03, ytr + 0.03, fz - 0.03, fz + 0.03, M['paint']))
    mid = (wu0 + wu1) / 2
    parts.append(piece('wf_m', 'far', mid - 0.035, mid + 0.035, y0, ytr, fz - 0.03, fz + 0.035, M['paint']))
    # casement sashes and glazing bars
    for k, (a, b) in enumerate([(wu0 + t, mid - 0.035), (mid + 0.035, wu1 - t)]):
        s = 0.045
        lo, hi = y0 + t + 0.02, ytr - 0.03
        parts.append(piece(f'ws_l{k}', 'far', a, a + s, lo, hi, fz - 0.005, fz + 0.03, M['paint']))
        parts.append(piece(f'ws_r{k}', 'far', b - s, b, lo, hi, fz - 0.005, fz + 0.03, M['paint']))
        parts.append(piece(f'ws_b{k}', 'far', a, b, lo, lo + s + 0.01, fz - 0.005, fz + 0.03, M['paint']))
        parts.append(piece(f'ws_t{k}', 'far', a, b, hi - s, hi, fz - 0.005, fz + 0.03, M['paint']))
        for j in (1, 2):
            yy = lo + (hi - lo) * j / 3
            parts.append(piece(f'ws_g{k}{j}', 'far', a, b, yy - 0.012, yy + 0.012, fz, fz + 0.022, M['paint']))
        # a small brass catch
        parts.append(piece(f'wcatch{k}', 'far', (b - s - 0.01) if k == 0 else (a + s - 0.01), (b - s + 0.01) if k == 0 else (a + s + 0.01),
                           (lo + hi) / 2 - 0.05, (lo + hi) / 2 + 0.05, fz + 0.03, fz + 0.042, M['brass'], bevel=0.003))
    for j in range(1, 3):
        u = wu0 + ww * j / 3
        parts.append(piece(f'wfan{j}', 'far', u - 0.012, u + 0.012, ytr, y1 - t, fz, fz + 0.022, M['paint']))
    join(parts, 'window_frame')
    # sill: oak, overhanging the wainscot a little
    piece('window_sill', 'far', wu0 - 0.08, wu1 + 0.08, y0 - 0.035, y0 + 0.005, fz, 0.06, M['table'], bevel=0.006)
    # glass, lit live so it can catch reflections
    g = piece('window_glass', 'far', wu0 + 0.02, wu1 - 0.02, y0 + 0.02, y1 - 0.02, fz - 0.001, fz + 0.001, M['glass'],
              bevel=0, atlas=None)
    coll_bake().objects.unlink(g)
    coll_live().objects.link(g)
    # curtain rod and a linen curtain, drawn to the right
    rod_y = y1 + 0.16
    piece('curtain_rod', 'far', wu0 - 0.3, wu1 + 0.3, rod_y - 0.01, rod_y + 0.01, 0.07, 0.09, M['brass'], bevel=0.008)
    for side, (ua, ub) in (('r', (wu1 - 0.12, wu1 + 0.28)),):
        prof = []
        n = 24
        for k in range(n + 1):
            u = ua + (ub - ua) * k / n
            prof.append((u, 0.06 + 0.025 * math.sin(k * math.pi / 2.2)))
        back = [(u, w + 0.012) for u, w in reversed(prof)]
        poly = [(w, u) for u, w in prof + back]
        origin, ry, _ = WALLS['far']
        # build in local (u, y, w) then rotate: extrude along y
        from lib import new_object
        import bmesh
        bm = bmesh.new()
        lo = [bm.verts.new(bl(*place(origin, ry, (u, y0 - 0.25, w)))) for w, u in poly]
        hi = [bm.verts.new(bl(*place(origin, ry, (u, rod_y - 0.02, w)))) for w, u in poly]
        m = len(poly)
        for k in range(m):
            j = (k + 1) % m
            bm.faces.new((lo[k], lo[j], hi[j], hi[k]))
        bm.faces.new(lo[::-1])
        bm.faces.new(hi)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        c = new_object(f'curtain_{side}', bm, coll_bake(), M['linen'], A)
        for p in c.data.polygons:
            p.use_smooth = True
    # radiator under the window
    radiator(M, (wu0 + wu1) / 2)


def radiator(M, u):
    origin, ry, _ = WALLS['far']
    parts = []
    n = 14
    cw = 0.06
    width = n * cw
    for k in range(n):
        uu = u - width / 2 + cw * (k + 0.5)
        parts.append(piece(f'rad{k}', 'far', uu - 0.026, uu + 0.026, 0.14, 0.78, 0.06, 0.2, M['paint'], bevel=0.02))
    parts.append(piece('rad_top', 'far', u - width / 2, u + width / 2, 0.7, 0.74, 0.1, 0.16, M['paint'], bevel=0.015))
    parts.append(piece('rad_bot', 'far', u - width / 2, u + width / 2, 0.18, 0.22, 0.1, 0.16, M['paint'], bevel=0.015))
    for s in (-1, 1):
        parts.append(piece(f'rad_foot{s}', 'far', u + s * (width / 2 - 0.08) - 0.02, u + s * (width / 2 - 0.08) + 0.02,
                           0.0, 0.16, 0.1, 0.16, M['paint'], bevel=0.008))
    # supply pipe and valve on the left
    pu = u - width / 2 - 0.05
    pipe = lathe('rad_pipe', [(0.0, 0), (0.014, 0), (0.014, 0.3), (0.0, 0.3)], place(origin, ry, (pu, 0, 0.13)), M['iron'], segments=12)
    valve = lathe('rad_valve', [(0.0, 0), (0.025, 0), (0.025, 0.03), (0.012, 0.035), (0.012, 0.07), (0.03, 0.075), (0.03, 0.095), (0, 0.1)],
                  place(origin, ry, (pu, 0.3, 0.13)), M['iron'], segments=16)
    parts += [pipe, valve]
    join(parts, 'radiator')


ARCH = [(0, 0), (0.11, 0), (0.11, 0.012), (0.1, 0.02), (0.07, 0.024), (0.04, 0.03), (0.02, 0.036), (0.008, 0.032), (0, 0.028)]


def door_frame(M):
    """Architrave and jamb lining round the door opening (room side)."""
    du0, du1 = DOOR_U
    dh = DOOR['h']
    parts = []
    # jamb linings inside the opening
    parts.append(piece('jamb_l', 'near', du0 - 0.02, du0, 0, dh, -0.28, 0, M['door'], bevel=0.002))
    parts.append(piece('jamb_r', 'near', du1, du1 + 0.02, 0, dh, -0.28, 0, M['door'], bevel=0.002))
    parts.append(piece('jamb_t', 'near', du0 - 0.02, du1 + 0.02, dh, dh + 0.02, -0.28, 0, M['door'], bevel=0.002))
    # door stop
    parts.append(piece('stop_l', 'near', du0, du0 + 0.015, 0, dh, -0.075, -0.04, M['door'], bevel=0.002))
    parts.append(piece('stop_r', 'near', du1 - 0.015, du1, 0, dh, -0.075, -0.04, M['door'], bevel=0.002))
    parts.append(piece('stop_t', 'near', du0, du1, dh - 0.015, dh, -0.075, -0.04, M['door'], bevel=0.002))
    # architrave: a flat board with a raised bead on the opening side, plinth blocks at the foot
    for k, u in enumerate((du0 - 0.11, du1)):
        parts.append(piece(f'arch_v{k}', 'near', u, u + 0.11, 0.2, dh + 0.11, 0, 0.022, M['door'], bevel=0.004))
        bu = u + 0.11 - 0.022 if k == 0 else u
        parts.append(piece(f'arch_bead{k}', 'near', bu, bu + 0.022, 0.2, dh + 0.11, 0.02, 0.034, M['door'], bevel=0.008))
        parts.append(piece(f'arch_plinth{k}', 'near', u - 0.005, u + 0.115, 0, 0.2, 0, 0.036, M['door'], bevel=0.004))
    parts.append(piece('arch_head', 'near', du0 - 0.11, du1 + 0.11, dh, dh + 0.11, 0, 0.022, M['door'], bevel=0.004))
    parts.append(piece('arch_head_bead', 'near', du0 - 0.002, du1 + 0.002, dh, dh + 0.022, 0.02, 0.034, M['door'], bevel=0.008))
    parts.append(piece('arch_cap', 'near', du0 - 0.14, du1 + 0.14, dh + 0.11, dh + 0.14, 0, 0.05, M['door'], bevel=0.006))
    join(parts, 'door_frame')


def corridor(M):
    """The corridor behind the door: dim, plain, the same one you came through."""
    zc = z1 + 0.28
    length = 4.8
    cw = 1.5
    box('cor_wall_l', 0.1, 2.7, length, (-cw / 2 - 0.05, 1.35, zc + length / 2), M['plaster'], atlas=A, bevel=0)
    box('cor_wall_r', 0.1, 2.7, length, (cw / 2 + 0.05, 1.35, zc + length / 2), M['plaster'], atlas=A, bevel=0)
    box('cor_end', cw + 0.2, 2.7, 0.1, (0, 1.35, zc + length + 0.05), M['plaster'], atlas=A, bevel=0)
    box('cor_ceiling', cw + 0.2, 0.05, length, (0, 2.7 + 0.025, zc + length / 2), M['ceiling'], atlas=A, bevel=0)
    for s in (-1, 1):
        box(f'cor_skirt{s}', 0.02, 0.15, length, (s * (cw / 2 - 0.01), 0.075, zc + length / 2), M['moulding'], atlas=A, bevel=0.003)
        box(f'cor_wain{s}', 0.012, 0.9, length, (s * (cw / 2 - 0.006), 0.6, zc + length / 2), M['panel'], atlas=A, bevel=0)
        box(f'cor_rail{s}', 0.025, 0.04, length, (s * (cw / 2 - 0.012), 1.05, zc + length / 2), M['moulding'], atlas=A, bevel=0.004)
    # a second door at the far end, closed
    box('cor_door', 0.9, 2.1, 0.05, (0, 1.05, zc + length - 0.02), M['door'], atlas=A, bevel=0.006)
    box('cor_door_knob', 0.03, 0.03, 0.06, (0.33, 1.0, zc + length - 0.07), M['brass'], atlas=A, bevel=0.01)
    empty('anchor_corridor_lamp', (0, 2.7, zc + 2.6))


def switch(M):
    """A bakelite light switch by the door, with surface conduit up to the ceiling."""
    du0, du1 = DOOR_U
    origin, ry, _ = WALLS['near']
    u = du0 - 0.28
    parts = [piece('switch_box', 'near', u - 0.04, u + 0.04, 1.16, 1.24, 0, 0.035, M['bakelite'], bevel=0.01),
             piece('switch_tog', 'near', u - 0.006, u + 0.006, 1.2, 1.225, 0.03, 0.05, M['bakelite'], bevel=0.003),
             piece('conduit', 'near', u - 0.009, u + 0.009, 1.24, H - 0.12, 0.004, 0.022, M['paint'], bevel=0.008)]
    join(parts, 'switch')
