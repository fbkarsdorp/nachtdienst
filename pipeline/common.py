"""Shared helpers for the puzzle pipeline: paths, JSON Lines tables, text, geography.

The derived tables are JSON Lines rather than parquet: this pipeline runs on the
Python standard library alone (no pyarrow or numpy is installed here). Each table
is one file, written by one script, read by the next.
"""
import json
import math
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "spooky.sqlite")
DERIVED = os.path.join(ROOT, "data", "derived")
BUNDLES = os.path.join(ROOT, "game", "data", "bundles")


def path(name):
    return os.path.join(DERIVED, name)


def write_jsonl(name, rows):
    os.makedirs(DERIVED, exist_ok=True)
    n = 0
    with open(path(name), "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
    return n


def read_jsonl(name):
    with open(path(name), encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def sample(rows, k=10):
    """Print a short sample of a table, as each step's acceptance check asks."""
    for r in rows[:k]:
        s = json.dumps(r, ensure_ascii=False)
        print("  " + (s if len(s) < 200 else s[:197] + "..."))


# ---------------------------------------------------------------- text

def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if unicodedata.category(c) != "Mn")


ARTICLES = ("de ", "het ", "een ", "'n ", "'t ")


def normalize(s):
    """Section 6.2: NFKD, no diacritics, lower case, trimmed, single spaces, no
    leading article, no trailing punctuation. The client does exactly the same."""
    s = strip_accents(str(s)).lower().strip()
    s = re.sub(r"\s+", " ", s)
    for a in ARTICLES:
        if s.startswith(a):
            s = s[len(a):]
            break
    s = re.sub(r"[\s.,;:!?'\"()\-]+$", "", s)
    return s.strip()


def tokens(s):
    return re.findall(r"[a-z0-9]+", strip_accents(s.lower()))


def sentences(s):
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+(?=[A-Z'\"‘(])", s.strip()) if x.strip()]


def clean(s):
    s = (s or "").replace("\r", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def initials(collector):
    if not collector:
        return None
    parts = []
    for name in re.split(r";|&| en ", collector.strip("[] ")):
        name = name.strip()
        if not name:
            continue
        if "," in name:
            last, first = [x.strip() for x in name.split(",", 1)]
            name = first + " " + last
        ini = ""
        for w in name.replace(".", ". ").split():
            if w.lower() in ("de", "van", "der", "den", "ten", "ter", "het", "la", "le"):
                ini += w[0].lower() + "."
            elif w[0].isalpha():
                ini += w[0].upper() + "."
        if len(ini.replace(".", "")) > 5:
            caps = [ch for ch in ini if ch.isupper()]
            ini = caps[0] + "." + caps[-1] + "."
        parts.append(ini)
    return "/".join(parts) if parts else None


# ---------------------------------------------------------------- geography

def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def to_xy(p, ref):
    """Kilometres east and north of ref."""
    kx = 111.32 * math.cos(math.radians(ref[0]))
    return ((p[1] - ref[1]) * kx, (p[0] - ref[0]) * 110.57)


def in_triangle(p, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = sign(p, a, b), sign(p, b, c), sign(p, c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


# ---------------------------------------------------------------- vectors

def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def unit(v):
    n = math.sqrt(dot(v, v)) or 1.0
    return [x / n for x in v]


def centroid(vs):
    k = len(vs)
    return unit([sum(c) / k for c in zip(*vs)])


def cos_dist(a, b):
    return 1.0 - dot(a, b)
