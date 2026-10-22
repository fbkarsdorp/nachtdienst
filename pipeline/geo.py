"""Geography for the wall map and the gazetteer.

Inputs (see fetch_geo.sh):
  data/geo/geonames_NL.txt                         GeoNames dump for NL
  data/geo/ne/*.geojson                            Natural Earth 10m layers

Outputs:
  game/data/map.json     provinces, neighbours, water, rivers (lon/lat, simplified)
  game/data/places.json  populated places [name, lat, lon, province, population]
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, "data", "geo")
OUT = os.path.join(ROOT, "game", "data")

BBOX = (3.0, 50.6, 7.6, 53.75)  # lon0, lat0, lon1, lat1

PROVINCE_ABBR = {
    "01": ("Drenthe", "Dr."), "02": ("Friesland", "Fr."), "03": ("Gelderland", "Gld."),
    "04": ("Groningen", "Gr."), "05": ("Limburg", "L."), "06": ("Noord-Brabant", "N.-Br."),
    "07": ("Noord-Holland", "N.-H."), "09": ("Utrecht", "Utr."), "10": ("Zeeland", "Zl."),
    "11": ("Zuid-Holland", "Z.-H."), "15": ("Overijssel", "Ov."), "16": ("Flevoland", "Fl."),
}


def rings(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return c
    if t == "MultiPolygon":
        return [r for p in c for r in p]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    return []


def in_bbox(p, pad=0.0):
    return BBOX[0] - pad < p[0] < BBOX[2] + pad and BBOX[1] - pad < p[1] < BBOX[3] + pad


def dp_simplify(pts, eps):
    """Douglas-Peucker on lon/lat with lon scaled by cos(52)."""
    if len(pts) < 3:
        return pts
    k = 0.616
    def d(p, a, b):
        ax, ay, bx, by, px, py = a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, bi = 0, -1
        for m in range(i + 1, j):
            dd = d(pts[m], pts[i], pts[j])
            if dd > best:
                best, bi = dd, m
        if best > eps and bi > 0:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, kk in zip(pts, keep) if kk]


def pack(ring, eps=0.004):
    s = dp_simplify(ring, eps)
    return [[round(p[0], 3), round(p[1], 3)] for p in s]


def load(name):
    with open(os.path.join(GEO, "ne", name + ".geojson")) as f:
        return json.load(f)


def build_map():
    out = {"bbox": BBOX, "provinces": [], "neighbours": [], "water": [], "rivers": []}
    a1 = load("ne_10m_admin_1_states_provinces")
    for f in a1["features"]:
        p = f["properties"]
        if p["adm0_a3"] != "NLD":
            continue
        rs = [r for r in rings(f["geometry"]) if any(in_bbox(q) for q in r)]
        if not rs:
            continue
        out["provinces"].append({"name": p["name"], "rings": [pack(r) for r in rs if len(r) > 3]})
    for f in a1["features"]:
        p = f["properties"]
        if p["adm0_a3"] not in ("BEL", "DEU"):
            continue
        rs = [r for r in rings(f["geometry"]) if any(in_bbox(q, 0.4) for q in r)]
        if rs:
            out["neighbours"].append({"name": p["name"], "country": p["adm0_a3"],
                                      "rings": [pack(r, 0.006) for r in rs if len(r) > 3]})
    for f in load("ne_10m_lakes")["features"]:
        rs = [r for r in rings(f["geometry"]) if any(in_bbox(q) for q in r)]
        if rs:
            out["water"].append({"name": f["properties"].get("name"), "rings": [pack(r) for r in rs]})
    seen = set()
    for layer in ("ne_10m_rivers_lake_centerlines", "ne_10m_rivers_europe"):
        for f in load(layer)["features"]:
            name = f["properties"].get("name") or ""
            for r in rings(f["geometry"]):
                if len(r) < 2 or not any(in_bbox(q) for q in r):
                    continue
                key = (name, round(r[0][0], 2), round(r[0][1], 2))
                if key in seen:
                    continue
                seen.add(key)
                out["rivers"].append({"name": name, "line": pack(r, 0.003)})
    with open(os.path.join(OUT, "map.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("map.json:", len(out["provinces"]), "provinces,", len(out["rivers"]), "river lines")


def load_places():
    """GeoNames populated places in NL: dict list with name, lat, lon, prov, pop, code."""
    places = []
    with open(os.path.join(GEO, "geonames_NL.txt"), encoding="utf-8") as f:
        for line in f:
            c = line.rstrip("\n").split("\t")
            if len(c) < 15 or c[6] != "P":
                continue
            if c[7] not in ("PPL", "PPLA", "PPLA2", "PPLC", "PPLG", "PPLX", "PPLF", "PPLL"):
                continue
            prov = PROVINCE_ABBR.get(c[10])
            if not prov:
                continue
            places.append({
                "name": c[1], "lat": float(c[4]), "lon": float(c[5]),
                "prov": prov[1], "province": prov[0], "pop": int(c[14] or 0), "code": c[7],
            })
    return places


def build_places(places):
    rows = [[p["name"], round(p["lat"], 4), round(p["lon"], 4), p["prov"], p["pop"]]
            for p in places if p["code"] != "PPLX"]
    with open(os.path.join(OUT, "places.json"), "w") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    print("places.json:", len(rows), "places")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    build_map()
    build_places(load_places())
    sys.exit(0)
