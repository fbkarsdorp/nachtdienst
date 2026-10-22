"""Derived table 3: legend families, the same legend in several tellings.

    python3 pipeline/t3_families.py   ->  data/derived/families.jsonl

Stories are grouped by cabinet and catalogue type, split by province (a legend
travels, but its tellings cluster), and then clustered on their embeddings
(greedy: join the nearest family whose centroid is within FAMILY_COSINE, else
start one). Families of FAMILY_MIN to FAMILY_MAX members are kept; larger ones
are split by geography.
"""
from collections import Counter, defaultdict

from common import centroid, dot, haversine, read_jsonl, sample, write_jsonl
from config import FAMILY_COSINE, FAMILY_MAX, FAMILY_MIN


def cluster(items, vec):
    fams = []  # [members, centroid]
    for s in items:
        v = vec[s["n"]]
        best, bs = None, FAMILY_COSINE
        for f in fams:
            sim = dot(v, f[1])
            if sim > bs:
                best, bs = f, sim
        if best:
            best[0].append(s)
            best[1] = centroid([vec[m["n"]] for m in best[0]])
        else:
            fams.append([[s], v])
    return [f[0] for f in fams]


def split_geo(members):
    """Split an oversized family into nearby halves until each fits."""
    if len(members) <= FAMILY_MAX:
        return [members]
    a = members[0]
    far = max(members, key=lambda m: haversine((a["lat"], a["lon"]), (m["lat"], m["lon"])))
    g1 = [m for m in members if haversine((m["lat"], m["lon"]), (a["lat"], a["lon"]))
          <= haversine((m["lat"], m["lon"]), (far["lat"], far["lon"]))]
    g2 = [m for m in members if m not in g1]
    if not g2:
        return [members[i:i + FAMILY_MAX] for i in range(0, len(members), FAMILY_MAX)]
    return split_geo(g1) + split_geo(g2)


def main():
    vec = {r["n"]: r["v"] for r in read_jsonl("embeddings.jsonl")}
    geo = {r["n"]: r for r in read_jsonl("geo.jsonl")}
    cab = {r["n"]: r for r in read_jsonl("cabinet_assignment.jsonl")}
    groups = defaultdict(list)
    for s in read_jsonl("spooky.jsonl"):
        n = s["n"]
        if n not in vec or n not in geo or n not in cab:
            continue
        g = geo[n]
        groups[(cab[n]["cabinet"], cab[n]["type"], g["province"])].append(
            {"n": n, "lat": g["lat"], "lon": g["lon"], "year": s["year"]})
    out, fid = [], 0
    for (c, t, prov), items in sorted(groups.items(), key=lambda kv: (kv[0][0], str(kv[0][1]), kv[0][2])):
        items.sort(key=lambda m: (m["year"], m["n"]))
        for fam in cluster(items, vec):
            for part in split_geo(fam):
                if len(part) < FAMILY_MIN:
                    continue
                fid += 1
                out.append({"family": f"F{fid:04d}", "cabinet": c, "type": t, "province": prov,
                            "members": [m["n"] for m in part]})
    write_jsonl("families.jsonl", out)
    sizes = Counter(len(f["members"]) for f in out)
    print(f"families.jsonl: {len(out)} families covering {sum(len(f['members']) for f in out)} stories")
    print("sizes:", " ".join(f"{k}:{v}" for k, v in sorted(sizes.items())))
    print("per cabinet:", dict(sorted(Counter(f["cabinet"] for f in out).items())))
    sample(out)


if __name__ == "__main__":
    main()
