"""Build the archive in Blender, bake its light, and export it for the game.

    Blender -b -P blender/build.py -- [--preview room,table] [--bake] [--export]
                                      [--samples 512] [--lmsize 2048] [--save out.blend]

--preview renders Cycles stills from the game's viewpoints into blender/preview/.
--bake bakes two lightmaps per atlas: the desk lamp alone, and everything else
(moonlight at the window, the corridor, the night). The game adds them, so the
lamp can flicker without the rest of the room flickering with it.
--export writes game/models/room.glb, the lightmaps and game/models/room.json.
"""
import json
import math
import pathlib
import sys
import time

import bmesh
import bpy
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import lib  # noqa: E402
import derive  # noqa: E402
import mats  # noqa: E402
import room  # noqa: E402
import furniture  # noqa: E402
import props  # noqa: E402
from layout import STATIONS, LAMP_POS, WINDOW, ROOM  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
GAME = HERE.parent / 'game'
OUT = GAME / 'models'
PREVIEW = HERE / 'preview'

ATLASES = {'arch': 2048, 'cab': 2048, 'furn': 2048}


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'preview': [], 'bake': False, 'export': False, 'samples': 512, 'lmsize': None, 'save': None, 'pres': 64, 'ev': 0.0}
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--preview':
            o['preview'] = a[i + 1].split(',')
            i += 1
        elif k == '--bake':
            o['bake'] = True
        elif k == '--export':
            o['export'] = True
        elif k == '--samples':
            o['samples'] = int(a[i + 1])
            i += 1
        elif k == '--ev':
            o['ev'] = float(a[i + 1])
            i += 1
        elif k == '--pres':
            o['pres'] = int(a[i + 1])
            i += 1
        elif k == '--lmsize':
            o['lmsize'] = int(a[i + 1])
            i += 1
        elif k == '--save':
            o['save'] = a[i + 1]
            i += 1
        i += 1
    return o


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'METAL'
    sc.cycles.device = 'GPU'
    sc.unit_settings.system = 'METRIC'
    world = bpy.data.worlds.new('night')
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.0025, 0.003, 0.0045, 1)
    bg.inputs['Strength'].default_value = 1.0
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'


# ------------------------------------------------------------------ lights

LIGHTS = {}


def lights():
    c = lib.collection('LIGHTS')
    lx, ly, lz = LAMP_POS
    def add(name, kind, pos, energy, color, size=0.0, rot=None):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        d.color = color
        if kind == 'POINT':
            d.shadow_soft_size = size
        if kind == 'AREA':
            d.shape = 'RECTANGLE'
            d.size, d.size_y = size
        o = bpy.data.objects.new(name, d)
        c.objects.link(o)
        o.location = lib.bl(*pos)
        if rot:
            o.rotation_euler = rot
        LIGHTS[name] = (o, energy)
        return o
    add('lamp', 'POINT', (lx, ly + 0.405, lz + 0.14), 9.0, (1.0, 0.8, 0.56), size=0.018)
    # moonlight through the window: an area light outside facing in
    add('moon', 'AREA', (0.0, (WINDOW['y0'] + WINDOW['y1']) / 2 + 0.2, ROOM['z0'] - 0.6), 9.0, (0.55, 0.66, 0.95),
        size=(1.4, 1.7), rot=(math.radians(-82), 0, 0))
    add('corridor', 'POINT', (0.0, 2.15, ROOM['z1'] + 2.9), 16.0, (1.0, 0.76, 0.48), size=0.05)
    # the faint glow that makes the far end of the room not quite black
    add('fill', 'AREA', (0.0, ROOM['h'] - 0.7, 0.0), 11.0, (0.7, 0.62, 0.52), size=(3.6, 14.0))
    # the bulb must not shadow the light inside it
    b = bpy.data.objects.get('lamp_bulb')
    if b:
        b.visible_shadow = False
    # the pendant over the table is switched off, and hangs right in the fill light: its
    # shade and cage would throw a striped shadow across the map wall
    for o in bpy.data.objects:
        if 'hanging_industrial_lamp' in o.name and o.type == 'MESH':
            o.visible_shadow = False
            for slot in o.material_slots:
                m = slot.material
                if m and 'Principled BSDF' in m.node_tree.nodes:
                    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0


def set_channel(ch):
    """'lamp': only the desk lamp; 'amb': everything but the lamp; 'all': both."""
    for name, (o, e) in LIGHTS.items():
        on = (name == 'lamp') if ch == 'lamp' else (name != 'lamp') if ch == 'amb' else True
        o.data.energy = e if on else 0.0
    world = bpy.context.scene.world.node_tree.nodes['Background']
    world.inputs['Strength'].default_value = 0.0 if ch == 'lamp' else 1.0
    for mname in ('opal', 'bulb'):
        m = bpy.data.materials.get(mname)
        if m is None:
            continue
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Strength'].default_value = 0.0 if ch == 'amb' else m['params']['emission_strength']


# ------------------------------------------------------------------ UVs

def texture_uvs():
    """Box-projected texture coordinates for everything built here (models keep their own)."""
    for o in list(lib.coll_bake().all_objects) + list(lib.coll_live().all_objects):
        if o.type != 'MESH' or o.get('imported'):
            continue
        lib.apply_modifiers(o)
        if 'UVMap' in o.data.uv_layers and o.get('uv_done'):
            continue
        slots = [s.material for s in o.material_slots]
        def tiles(i, slots=slots):
            return mats.tile_of(slots[i] if i < len(slots) else None)
        lib.box_uv(o, tile=tiles, layer='UVMap')
        o['uv_done'] = True


VERTEX_MIN = 2500  # imported meshes denser than this get their light in vertex colours


def bake_groups():
    """Atlas groups (own geometry, and sparse imported meshes) and the vertex-baked group."""
    groups = {k: [] for k in ATLASES}
    vertex = []
    for o in lib.coll_bake().all_objects:
        if o.type != 'MESH' or o.get('lm') not in groups:
            continue
        lib.apply_modifiers(o)
        if o.get('imported') and len(o.data.vertices) > VERTEX_MIN:
            vertex.append(o)
        else:
            groups[o['lm']].append(o)
    return groups, vertex


def split_long_edges(objs, max_len=1.0):
    """Cut long edges of our own architecture into pieces of about max_len. A wall face
    that is one 17 m quad bakes badly: two needle triangles, and Cycles offsets its bake
    rays by triangle size, so blotches of light and shadow appear on the plaster."""
    for o in objs:
        if o.get('imported'):
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for _ in range(3):
            by_cuts = {}
            for e in bm.edges:
                n = int(e.calc_length() * o.matrix_world.to_scale()[0] / max_len)
                if n >= 1:
                    by_cuts.setdefault(min(n, 24), []).append(e)
            if not by_cuts:
                break
            for cuts, edges in sorted(by_cuts.items()):
                live = [e for e in edges if e.is_valid]
                if live:
                    bmesh.ops.subdivide_edges(bm, edges=live, cuts=cuts, use_grid_fill=True)
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()


def merged_copy(objs, name):
    """Join copies of objs into one world-space mesh, each face corner and vertex tagged
    with the object and index it came from, so results can be handed back."""
    coll = lib.collection('_BAKE_TMP')
    dups = []
    for i, o in enumerate(objs):
        me = o.data.copy()
        me.attributes.new('oid', 'INT', 'POINT').data.foreach_set('value', [i] * len(me.vertices))
        me.attributes.new('foid', 'INT', 'FACE').data.foreach_set('value', [i] * len(me.polygons))
        me.attributes.new('lid', 'INT', 'CORNER').data.foreach_set('value', list(range(len(me.loops))))
        me.attributes.new('vid', 'INT', 'POINT').data.foreach_set('value', list(range(len(me.vertices))))
        d = bpy.data.objects.new(f'{name}_{i}', me)
        coll.objects.link(d)
        d.matrix_world = o.matrix_world.copy()
        dups.append(d)
    bpy.context.view_layer.update()
    j = lib.join(dups, name)
    # bring the joined mesh into world space
    j.data.transform(j.matrix_world)
    j.matrix_world = j.matrix_world.__class__.Identity(4)
    return j


def bake_materials(j, img, atlas):
    """Give the merged mesh throwaway copies of its materials with the bake target active."""
    made = []
    for slot in j.material_slots:
        m = slot.material
        if m is None:
            continue
        mc = m.copy()
        mc.name = f'_bake_{m.name}_{atlas}'
        nt = mc.node_tree
        for nm in [x for x in nt.nodes if x.type == 'NORMAL_MAP']:
            nm.inputs['Strength'].default_value = 0.0
        if img is not None:
            n = nt.nodes.new('ShaderNodeTexImage')
            n.image = img
            nt.nodes.active = n
        slot.material = mc
        made.append(mc)
    return made


def select_only(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def unwrap(j):
    me = j.data
    me.uv_layers.new(name='LM')
    me.uv_layers.active = me.uv_layers['LM']
    select_only(j)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, rotate_method='AXIS_ALIGNED', margin=0.0025, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')


def hand_back_uvs(j, objs):
    me = j.data
    nl = len(me.loops)
    uv = np.zeros(nl * 2, dtype=np.float32)
    me.uv_layers['LM'].data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    lid = np.zeros(nl, dtype=np.int32)
    me.attributes['lid'].data.foreach_get('value', lid)
    foid = np.zeros(len(me.polygons), dtype=np.int32)
    me.attributes['foid'].data.foreach_get('value', foid)
    totals = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('loop_total', totals)
    loop_oid = np.repeat(foid, totals)
    for i, o in enumerate(objs):
        m = loop_oid == i
        t = np.zeros((len(o.data.loops), 2), dtype=np.float32)
        t[lid[m]] = uv[m]
        if 'LM' not in o.data.uv_layers:
            if not o.data.uv_layers:
                o.data.uv_layers.new(name='UVMap')
            o.data.uv_layers.new(name='LM')
        o.data.uv_layers['LM'].data.foreach_set('uv', t.ravel())
        o.data.uv_layers[0].active_render = True
        o.data.uv_layers.active = o.data.uv_layers[0]


def bake_atlas(atlas, objs, size, samples):
    t0 = time.time()
    j = merged_copy(objs, f'_bake_{atlas}')
    unwrap(j)
    img = bpy.data.images.new(f'lm_{atlas}', size, size, float_buffer=True, alpha=False)
    made = bake_materials(j, img, atlas)
    select_only(j)
    sc = bpy.context.scene
    sc.render.bake.target = 'IMAGE_TEXTURES'
    out = {}
    for ch in ('lamp', 'amb'):
        set_channel(ch)
        t = time.time()
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8, use_clear=True)
        out[ch] = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[:, :, :3].copy()
        print(f'[bake] {atlas}/{ch} {time.time() - t:.1f}s')
    set_channel('all')
    hand_back_uvs(j, objs)
    cleanup(j, made, img)
    print(f'[bake] {atlas}: {len(objs)} objects in {time.time() - t0:.1f}s')
    return out


def bake_vertices(objs):
    t0 = time.time()
    j = merged_copy(objs, '_bake_vertex')
    made = bake_materials(j, None, 'vertex')
    me = j.data
    attr = me.color_attributes.new('bake', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    select_only(j)
    sc = bpy.context.scene
    sc.render.bake.target = 'VERTEX_COLORS'
    nv = len(me.vertices)
    oid = np.zeros(nv, dtype=np.int32)
    vid = np.zeros(nv, dtype=np.int32)
    me.attributes['oid'].data.foreach_get('value', oid)
    me.attributes['vid'].data.foreach_get('value', vid)
    res = {}
    for ch in ('lamp', 'amb'):
        set_channel(ch)
        t = time.time()
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'})
        c = np.zeros(nv * 4, dtype=np.float32)
        me.color_attributes['bake'].data.foreach_get('color', c)
        res[ch] = c.reshape(-1, 4)[:, :3].copy()
        print(f'[bake] vertex/{ch} {time.time() - t:.1f}s')
    set_channel('all')
    sc.render.bake.target = 'IMAGE_TEXTURES'
    # a vertex bake is not denoised: a vertex that caught a stray bright path stands out as
    # a speck on a small face, and specks twinkle as the view moves. Hold each vertex to
    # a little above its neighbours'.
    ed = np.zeros(len(me.edges) * 2, dtype=np.int32)
    me.edges.foreach_get('vertices', ed)
    ed = ed.reshape(-1, 2)
    for ch, c in res.items():
        lum = c @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        tot = np.zeros(nv, dtype=np.float32)
        cnt = np.zeros(nv, dtype=np.float32)
        np.add.at(tot, ed[:, 0], lum[ed[:, 1]])
        np.add.at(tot, ed[:, 1], lum[ed[:, 0]])
        np.add.at(cnt, ed[:, 0], 1)
        np.add.at(cnt, ed[:, 1], 1)
        cap = 1.6 * tot / np.maximum(cnt, 1) + 1e-4
        k = np.minimum(1.0, cap / np.maximum(lum, 1e-6))
        print(f'[bake] vertex/{ch}: {int((k < 1).sum())} of {nv} vertices held down')
        res[ch] = c * k[:, None]
    scales = {}
    for ch, c in res.items():
        scale = float(np.percentile(c, 99.5)) or 1.0
        scales[ch] = scale
        enc = np.sqrt(np.clip(c / scale, 0, 1))
        for i, o in enumerate(objs):
            m = oid == i
            arr = np.ones((len(o.data.vertices), 4), dtype=np.float32)
            arr[vid[m], :3] = enc[m]
            name = f'lm_{ch}'
            if name in o.data.color_attributes:
                o.data.color_attributes.remove(o.data.color_attributes[name])
            a = o.data.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
            a.data.foreach_set('color', arr.ravel())
            o['lmv'] = True
    cleanup(j, made, None)
    print(f'[bake] vertex: {len(objs)} objects in {time.time() - t0:.1f}s')
    return scales


def cleanup(j, made, img):
    me = j.data
    bpy.data.objects.remove(j)
    bpy.data.meshes.remove(me)
    for m in made:
        bpy.data.materials.remove(m)
    if img is not None:
        bpy.data.images.remove(img)


def bake(o):
    sc = bpy.context.scene
    sc.cycles.samples = o['samples']
    sc.cycles.use_denoising = False
    # no caustics through the lamp's glass, and no fireflies from glossy bounces
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    sc.cycles.sample_clamp_indirect = 2.0
    sc.render.bake.margin = 8
    sc.render.bake.margin_type = 'EXTEND'
    groups, vertex = bake_groups()
    split_long_edges(groups.get('arch', []))
    results = {}
    for atlas, objs in groups.items():
        if objs:
            size = o['lmsize'] or ATLASES[atlas]
            for ch, px in bake_atlas(atlas, objs, size, o['samples']).items():
                results[(atlas, ch)] = px
    vscales = bake_vertices(vertex) if vertex else {}
    return results, vscales


def denoise(px):
    """A light edge-aware smoothing: average with neighbours that are close in value.
    Margins were extended by the bake, so islands don't bleed into each other."""
    # first knock down lone bright texels against their neighbourhood's median
    stack = np.stack([np.roll(np.roll(px, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    med = np.median(stack, axis=0)
    px = np.minimum(px, med * 1.6 + 1e-4)
    acc = px.copy()
    wsum = np.ones(px.shape[:2], dtype=np.float32)
    lum = px.mean(axis=2)
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            if dx == 0 and dy == 0:
                continue
            sh = np.roll(np.roll(px, dy, 0), dx, 1)
            sl = sh.mean(axis=2)
            w = np.exp(-((sl - lum) ** 2) / (2 * (0.25 * lum + 0.01) ** 2)) * math.exp(-(dx * dx + dy * dy) / 4.0)
            acc += sh * w[:, :, None]
            wsum += w
    return acc / wsum[:, :, None]


def save_lightmaps(results):
    """8-bit sRGB-encoded lightmaps, each scaled so its brightest texels fill the range."""
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for (atlas, ch), px in results.items():
        px = denoise(np.maximum(px, 0))
        scale = float(np.percentile(px, 99.8)) or 1.0
        v = np.clip(px / scale, 0, 1)
        enc = np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)
        size = px.shape[0]
        img = bpy.data.images.new(f'out_{atlas}_{ch}', size, size, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        rgba = np.ones((size, size, 4), dtype=np.float32)
        rgba[:, :, :3] = enc
        img.pixels.foreach_set(rgba.ravel())
        name = f'lm_{atlas}_{ch}.webp'
        img.file_format = 'WEBP'
        img.save(filepath=str(OUT / name), quality=92)
        bpy.data.images.remove(img)
        manifest.setdefault(atlas, {})[ch] = {'file': name, 'scale': scale}
        print(f'[lm] {name} scale {scale:.4f}')
    return manifest


# ------------------------------------------------------------------ export

TEX_RES = {'herringbone_parquet': 2048, 'wood_cabinet_worn_long': 2048, 'walnut_veneer': 2048}


def export_textures():
    """The room's own texture sets as WebP, which the game loads once and shares."""
    d = OUT / 'tex'
    d.mkdir(parents=True, exist_ok=True)
    used = sorted({m['params']['tex'] for m in bpy.data.materials if 'params' in m and m['params']['tex']})
    files = {}
    for tex in used:
        res = TEX_RES.get(tex, 1024)
        files[tex] = {}
        for kind in ('diff', 'nor', 'rough'):
            src = lib.ASSETS / 'textures' / tex / f'{kind}.jpg'
            if not src.exists():
                continue
            img = bpy.data.images.load(str(src))
            img.colorspace_settings.name = 'Non-Color'
            w, h = img.size
            k = res / max(w, h)
            if k < 1:
                img.scale(max(1, int(w * k)), max(1, int(h * k)))
            w, h = img.size
            # through a fresh RGBA image: Blender won't write single-channel sources as WebP
            px = np.zeros(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            out = bpy.data.images.new(f'_tex_{tex}_{kind}', w, h, alpha=False)
            out.colorspace_settings.name = 'Non-Color'
            out.pixels.foreach_set(px)
            name = f'{tex}_{kind}.webp'
            out.file_format = 'WEBP'
            out.save(filepath=str(d / name), quality=86)
            bpy.data.images.remove(img)
            bpy.data.images.remove(out)
            files[tex][kind] = f'tex/{name}'
    return files


def strip_own_textures():
    """The game rebuilds the room's own materials from the manifest; keep only
    a plain colour in the glb so its textures aren't shipped twice."""
    for m in bpy.data.materials:
        if 'params' not in m:
            continue
        p = m['params']
        nt = m.node_tree
        keep = {'Principled BSDF', 'Material Output'}
        for n in list(nt.nodes):
            if n.name not in keep:
                nt.nodes.remove(n)
        b = nt.nodes['Principled BSDF']
        tint = p['tint'] if p['tint'] else p['color']
        b.inputs['Base Color'].default_value = (*tint, 1)


BIG_PROPS = ('bookcase', 'books', 'chair_window', 'desk')


def slim_models():
    """Thin out what the Poly Haven models would cost: dense meshes are decimated,
    small props get 512px textures."""
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.get('imported') and len(o.data.vertices) > 12000:
            mod = o.modifiers.new('decimate', 'DECIMATE')
            mod.ratio = max(0.15, 12000 / len(o.data.vertices))
            lib.apply_modifiers(o)
    small = set()
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.get('imported') or o.name.startswith(BIG_PROPS):
            continue
        for slot in o.material_slots:
            if slot.material:
                for n in slot.material.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        small.add(n.image)
    for img in small:
        w, h = img.size
        if max(w, h) > 512:
            img.scale(w * 512 // max(w, h), h * 512 // max(w, h))


def export(manifest, vscales, textures):
    OUT.mkdir(parents=True, exist_ok=True)
    strip_own_textures()
    bpy.ops.object.select_all(action='DESELECT')
    for c in (lib.coll_bake(), lib.coll_live()):
        for o in c.all_objects:
            o.select_set(True)
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and o.name.startswith('anchor_'):
            o.select_set(True)
    for o in list(lib.coll_live().all_objects):
        o['live'] = True
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / 'room.glb'), export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_texcoords=True, export_normals=True, export_extras=True,
        export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=80, export_vertex_color='ACTIVE',
        export_all_vertex_colors=True, export_cameras=False, export_lights=False, export_animations=False,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=18, export_draco_color_quantization=10,
    )
    mats_out = {}
    for m in bpy.data.materials:
        if 'params' in m:
            mats_out[m.name] = m['params'].to_dict() if hasattr(m['params'], 'to_dict') else dict(m['params'])
    (OUT / 'room.json').write_text(json.dumps({'lightmaps': manifest, 'vertex': vscales, 'textures': textures,
                                               'materials': mats_out}, indent=1))
    print('[export] room.glb', (OUT / 'room.glb').stat().st_size // 1024, 'KB')


# ------------------------------------------------------------------ preview renders

def preview(names, samples, ev=0.0):
    PREVIEW.mkdir(exist_ok=True)
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.view_settings.exposure = ev
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens_unit = 'FOV'
    cam = bpy.data.objects.new('cam', cam_d)
    bpy.context.scene.collection.objects.link(cam)
    sc.camera = cam
    for o in lib.coll_occ().all_objects:
        o.hide_render = False
    from mathutils import Vector
    for n in names:
        pos, look = STATIONS[n]
        p = lib.bl(*pos)
        t = lib.bl(*look)
        cam.location = p
        cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler()
        # the game's camera is 52 degrees vertical
        cam_d.sensor_fit = 'VERTICAL'
        cam_d.angle_y = math.radians(52)
        sc.render.filepath = str(PREVIEW / f'{n}.png')
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'[preview] {n} {time.time() - t0:.1f}s')


def main():
    o = args()
    t0 = time.time()
    reset()
    derive.clean_plaster()
    M = mats.library()
    room.build(M)
    furniture.build(M)
    info = props.build(M)
    desk_top, desk_cx, desk_z = info['desk_top']
    furniture.tape_recorder(M, desk_top, desk_cx + 0.04, desk_z - 0.08, -math.pi / 2)
    slim_models()
    texture_uvs()
    lights()
    set_channel('all')
    print(f'[build] scene ready in {time.time() - t0:.1f}s, {len(bpy.data.objects)} objects')
    if o['preview']:
        preview(o['preview'], o['pres'], o['ev'])
    manifest, vscales = {}, {}
    if o['bake']:
        res, vscales = bake(o)
        manifest = save_lightmaps(res)
    if o['export']:
        if not manifest and (OUT / 'room.json').exists():
            prev = json.loads((OUT / 'room.json').read_text())
            manifest, vscales = prev.get('lightmaps', {}), prev.get('vertex', {})
        export(manifest, vscales, export_textures())
    if o['save']:
        bpy.ops.wm.save_as_mainfile(filepath=o['save'])
    print(f'[build] done in {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
