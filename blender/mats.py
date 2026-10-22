"""The archive's materials, from the CC0 texture sets in assets/textures."""
from lib import pbr

# real-world size of one repeat of each texture, in metres (from Poly Haven's metadata)
TILE = {
    'herringbone_parquet': 3.4, 'painted_plaster_wall': 2.0, 'clean_plaster': 2.0,
    'wood_cabinet_worn_long': (1.0, 0.5), 'oak_veneer_01': 1.83, 'walnut_veneer': 1.8, 'dark_wood': 2.0,
    'leather_white': 0.3, 'metal_plate': 0.5, 'hessian_230': 0.27, 'poly_wool_herringbone': 0.27,
    'rough_linen': 0.27, 'Cardboard004': 0.6,
}


def tile_of(m):
    t = TILE.get(m['params']['tex'], 1.0) if m and 'params' in m else 1.0
    return t if isinstance(t, tuple) else (t, t)


def library():
    M = {}
    M['floor'] = pbr('floor', 'herringbone_parquet', rough=0.55, tint=(0.62, 0.5, 0.4), normal=0.8)
    # walls in cream distemper, the ceiling whiter: clean, the trowel marks still there (derive.py)
    M['plaster'] = pbr('plaster', 'clean_plaster', rough=0.9, tint=(0.9, 0.84, 0.7), normal=0.7)
    M['ceiling'] = pbr('ceiling', 'clean_plaster', rough=0.95, tint=(0.88, 0.86, 0.8), normal=0.5)
    M['panel'] = pbr('panel', 'walnut_veneer', rough=0.5, tint=(0.62, 0.5, 0.4), normal=0.6)
    M['beam'] = pbr('beam', 'dark_wood', rough=0.7, tint=(0.62, 0.52, 0.44))
    M['moulding'] = pbr('moulding', 'dark_wood', rough=0.5, tint=(0.5, 0.4, 0.32))
    M['cabinet'] = pbr('cabinet', 'walnut_veneer', rough=0.45, tint=(0.4, 0.29, 0.21), normal=0.6)
    M['drawer'] = pbr('drawer', 'oak_veneer_01', rough=0.45, tint=(0.46, 0.32, 0.21), normal=0.7)
    M['table'] = pbr('table', 'walnut_veneer', rough=0.32, tint=(0.42, 0.29, 0.21))
    M['leather'] = pbr('leather', 'leather_white', rough=0.5, tint=(0.09, 0.2, 0.13), normal=0.8)
    M['brass'] = pbr('brass', 'metal_plate', color=(0.78, 0.58, 0.3), rough=0.35, metal=1.0,
                     tint=(0.78, 0.58, 0.3), rough_scale=0.7, normal=0.15)
    M['darkbrass'] = pbr('darkbrass', 'metal_plate', color=(0.42, 0.31, 0.15), rough=0.45, metal=1.0,
                         tint=(0.42, 0.31, 0.15), rough_scale=0.9, normal=0.15)
    M['iron'] = pbr('iron', 'metal_plate', color=(0.06, 0.06, 0.06), rough=0.6, metal=0.7,
                    tint=(0.07, 0.068, 0.065), normal=0.4)
    # gloss paint on the window joinery and the radiator, yellowed cream
    M['paint'] = pbr('paint', None, color=(0.4, 0.38, 0.31), rough=0.4)
    M['steel'] = pbr('steel', 'metal_plate', color=(0.32, 0.33, 0.33), rough=0.5, metal=0.35,
                     tint=(0.36, 0.37, 0.37), normal=0.2)
    M['door'] = pbr('door', 'walnut_veneer', rough=0.42, tint=(0.5, 0.38, 0.29))
    M['hessian'] = pbr('hessian', 'hessian_230', rough=0.95, tint=(0.72, 0.6, 0.44))
    M['wool'] = pbr('wool', 'poly_wool_herringbone', rough=0.95, tint=(0.11, 0.105, 0.1))
    M['linen'] = pbr('linen', 'rough_linen', rough=0.95, tint=(0.72, 0.69, 0.6))
    # the tape recorder: a brushed deck plate, brown tape, its meters, its tapes' boxes
    M['alu'] = pbr('alu', None, color=(0.62, 0.62, 0.6), rough=0.32, metal=1.0)
    M['deck'] = pbr('deck', None, color=(0.06, 0.062, 0.066), rough=0.38, metal=0.4)
    M['label'] = pbr('label', None, color=(0.56, 0.53, 0.45), rough=0.9)
    M['tape'] = pbr('tape', None, color=(0.07, 0.045, 0.03), rough=0.35)
    M['meter'] = pbr('meter', None, color=(0.78, 0.72, 0.56), rough=0.3)
    M['tapebox_red'] = pbr('tapebox_red', None, color=(0.32, 0.06, 0.04), rough=0.55)
    M['tapebox_cream'] = pbr('tapebox_cream', None, color=(0.62, 0.58, 0.48), rough=0.6)
    M['tapebox_blue'] = pbr('tapebox_blue', None, color=(0.08, 0.13, 0.24), rough=0.55)
    M['wicker'] = pbr('wicker', None, color=(0.4, 0.28, 0.15), rough=0.75)
    M['cardboard'] = pbr('cardboard', 'Cardboard004', rough=0.85, tint=(0.95, 0.9, 0.85))
    M['archivebox'] = pbr('archivebox', 'Cardboard004', rough=0.85, tint=(0.5, 0.5, 0.48))
    M['archivebox_blue'] = pbr('archivebox_blue', 'Cardboard004', rough=0.85, tint=(0.3, 0.36, 0.42))
    # lever arch files: marbled board in grey, black, blue and green
    M['ordner_grey'] = pbr('ordner_grey', 'Cardboard004', rough=0.7, tint=(0.3, 0.31, 0.32))
    M['ordner_black'] = pbr('ordner_black', None, color=(0.03, 0.03, 0.034), rough=0.6)
    M['ordner_blue'] = pbr('ordner_blue', 'Cardboard004', rough=0.7, tint=(0.1, 0.14, 0.3))
    M['ordner_green'] = pbr('ordner_green', 'Cardboard004', rough=0.7, tint=(0.1, 0.2, 0.13))
    M['packtape'] = pbr('packtape', None, color=(0.5, 0.38, 0.22), rough=0.35)
    M['black'] = pbr('black', None, color=(0.015, 0.014, 0.013), rough=0.85)
    M['void'] = pbr('void', None, color=(0.005, 0.005, 0.005), rough=1.0)
    M['plastic'] = pbr('plastic', None, color=(0.62, 0.58, 0.49), rough=0.42)
    M['darkplastic'] = pbr('darkplastic', None, color=(0.05, 0.05, 0.05), rough=0.4)
    M['greenglass'] = pbr('greenglass', None, color=(0.02, 0.16, 0.07), rough=0.08)
    M['opal'] = pbr('opal', None, color=(0.95, 0.9, 0.8), rough=0.4, emission=(1.0, 0.86, 0.62),
                    emission_strength=4.0)
    M['bulb'] = pbr('bulb', None, color=(1, 0.95, 0.85), rough=0.2, emission=(1.0, 0.9, 0.7),
                    emission_strength=30.0)
    M['glass'] = pbr('glass', None, color=(0.04, 0.05, 0.06), rough=0.04, alpha=0.18)
    M['paper'] = pbr('paper', None, color=(0.86, 0.83, 0.74), rough=0.9)
    M['enamel'] = pbr('enamel', None, color=(0.025, 0.026, 0.024), rough=0.22)
    M['chrome'] = pbr('chrome', None, color=(0.8, 0.8, 0.78), rough=0.14, metal=1.0)
    M['rubber'] = pbr('rubber', None, color=(0.02, 0.02, 0.02), rough=0.8)
    M['cable'] = pbr('cable', None, color=(0.03, 0.03, 0.03), rough=0.6)
    M['bakelite'] = pbr('bakelite', None, color=(0.08, 0.05, 0.03), rough=0.3)
    return M
