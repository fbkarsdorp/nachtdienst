# python3 pipeline/sounds.py <unpacked Kenney packs dir> game/sounds
# Trim, level and encode the chosen Kenney (CC0) recordings for the game: mono, starting
# 25 ms before the sound, ending where it has died away, peak at -1 dBFS, mp3.
import array, subprocess, sys, os
S, O = sys.argv[1], sys.argv[2]
R = 44100
def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-f', 'f32le', '-ac', '1', '-ar', str(R), '-'], capture_output=True).stdout
    a = array.array('f'); a.frombytes(raw); return list(a)
def save(a, out):
    b = array.array('f', a).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(R), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '96k', out], input=b, check=True)
def prep(src, name, maxdur=None):
    a = load(os.path.join(S, src)); w = 220
    env = [max(abs(x) for x in a[i:i + w]) for i in range(0, len(a), w)]
    pk = max(env)
    on = next(i for i, e in enumerate(env) if e > pk * 0.1) * w
    end = max(i for i, e in enumerate(env) if e > pk * 0.012) * w + w
    s = max(0, on - int(0.025 * R))
    if maxdur: end = min(end, s + int(maxdur * R))
    a = a[s:end]
    n = len(a); fi = int(0.003 * R); fo = min(int(0.04 * R), n // 3)
    k = 10 ** (-1 / 20) / pk
    a = [x * k * min(1, i / fi) * min(1, (n - i) / fo) for i, x in enumerate(a)]
    save(a, os.path.join(O, name + '.mp3'))
    print(name, f'{n / R:.2f}s')
C = 'casino/Audio/'; P = 'rpg/Audio/'
for i in range(1, 9): prep(f'{C}card-slide-{i}.ogg', f'take-{i}')
for i in range(1, 5): prep(f'{C}card-place-{i}.ogg', f'place-{i}'); prep(f'{C}card-shove-{i}.ogg', f'shove-{i}')
for i in (1, 2):
    prep(f'{C}cards-pack-take-out-{i}.ogg', f'out-{i}'); prep(f'{C}cards-pack-open-{i}.ogg', f'flap-{i}'); prep(f'{C}card-fan-{i}.ogg', f'fan-{i}')
prep(P + 'bookFlip3.ogg', 'flip-1', 0.22); prep(P + 'bookFlip1.ogg', 'flip-2', 0.25); prep(P + 'bookOpen.ogg', 'flip-3')
