"""Helpers for building the archive in Blender.

Everything is placed in the game's own coordinates (three.js: y up, the room
along z), so the numbers here match game/js/room.js. A three.js point (x, y, z)
is Blender (x, -z, y); the glTF exporter turns it back on export.
"""
import math
import pathlib

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE / 'assets'


def bl(x, y, z):
    return Vector((x, -z, y))


# ------------------------------------------------------------------ collections

def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


# BAKE: static, gets a lightmap. LIVE: exported, lit in real time in the game.
# OCCLUDER: only casts shadows into the bake (stands in for things the game builds itself).
def coll_bake():
    return collection('BAKE')


def coll_live():
    return collection('LIVE')


def coll_occ():
    return collection('OCCLUDER')


def link(obj, coll):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


# ------------------------------------------------------------------ meshes

def new_object(name, bm, coll, mat=None, atlas=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    if mat is not None:
        mats = mat if isinstance(mat, (list, tuple)) else [mat]
        for m in mats:
            me.materials.append(m)
    if atlas:
        obj['lm'] = atlas
    return obj


def bm_box(bm, w, h, d, center=(0, 0, 0), mat_index=0):
    """A box in three.js terms: w along x, h along y, d along z, centred."""
    cx, cy, cz = center
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res['verts']
    m = Matrix.Translation(bl(cx, cy, cz)) @ Matrix.Diagonal((w, d, h, 1.0))
    bmesh.ops.transform(bm, matrix=m, verts=verts)
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = mat_index
    return verts


def box(name, w, h, d, pos, mat, coll=None, atlas=None, bevel=0.004, rot_y=0.0):
    bm = bmesh.new()
    bm_box(bm, w, h, d)
    obj = new_object(name, bm, coll or coll_bake(), mat, atlas)
    obj.location = bl(*pos)
    obj.rotation_euler = (0, 0, rot_y)
    if bevel:
        add_bevel(obj, bevel)
    return obj


def lathe(name, profile, pos, mat, coll=None, atlas=None, segments=32, cap=True):
    """Spin a profile [(radius, y), ...] round the vertical axis."""
    bm = bmesh.new()
    rings = []
    for k in range(segments):
        a = 2 * math.pi * k / segments
        ring = [bm.verts.new((r * math.cos(a), r * math.sin(a), y)) for r, y in profile]
        rings.append(ring)
    for k in range(segments):
        r0, r1 = rings[k], rings[(k + 1) % segments]
        for i in range(len(profile) - 1):
            try:
                bm.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
            except ValueError:
                pass
    if cap:
        for idx in (0, len(profile) - 1):
            if profile[idx][0] > 1e-4:
                try:
                    f = bm.faces.new([rings[k][idx] for k in range(segments)])
                    if idx == 0:
                        f.normal_flip()
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object(name, bm, coll or coll_bake(), mat, atlas)
    obj.location = bl(*pos)
    smooth(obj)
    return obj


def extrude(name, profile, length, pos, mat, axis='x', coll=None, atlas=None, closed=True):
    """Extrude a 2D profile [(u, v), ...] along three.js x or z.

    For axis 'x' the profile is (z, y); for axis 'z' it is (x, y). The object's
    origin is at the start of the extrusion, at pos.
    """
    bm = bmesh.new()
    a, b = [], []
    for u, v in profile:
        if axis == 'x':
            a.append(bm.verts.new(bl(0, v, u)))
            b.append(bm.verts.new(bl(length, v, u)))
        else:
            a.append(bm.verts.new(bl(u, v, 0)))
            b.append(bm.verts.new(bl(u, v, length)))
    n = len(profile)
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    if closed:
        bm.faces.new(a[::-1])
        bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = new_object(name, bm, coll or coll_bake(), mat, atlas)
    obj.location = bl(*pos)
    return obj


def add_bevel(obj, width, segments=2, angle=50):
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = True
    return mod


def smooth(obj, angle=40):
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(angle))


def apply_modifiers(obj):
    if not obj.modifiers or obj.type != 'MESH':
        return
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    me.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)


def join(objs, name):
    """Join meshes into one object (keeps the first object's transform)."""
    objs = [o for o in objs if o and o.type == 'MESH']
    if not objs:
        return None
    for o in objs:
        apply_modifiers(o)
    ctx = {'active_object': objs[0], 'selected_editable_objects': objs, 'selected_objects': objs}
    with bpy.context.temp_override(**ctx):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def parent_keep(child, parent):
    # matrix_world is stale until the view layer updates
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = mw


def empty(name, pos, coll=None, rot_y=0.0):
    e = bpy.data.objects.new(name, None)
    (coll or coll_bake()).objects.link(e)
    e.location = bl(*pos)
    e.rotation_euler = (0, 0, rot_y)
    e.empty_display_size = 0.1
    return e


# ------------------------------------------------------------------ UVs

def box_uv(obj, tile=1.0, layer='UVMap', grain='long'):
    """Texture coordinates by box projection in world metres, divided by tile size.

    grain='long' turns each face so that u runs along its longer side, which keeps
    wood grain running the length of every board.
    """
    me = obj.data
    if layer not in me.uv_layers:
        me.uv_layers.new(name=layer)
    if callable(tile):
        tiles = tile
    else:
        t = tile if isinstance(tile, (tuple, list)) else (tile, tile)
        tiles = lambda i: t
    mw = obj.matrix_world
    nm = mw.to_3x3()
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv[layer]
    for f in bm.faces:
        n = (nm @ f.normal).normalized()
        ax = max(range(3), key=lambda i: abs(n[i]))
        others = [i for i in range(3) if i != ax]
        pts = [mw @ l.vert.co for l in f.loops]
        if grain == 'long':
            ext = [max(p[i] for p in pts) - min(p[i] for p in pts) for i in others]
            if ext[1] > ext[0]:
                others = others[::-1]
        elif grain == 'vertical' and ax != 2:
            # u along the world vertical (Blender z)
            others = [2, others[0]]
        tu, tv = tiles(f.material_index)
        for l, p in zip(f.loops, pts):
            l[uv].uv = (p[others[0]] / tu, p[others[1]] / tv)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers.active = me.uv_layers[layer]
    me.uv_layers[layer].active_render = True


def ensure_uv(obj, layer='UVMap'):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name=layer)
    elif layer not in me.uv_layers:
        me.uv_layers[0].name = layer


# ------------------------------------------------------------------ materials

_mats = {}


def _img(path, colorspace):
    key = str(path)
    img = bpy.data.images.get(key)
    if img is None:
        img = bpy.data.images.load(key, check_existing=True)
        img.name = key
    img.colorspace_settings.name = colorspace
    return img


def pbr(name, tex=None, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, tint=None, normal=1.0,
        rough_scale=1.0, emission=None, emission_strength=0.0, alpha=1.0, params=None):
    """A Principled material, optionally from a texture set in assets/textures/<tex>/.

    The game rebuilds materials from the manifest written at export (tint, roughness
    and so on live in params), so the node tree only has to be right for the bake
    and readable by the glTF exporter.
    """
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes.get('Principled BSDF') or nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
    if tex:
        d = ASSETS / 'textures' / tex
        tc = nodes.new('ShaderNodeTexCoord')
        uvn = nodes.new('ShaderNodeUVMap')
        uvn.uv_map = 'UVMap'
        diff = nodes.new('ShaderNodeTexImage')
        diff.image = _img(d / 'diff.jpg', 'sRGB')
        links.new(uvn.outputs['UV'], diff.inputs['Vector'])
        if tint:
            mix = nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            links.new(diff.outputs['Color'], mix.inputs['A'])
            mix.inputs['B'].default_value = (*tint, 1)
            links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        else:
            links.new(diff.outputs['Color'], bsdf.inputs['Base Color'])
        if (d / 'rough.jpg').exists():
            r = nodes.new('ShaderNodeTexImage')
            r.image = _img(d / 'rough.jpg', 'Non-Color')
            links.new(uvn.outputs['UV'], r.inputs['Vector'])
            if rough_scale != 1.0:
                mm = nodes.new('ShaderNodeMath')
                mm.operation = 'MULTIPLY'
                mm.inputs[1].default_value = rough_scale
                links.new(r.outputs['Color'], mm.inputs[0])
                links.new(mm.outputs[0], bsdf.inputs['Roughness'])
            else:
                links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
        if (d / 'nor.jpg').exists() and normal > 0:
            nimg = nodes.new('ShaderNodeTexImage')
            nimg.image = _img(d / 'nor.jpg', 'Non-Color')
            links.new(uvn.outputs['UV'], nimg.inputs['Vector'])
            nmap = nodes.new('ShaderNodeNormalMap')
            nmap.uv_map = 'UVMap'
            nmap.inputs['Strength'].default_value = normal
            links.new(nimg.outputs['Color'], nmap.inputs['Color'])
            links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    m['params'] = dict(params or {}, tex=tex or '', color=list(color), rough=rough, metal=metal,
                       tint=list(tint) if tint else None, normal=normal, rough_scale=rough_scale,
                       emission=list(emission) if emission else None, emission_strength=emission_strength,
                       alpha=alpha)
    _mats[name] = m
    return m


class Frame:
    """Build in a local frame (x across, y up, z towards the viewer) placed at a
    three.js origin and turned about y, so furniture on any wall reads the same."""

    def __init__(self, origin, ry=0.0):
        self.origin = origin
        self.ry = ry

    def at(self, local):
        x, y, z = local
        c, s = math.cos(self.ry), math.sin(self.ry)
        return (self.origin[0] + x * c + z * s, self.origin[1] + y, self.origin[2] - x * s + z * c)

    def box(self, name, w, h, d, local, mat, coll=None, atlas=None, bevel=0.004, ry=0.0):
        return box(name, w, h, d, self.at(local), mat, coll=coll, atlas=atlas, bevel=bevel, rot_y=self.ry + ry)

    def lathe(self, name, profile, local, mat, coll=None, atlas=None, segments=32, cap=True):
        return lathe(name, profile, self.at(local), mat, coll=coll, atlas=atlas, segments=segments, cap=cap)
