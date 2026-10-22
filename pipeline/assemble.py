"""Assembly: one bundle per seed (NACHTDIENST_PUZZLES.md sections 4 and 6).

    python3 pipeline/assemble.py   ->  game/data/bundles/<seed>.json and index.json

Greedy with random restarts over the validated instances, seed-determined. Every
cabinet has three drawers: a card puzzle, a misfiled card (the trail), and its room
lock. The cabinets open along a chain 1 -> a -> b -> c -> 5: the misfiled card in
cabinet 1 belongs in a, a's in b, b's in c, and c's goes through the slot of cabinet
5. Each room lock turns on one number, and that number is its cabinet's digit; the
four are different. Cabinet 1 gets the easiest instances. Word and number answers go
into the bundle only as salted sha256 hashes.
"""
import hashlib
import itertools
import json
import os
import random
from collections import Counter

from cabinets import CABINETS
from common import BUNDLES, normalize, read_jsonl
from config import BUNDLE_COUNT, BUNDLE_FIRST_SEED

import frame as FRAME
from typeindex import FAMILIES

TYPES = ("P1", "P2", "P3", "P4", "P5", "P6", "P7", "R1", "R2", "R3", "R4")
# drawer 1: a card puzzle, a different kind in each cabinet (P2, P4, P5 and P1 or P6).
# P7, the spec's filler, is left out: the game has no rack for it, and a seed that would
# need it is skipped for the next one.
FIRST = ("P2", "P4", "P5", "P1", "P6")
# in cabinet 1 the missing place lies in the middle of its three; later it need not
MIDDLE_KM = 4.5
CHAINS = [list(c) for c in itertools.permutations([2, 3, 4])]


class Fail(Exception):
    pass


def h(salt, s):
    return hashlib.sha256((salt + s).encode("utf-8")).hexdigest()


def pick(pool, pos, rng, taken_n, place_use, want=None):
    """An instance from pool for chain position pos (0 easiest .. 3 hardest) that
    shares no story with what is taken and keeps each place in at most two puzzles."""
    if want:
        pool = [p for p in pool if want(p)]
    pool = sorted(pool, key=lambda p: p["difficulty"])
    if not pool:
        raise Fail("empty pool")
    k = len(pool)
    lo, hi = int(k * pos / 4), max(int(k * (pos + 1) / 4), int(k * pos / 4) + 1)
    window = pool[lo:hi] + pool[:lo][::-1] + pool[hi:]  # its own quarter first, then the rest
    first = window[:hi - lo]
    rng.shuffle(first)
    for p in first + window[hi - lo:]:
        ns = {c["story"] for c in p["cards"] if c["story"] is not None}
        if ns & taken_n:
            continue
        places = {c["render"].get("place") for c in p["cards"] if c["render"].get("place")}
        if p["type"] == "P2":
            places.add(p["answer"]["place"])
        if any(place_use[x] >= 2 for x in places):
            continue
        taken_n |= ns
        for x in places:
            place_use[x] += 1
        return p
    raise Fail("no instance fits")


def first_types(rng, c1):
    """Drawer-1 kinds for cabinets 2-4, given cabinet 1's: preferably the other of P2/P4,
    P5, and one of P7/P1/P6, in a random order; then any other kinds, all different."""
    other = "P4" if c1 == "P2" else "P2"
    rest = ["P1", "P6"]
    rng.shuffle(rest)
    tries = []
    for x in rest:
        t = [other, "P5", x]
        rng.shuffle(t)
        tries.append(t)
    pool = [t for t in FIRST if t != c1]
    more = [list(t) for t in itertools.permutations(pool, 3)]
    rng.shuffle(more)
    return tries + more


def compose(seed, by):
    rng = random.Random(f"nachtdienst-{seed}")
    chain = rng.choice(CHAINS)
    order = [1] + chain  # play order
    pos = {cab: i for i, cab in enumerate(order)}
    nxt = {1: chain[0], chain[0]: chain[1], chain[1]: chain[2], chain[2]: 5}
    taken, places = set(), Counter()
    get = lambda t, cab, **kw: pick(by[(t, cab)], pos[cab], rng, taken, places, **kw)
    # cabinet 1: the easiest map or torn card, its misfiled card, the clock
    c1 = None
    for t in rng.sample(["P2", "P4"], 2):
        try:
            c1 = get(t, 1, want=(lambda x: x["middle_km"] <= MIDDLE_KM) if t == "P2" else None)
            break
        except Fail:
            continue
    if not c1:
        raise Fail("cabinet 1: no first drawer")
    # the clock's number: any digit alike (twos are everywhere in the stories)
    r1_digits = sorted({x["digit"] for x in by[("R1", 1)]})
    n1 = rng.choice(r1_digits)
    cabinets = {1: [c1, get("P3", 1, want=lambda x: x["dest"] == nxt[1]), get("R1", 1, want=lambda x: x["digit"] == n1)]}
    digits = {n1}
    # cabinets 2-4: a different kind of card puzzle each in drawer 1
    snap = (set(taken), Counter(places))
    for kinds in first_types(rng, c1["type"]):
        taken.clear(); taken |= snap[0]
        places.clear(); places.update(snap[1])
        try:
            got, used = {}, set(digits)
            for cab, t in zip(chain, kinds):
                r = get(f"R{cab}", cab, want=lambda x: x["digit"] not in used)
                used.add(r["digit"])
                got[cab] = [get(t, cab), get("P3", cab, want=lambda x, d=nxt[cab]: x["dest"] == d), r]
            cabinets.update(got)
            break
        except Fail:
            continue
    else:
        raise Fail("cabinets 2-4: no set of first drawers")
    # cabinet 1 must be the easiest. Scores of different kinds do not compare, so each
    # drawer counts by its rank within its own kind (0 easiest, 1 hardest).
    diff = {c: sum(d["rank"] for d in ds) / len(ds) for c, ds in cabinets.items()}
    if diff[1] >= min(diff[c] for c in chain):
        raise Fail("cabinet 1 is not the easiest")
    return chain, cabinets


def bundle_drawer(cab, j, inst, salt, story_rec, first=False, step=None):
    d = {"id": f"{cab}-{j + 1}", "type": inst["type"], "difficulty": inst["difficulty"], "rank": inst["rank"],
         "note": inst["note"], "cards": [], "hints": list(inst["hints"])}
    hide = inst["type"] == "P3" and not first
    if hide:
        # past the tutorial the misfiled card must be read: no red-pencil numbers to compare
        d["hints"] = ["Drie kaarten vertellen in wezen hetzelfde. De vierde niet.",
                      f"De vierde gaat over {inst['subject']}.", inst["hints"][2]]
        d["rank"] = round(d["rank"] + 0.3, 4)
    ids = {}
    for i, c in enumerate(inst["cards"]):
        cid = f"c{i + 1}"
        key = (c["story"], c["role"])
        ids[key] = cid
        render = dict(c["render"])
        if hide:
            render["code"] = None
            render["uncatalogued"] = True
        card = {"id": cid, "story_id": story_rec.get(c["story"]), "role": c["role"], "render": render, "home": d["id"]}
        if "geo" in c and c["role"] != "target":
            card["geo"] = c["geo"]
        d["cards"].append(card)
    a = inst["answer"]
    if a["kind"] == "word":
        d["lock"] = {"kind": "word", "salt": salt, "accepted_hashes": sorted({h(salt, normalize(x)) for x in a["accepted"]})}
        if inst["type"] == "P5":
            d["lock"]["fill"] = next(c["id"] for c in d["cards"] if c["role"] == "summary")
    elif a["kind"] == "place":
        d["lock"] = {"kind": "place", "target_geo": a["geo"], "radius_km": a["radius_km"]}
        d["on_success"] = {"fill_field": {"card": next(c["id"] for c in d["cards"] if c["role"] == "target"),
                                          "field": "place", "value": a["place"]}}
    elif a["kind"] == "card_to_cabinet":
        d["lock"] = {"kind": "card_to_cabinet", "card": ids[(a["story"], "intruder")], "cabinet": a["cabinet"]}
    elif a["kind"] == "card_match":
        d["lock"] = {"kind": "card_match", "top_card": ids[(a["top"], "top")], "bottom_card": ids[(a["bottom"], "bottom")]}
        if inst["type"] == "R4":
            d["lock"]["object"] = "typewriter"
    elif a["kind"] == "clock_hour":
        d["lock"] = {"kind": "clock_hour", "hour": a["hour"]}
    elif a["kind"] == "card_to_object":
        role = "sill" if a["object"] == "window" else "door"
        d["lock"] = {"kind": "card_to_object", "card": ids[(a["story"], role)], "object": a["object"]}
        if a["object"] == "window":
            d["lock"]["text"] = a["text"]
        else:
            d["lock"]["n"] = a["n"]
    elif a["kind"] == "number3":
        d["lock"] = {"kind": "number3", "salt": salt, "accepted_hashes": [h(salt, a["value"])]}
    elif a["kind"] == "order":
        d["lock"] = {"kind": "order", "order": [ids[(n, "card")] for n in a["order"]]}
    if inst["type"] == "P1":
        d["on_success"] = {"print_label": True}
    if inst["type"] == "P5":
        d["on_success"] = {"fill_field": {"card": d["lock"]["fill"], "field": "blank", "value": "typed"}}
    on = d.setdefault("on_success", {})
    # section 3b: what goes back into this drawer as one stack once the lock is open
    lock = d["lock"]
    if inst["type"] == "P3":
        intr = next(c for c in d["cards"] if c["id"] == lock["card"])
        intr["home"] = f"cab:{lock['cabinet']}"
        on["trail_note"] = step
        on["unlock_cabinet"] = lock["cabinet"]
    if inst["type"] in ("P4", "R4"):
        on["fuse"] = [lock["top_card"], lock["bottom_card"]]
    if inst["type"] == "R4":
        on["type_line"] = inst["on_success"]["type_line"]
    if inst["type"] == "R1":
        on["chime"] = lock["hour"]
    if inst["type"].startswith("R"):
        # the number the room lock turned on is the cabinet's digit; J.J.V. notes it on this card
        noted = {"R2": lock.get("card"), "R4": lock.get("top_card")}.get(inst["type"])
        if not noted:
            noted = next(c["id"] for c in d["cards"] if c["id"] != lock.get("card"))
        on["digit"] = {"value": inst["digit"], "card": noted}
        # on the window and the typewriter the number shows itself: the word under the stain
        stained = next((c for c in d["cards"] if c["render"].get("stain")), None)
        if stained:
            on["digit"]["word"] = stained["render"]["stain"]
            on["digit"]["stained"] = stained["id"]
    # section 3c: in every cabinet but the first, one card of drawer 1 is not in the drawer;
    # the scene puts it somewhere in the room. It is the card least needed to start: a helper
    # of a map puzzle, a younger telling of three, the last of four, the last clipped card;
    # of a torn card the half that fits (never the top half).
    if j == 0 and cab != 1:
        cards = d["cards"]
        t = inst["type"]
        if t == "P2":
            found = [c for c in cards if c["role"] == "helper"][-1]
        elif t == "P5":
            vs = [c for c in cards if c["role"] == "variant"]
            oldest = min(vs, key=lambda c: c["render"]["year"])
            found = [c for c in vs if c is not oldest and c is not cards[0]][-1]
        elif t == "P6":
            found = [c for c in cards if c["role"].startswith("clip")][-1]
        elif t == "P4":
            found = next(c for c in cards if c["id"] == lock["bottom_card"])
        else:
            found = cards[-1]
        d["found_card"] = {"card": found["id"]}
    elif j == 0:
        d["found_card"] = None
    stack = [c["id"] for c in d["cards"] if c["home"] == d["id"] and c["role"] != "distractor"]
    if inst["type"] == "R3":
        stack.remove(lock["card"])  # it went under the door
    on["stack"] = stack
    return d


def build(seed, by, story_rec):
    for attempt in range(400):
        try:
            chain, cabs = compose(f"{seed}#{attempt}" if attempt else seed, by)
            break
        except Fail:
            continue
    else:
        raise Fail(f"seed {seed}: no arrangement")
    salt = hashlib.sha256(f"salt-{seed}".encode()).hexdigest()[:16]
    out = {"seed": seed, "generated_at": FRAME.GENERATED_AT, "chain": [1] + chain + [5],
           "frame": FRAME.frame(), "cabinets": []}
    steps = {c: i for i, c in enumerate([1] + chain)}
    for cab in (1, 2, 3, 4):
        drawers = [bundle_drawer(cab, j, inst, salt, story_rec, first=cab == 1, step=steps[cab])
                   for j, inst in enumerate(cabs[cab])]
        out["cabinets"].append({"id": cab, "label": CABINETS[cab]["label"], "digit": cabs[cab][2]["digit"],
                                "drawers": drawers})
    out["cabinets"].append({"id": 5, "label": CABINETS[5]["label"], "digit": None, "drawers": []})
    return out


def write_preview(seed):
    """All twelve drawers of one bundle as flat cards (spec section 9, step 5)."""
    import html
    with open(os.path.join(BUNDLES, f"{seed}.json"), encoding="utf-8") as f:
        b = json.load(f)
    parts = ["<!doctype html><meta charset=utf-8><title>Bundle preview</title><style>",
             "body{font:14px/1.45 Georgia,serif;background:#e8e2d4;margin:20px}h2{margin:28px 0 6px}",
             ".d{background:#fff8ea;margin:0 0 16px;padding:10px 14px}.c{display:inline-block;vertical-align:top;",
             "width:290px;margin:5px;padding:7px;background:#fdfbf5;border:1px solid #ccb;font:12px 'Courier New'}",
             ".r{color:#a33}.n{font-style:italic;color:#555}</style>",
             f"<h1>Seed {seed} · chain {' → '.join(map(str, b['chain']))}</h1>"]
    for c in b["cabinets"][:4]:
        parts.append(f"<h2>Kast {c['id']} · {html.escape(c['label'])} · cijfer {c['digit']}</h2>")
        for d in c["drawers"]:
            parts.append(f"<div class=d><b>{d['id']} {d['type']}</b> (difficulty {d['difficulty']})"
                         f"<div class=n>J.J.V.: {html.escape(d['note'])}</div>")
            for card in d["cards"][:6]:
                r = card["render"]
                parts.append(f"<div class=c>[{card['role']}] {html.escape(str(r.get('place') or '——'))} · "
                             f"{r.get('year') or ''} · <span class=r>{html.escape(str(r.get('code') or ''))}</span><br>"
                             f"{html.escape(r['description'])}</div>")
            if len(d["cards"]) > 6:
                parts.append(f"<div class=c>… {len(d['cards']) - 6} more</div>")
            parts.append(f"<div>lock: <code>{html.escape(json.dumps({k: v for k, v in d['lock'].items() if k != 'accepted_hashes'}))}</code></div>")
            parts.append("<ol>" + "".join(f"<li>{html.escape(x)}</li>" for x in d["hints"]) + "</ol></div>")
    with open(os.path.join(os.path.dirname(BUNDLES), "..", "..", "data", "derived", "bundle_preview.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def main():
    inst = read_jsonl("instances.jsonl")
    story_rec = {r["n"]: r["record"] for r in read_jsonl("spooky.jsonl")}
    by = {(t, c): [] for t in TYPES for c in (1, 2, 3, 4)}
    for p in inst:
        by[(p["type"], p["cabinet"])].append(p)
    # each instance's rank within its kind, by the spec's difficulty score
    for t in TYPES:
        kind = sorted((p for p in inst if p["type"] == t), key=lambda p: p["difficulty"])
        for i, p in enumerate(kind):
            p["rank"] = round(i / max(1, len(kind) - 1), 4)
    os.makedirs(BUNDLES, exist_ok=True)
    seeds, failed = [], []
    s = BUNDLE_FIRST_SEED
    while len(seeds) < BUNDLE_COUNT and s < BUNDLE_FIRST_SEED + BUNDLE_COUNT * 3:
        try:
            b = build(s, by, story_rec)
        except Fail as e:
            failed.append(s)
            print(" ", e, "- trying the next seed")
            s += 1
            continue
        with open(os.path.join(BUNDLES, f"{s}.json"), "w", encoding="utf-8") as f:
            json.dump(b, f, ensure_ascii=False, separators=(",", ":"))
        seeds.append(s)
        s += 1
    with open(os.path.join(BUNDLES, "index.json"), "w") as f:
        json.dump({"seeds": seeds}, f)
    # what is written on the cabinets: plates and drawer headings (the same every night)
    cabs = {}
    for cid, c in CABINETS.items():
        fam = FAMILIES[c["fam"]]
        cabs[c["fam"]] = {"id": cid, "title": c["label"], "roman": fam["roman"],
                          "types": [{"code": code, "title": t} for code, t, *_ in fam["types"]]}
    with open(os.path.join(os.path.dirname(BUNDLES), "cabinets.json"), "w", encoding="utf-8") as f:
        json.dump(cabs, f, ensure_ascii=False, indent=1)
    write_preview(seeds[0])
    mix = Counter(d["type"] for sd in seeds[:1] for c in json.load(open(os.path.join(BUNDLES, f"{sd}.json")))["cabinets"]
                  for d in c["drawers"])
    print(f"bundles: {len(seeds)} written ({len(failed)} seeds skipped); first bundle's types: {dict(mix)}")


if __name__ == "__main__":
    main()
