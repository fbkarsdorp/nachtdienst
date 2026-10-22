"""Derived table 2: one vector per story in S.

    python3 pipeline/t2_embeddings.py   ->  data/derived/embeddings.jsonl

The dump already holds bge-m3 embeddings (a local model, run once, stored as
float16 x 1024). These are projected to EMBED_DIM dimensions with a fixed very
sparse random projection (Li, Hastie & Church 2006), which keeps cosine distances
close while letting the generators run in pure Python, then normalised.
"""
import math
import random
import sqlite3
import struct

from common import DB, read_jsonl, sample, unit, write_jsonl
from config import EMBED_DIM

SRC_DIM = 1024


def projection(seed=1994):
    rng = random.Random(seed)
    s = int(math.sqrt(SRC_DIM))  # density 1/s
    cols = []
    for _ in range(EMBED_DIM):
        cols.append([(i, rng.choice((-1.0, 1.0))) for i in range(SRC_DIM) if rng.random() < 1 / s])
    return cols


def main():
    ids = {r["n"] for r in read_jsonl("spooky.jsonl")}
    db = sqlite3.connect(DB)
    P = projection()
    out = []
    fmt = f"<{SRC_DIM}e"
    for n, blob in db.execute("select n, vec from embeddings where model = 'bge-m3'"):
        if n not in ids or len(blob) != SRC_DIM * 2:
            continue
        v = struct.unpack(fmt, blob)
        p = unit([sum(v[i] * w for i, w in col) for col in P])
        out.append({"n": n, "v": [round(x, 4) for x in p]})
    k = write_jsonl("embeddings.jsonl", out)
    print(f"embeddings.jsonl: {k} of {len(ids)} stories in S have a vector")
    sample([{"n": r["n"], "v": r["v"][:6]} for r in out])


if __name__ == "__main__":
    main()
