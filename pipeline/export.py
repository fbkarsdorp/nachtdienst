"""The archive behind the game (NACHTDIENST_PUZZLES.md section 3h).

    python3 pipeline/export.py   ->  game/data/archive/cabinet-N.json, geo.bin, index.json

Only the spooky subset S is shipped, never the whole dump, and nothing recorded after
the night (1983). Per cabinet one chunk with every story assigned to it, in the order
a drawer would hold them (by type, then year): record, place, year, code, the summary
as it is, the original telling where there is one. geo.bin holds every geocoded story's
place as float32 (lat, lon) pairs, for the dots under the pins on the wall map.
"""
import json
import os
import struct

from common import ROOT, normalize, read_jsonl
from config import VERHALENBANK_URL, YEAR_MAX

OUT = os.path.join(ROOT, "game", "data", "archive")
STD = "Standaardnederlands"


def original(s):
    """The original telling, where it is more than the summary said again."""
    t = (s.get("text") or "").strip()
    if len(t) < 60 or normalize(t)[:80] == normalize(s["description"])[:80]:
        return None
    return t


def main():
    S = {r["n"]: r for r in read_jsonl("spooky.jsonl")}
    geo = {r["n"]: r for r in read_jsonl("geo.jsonl")}
    cab = {r["n"]: r for r in read_jsonl("cabinet_assignment.jsonl")}
    os.makedirs(OUT, exist_ok=True)
    chunks = {c: [] for c in (1, 2, 3, 4, 5)}
    points = []
    for n, s in S.items():
        if s["year"] and s["year"] > YEAR_MAX:
            continue
        g, c = geo.get(n), cab.get(n)
        if g and g.get("lat") is not None:
            points.append((g["lat"], g["lon"]))
        if not c:
            continue
        code = f"SINSAG {c['type']}" if c["type"] else (s["codes"][0] if s["codes"] else None)
        r = {"n": n, "r": s["record"], "p": g["place"] if g else None, "v": g["prov"] if g else None,
             "y": s["year"], "c": code, "d": s["description"], "i": s["initials"]}
        o = original(s)
        if o:
            r["o"] = o
            if not s["language"].startswith(STD):
                r["l"] = s["language"]
        chunks[c["cabinet"]].append((c["type"] or "~", s["year"] or 9999, r))
    counts = {}
    for cid, rows in chunks.items():
        rows.sort(key=lambda t: (t[0], t[1], t[2]["r"]))
        recs = [r for *_, r in rows]
        counts[cid] = len(recs)
        with open(os.path.join(OUT, f"cabinet-{cid}.json"), "w", encoding="utf-8") as f:
            json.dump(recs, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "geo.bin"), "wb") as f:
        for lat, lon in points:
            f.write(struct.pack("<ff", lat, lon))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"counts": counts, "total": sum(counts.values()), "points": len(points), "url": VERHALENBANK_URL}, f)
    sizes = {cid: os.path.getsize(os.path.join(OUT, f"cabinet-{cid}.json")) // 1024 for cid in chunks}
    print(f"archive: {sum(counts.values())} stories in {len(chunks)} chunks (KB: {sizes}); {len(points)} points on the map")


if __name__ == "__main__":
    main()
