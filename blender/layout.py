"""The room's measurements. These mirror the constants in game/js (room.js,
door.js, mapwall.js, typewriter.js, rails.js); change both together."""

ROOM = dict(x0=-2.7, x1=2.7, z0=-7.5, z1=8.0, h=3.3)
FAMILY_ORDER = ['voortekenen', 'wittewieven', 'weerwolven', 'spoken', 'duivel']
CABINET_Z = [5.0, 2.6, 0.2, -2.2, -4.6]
CAB = dict(w=1.6, h=2.08, d=0.55, front=ROOM['x0'] + 0.55, cols=4, rows=6, dw=0.355, dh=0.245, y0=0.2)
PUZZLE_ROW = 3
TABLE = dict(x=0.3, z=-0.9, w=1.9, d=0.95, y=0.78)
LAMP_POS = (-0.38, TABLE['y'], -1.2)
TW_POS = (TABLE['x'] + 0.6, TABLE['y'], TABLE['z'] + 0.02)
DOOR = dict(x=0.0, z=ROOM['z1'], w=0.96, h=2.16, dialY=1.22)
BOARD = dict(x=-1.45, y=1.55, z=ROOM['z1'] - 0.02, w=0.92, h=0.72)
MAP = dict(cx=ROOM['x1'] - 0.035, y=1.62, z=-1.0, w=1.28, h=1.6)
CLOCK = dict(x=ROOM['x1'] - 0.09, y=2.0, z=3.0)
WINDOW = dict(w=1.25, y0=1.0, y1=2.55)
WAIN = 1.0  # wainscot height

# Viewpoints from rails.js, for preview renders: name -> (pos, look)
CAB_FRONT = CAB['front']
STATIONS = {
    'entry': ((0, 1.65, ROOM['z1'] - 0.8), (0, 1.35, 0)),
    'room': ((1.55, 1.66, 3.9), (-0.9, 1.05, -2.4)),
    'cabinets': ((0.95, 1.62, 3.6), (-2.2, 1.1, -0.6)),
    'table': ((TABLE['x'], 1.27, TABLE['z'] + 0.92), (TABLE['x'], TABLE['y'], TABLE['z'] + 0.14)),
    'typewriter': ((TW_POS[0] - 0.06, 1.3, TW_POS[2] + 0.44), (TW_POS[0], 0.93, TW_POS[2] - 0.1)),
    'map': ((MAP['cx'] - 1.32, 1.6, MAP['z']), (MAP['cx'], 1.6, MAP['z'])),
    'window': ((0, 1.62, ROOM['z0'] + 1.9), (0, 1.7, ROOM['z0'] - 0.1)),
    'door': ((0, 1.55, DOOR['z'] - 1.45), (0, 1.3, DOOR['z'])),
    'board': ((BOARD['x'], BOARD['y'], BOARD['z'] - 0.86), (BOARD['x'], BOARD['y'], BOARD['z'])),
    'cab2': ((CAB_FRONT + 1.85, 1.48, CABINET_Z[2]), (CAB_FRONT, 1.12, CABINET_Z[2])),
    'back': ((0.6, 1.62, ROOM['z0'] + 1.5), (-0.4, 1.2, 4.0)),
    'mapwall': ((-1.0, 1.62, -0.7), (2.7, 1.62, -0.7)),
}
