"""Derived table 5: where each story was told, and how sure that is.

    python3 pipeline/t5_geo.py   ->  data/derived/geo.jsonl

The dump has coordinates but no place names. The place is the nearest GeoNames
populated place within 4 km (villages preferred over hamlets when nearly as
close). Confidence is high only for names that occur once in the Netherlands and
lie close by; a name that several places share stays low, so P2 leaves it alone.
"""
from collections import Counter, defaultdict

import geo
from common import haversine, read_jsonl, sample, write_jsonl


def main():
    places = [p for p in geo.load_places() if p["code"] != "PPLX"]
    names = Counter(p["name"] for p in places)
    cells = defaultdict(list)
    for p in places:
        cells[(int(p["lat"] * 10), int(p["lon"] * 10))].append(p)
    out = []
    for s in read_jsonl("spooky.jsonl"):
        lat, lon = s["lat"], s["lon"]
        best, bs = None, 1e9
        ci, cj = int(lat * 10), int(lon * 10)
        for i in range(ci - 1, ci + 2):
            for j in range(cj - 1, cj + 2):
                for p in cells.get((i, j), ()):
                    d = haversine((lat, lon), (p["lat"], p["lon"]))
                    score = d - (0.6 if p["pop"] > 0 else 0)
                    if score < bs:
                        bs, best = score, p
        if not best:
            continue
        d = haversine((lat, lon), (best["lat"], best["lon"]))
        if d > 4.0:
            continue
        unique = names[best["name"]] == 1
        conf = (1.0 if d <= 2.5 else 0.92) if unique else 0.5
        out.append({"n": s["n"], "place": best["name"], "prov": best["prov"], "province": best["province"],
                    "lat": round(best["lat"], 5), "lon": round(best["lon"], 5), "km": round(d, 2), "conf": conf})
    k = write_jsonl("geo.jsonl", out)
    hi = sum(1 for r in out if r["conf"] >= 0.9)
    print(f"geo.jsonl: {k} stories placed, {hi} with confidence >= 0.9")
    sample(out)


if __name__ == "__main__":
    main()
