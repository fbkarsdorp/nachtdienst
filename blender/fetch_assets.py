#!/usr/bin/env python3
"""Download the CC0 textures and models the Blender build uses.

    python3 blender/fetch_assets.py

Everything comes from Poly Haven (polyhaven.com) and ambientCG (ambientcg.com),
both CC0. Files land in blender/assets/ and are only read by the Blender build;
the game ships what the build exports, not these.
"""
import io
import json
import pathlib
import sys
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent / 'assets'

# Poly Haven textures: id -> resolution
TEXTURES = {
    'herringbone_parquet': '2k',    # floor
    'painted_plaster_wall': '2k',   # walls and ceiling, cleaned by derive.py
    'wood_cabinet_worn_long': '2k', # card cabinets
    'oak_veneer_01': '2k',          # drawer fronts
    'walnut_veneer': '2k',          # table, wainscot, door
    'dark_wood': '1k',              # beams, frames, mouldings
    'leather_white': '1k',          # desk inlay (tinted green)
    'metal_plate': '1k',            # roughness for brass and iron
    'hessian_230': '1k',            # pin board
    'poly_wool_herringbone': '1k',  # the coat
    'rough_linen': '1k',            # dust cover, curtain
}
# ambientCG materials: id -> resolution
AMBIENTCG = {
    'Cardboard004': '1K',           # archive boxes
}
# Poly Haven models (glTF, 1k textures)
MODELS = [
    'book_encyclopedia_set_01',
    'clipboard', 'binder_notebook', 'magnifying_glass_01', 'vintage_stapler',
    'vintage_suitcase', 'portable_cassette_player', 'hanging_industrial_lamp', 'caged_hanging_light',
    'industrial_wall_lamp', 'standing_picture_frame_01', 'fancy_picture_frame_01',
    'GreenChair_01', 'small_wooden_table_01', 'vintage_electric_kettle',
    'tea_set_01', 'metal_office_desk',
]

UA = {'User-Agent': 'na-sluitingstijd-build/1.0'}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def polyhaven_texture(tid, res):
    out = ROOT / 'textures' / tid
    files = json.loads(get(f'https://api.polyhaven.com/files/{tid}'))
    for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough'), ('AO', 'ao')):
        if key not in files:
            continue
        dest = out / f'{name}.jpg'
        if dest.exists():
            continue
        save(dest, get(files[key][res]['jpg']['url']))
    print('texture', tid)


def ambientcg_texture(aid, res):
    out = ROOT / 'textures' / aid
    if (out / 'diff.jpg').exists():
        return
    z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip')))
    for n in z.namelist():
        for suffix, name in (('_Color.jpg', 'diff'), ('_NormalGL.jpg', 'nor'), ('_Roughness.jpg', 'rough'), ('_AmbientOcclusion.jpg', 'ao')):
            if n.endswith(suffix):
                save(out / f'{name}.jpg', z.read(n))
    print('texture', aid)


def polyhaven_model(mid):
    out = ROOT / 'models' / mid
    if (out / f'{mid}.gltf').exists() or (out / f'{mid}.blend').exists():
        return
    files = json.loads(get(f'https://api.polyhaven.com/files/{mid}'))
    # glTF where offered, otherwise the .blend
    kind = 'gltf' if 'gltf' in files else 'blend'
    g = files[kind]['1k'][kind]
    save(out / f'{mid}.{kind}', get(g['url']))
    for rel, info in g.get('include', {}).items():
        save(out / rel, get(info['url']))
    print('model', mid, kind)


def main():
    for tid, res in TEXTURES.items():
        polyhaven_texture(tid, res)
    for aid, res in AMBIENTCG.items():
        ambientcg_texture(aid, res)
    for mid in MODELS:
        polyhaven_model(mid)
    (ROOT / 'LICENSE.txt').write_text(
        'All textures and models in this folder are CC0 (public domain), from\n'
        'Poly Haven (https://polyhaven.com) and ambientCG (https://ambientcg.com).\n')


if __name__ == '__main__':
    sys.exit(main())
