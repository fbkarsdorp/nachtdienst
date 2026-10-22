"""Texture sets made from the downloaded ones, at the start of a build.

clean_plaster: painted_plaster_wall with its stains taken out. The large dark
blotches and dark specks repeat every two metres along a wall and read as dirt;
a high-pass keeps the fine trowel grain and drops everything wider than a few
centimetres, and the darkest grain is flattened.
The blur wraps round, so the result still tiles.
"""
import bpy
import numpy as np

from lib import ASSETS

SRC = 'painted_plaster_wall'
DST = 'clean_plaster'
# blotches wider than this many pixels go (of 2048 for two metres: about 4 cm)
SIGMA = 40
# what is left of the grain's contrast in the colour, and of the bumps in the normal map
GRAIN = 0.7
BUMPS = 0.8


def _load(path):
    img = bpy.data.images.load(str(path))
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[..., :3].astype(np.float64)


def _save(arr, path):
    h, w, _ = arr.shape
    out = bpy.data.images.new('_derive', w, h, alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = np.clip(arr, 0, 1)
    out.pixels.foreach_set(px.ravel())
    out.file_format = 'JPEG'
    out.save(filepath=str(path), quality=92)
    bpy.data.images.remove(out)


def _blur(arr, sigma):
    """Gaussian blur of each channel, wrapping at the edges (in the frequency domain)."""
    h, w, _ = arr.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(arr[..., c]) * g)) for c in range(arr.shape[2])], axis=-1)


def clean_plaster():
    src, dst = ASSETS / 'textures' / SRC, ASSETS / 'textures' / DST
    if (dst / 'diff.jpg').exists() and (dst / 'diff.jpg').stat().st_mtime > (src / 'diff.jpg').stat().st_mtime:
        return
    dst.mkdir(parents=True, exist_ok=True)
    # colour: an even grey of the texture's own mean, plus its fine grain
    d = _load(src / 'diff.jpg')
    lum = d @ np.array([0.2126, 0.7152, 0.0722])
    lum = lum[..., None]
    fine = lum - _blur(lum, SIGMA)
    # and no dark specks: grain darker than usual is mostly flattened out
    t = 1.2 * float(fine.std())
    fine = np.where(fine < -t, -t + (fine + t) * 0.15, fine)
    flat = float(lum.mean()) + GRAIN * fine
    _save(np.repeat(flat, 3, axis=2), dst / 'diff.jpg')
    # normal: the same, about a flat surface
    n = _load(src / 'nor.jpg')
    n = np.array([0.5, 0.5, 1.0]) + BUMPS * (n - _blur(n, SIGMA))
    _save(n, dst / 'nor.jpg')
    # roughness: even, the grain kept
    r = _load(src / 'rough.jpg')
    _save(float(r.mean()) + (r - _blur(r, SIGMA)), dst / 'rough.jpg')
    print(f'[derive] {DST} from {SRC}')
