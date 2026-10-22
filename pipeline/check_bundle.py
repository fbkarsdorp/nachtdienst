"""Re-validate bundles from the bundle alone (spec section 9, step 5).

    python3 pipeline/check_bundle.py            # every bundle in game/data/bundles
    python3 pipeline/check_bundle.py 1001       # one, verbosely

Each drawer is solved again from what the player would see (rendered card text,
pins, codes) and the result must open its lock; and every composition rule of
section 4 must hold.
"""
import hashlib
import itertools
import json
import math
import os
import sys
from collections import Counter

from common import BUNDLES, haversine, in_triangle, normalize, path, to_xy
from config import CENTROID_KM, MIDDLE_KM, R2_CARDS, R3_KNOCKS, R4_CARDS, YEAR_MAX
from entities import extract, numbers
from solvers import one_digit, solve_p1, solve_p6, solve_r1, solve_r3

with open(path("idf.json"), encoding="utf-8") as f:
    IDF = json.load(f)


def h(salt, s):
    return hashlib.sha256((salt + s).encode("utf-8")).hexdigest()


def lock_place(d):
    return normalize(d.get("on_success", {}).get("fill_field", {}).get("value", "")) or "\0"


def check_drawer(d, cab):
    errs = []
    t, lock, cards = d["type"], d["lock"], d["cards"]
    if len(d["hints"]) != 3:
        errs.append("not three hints")
    puzzle = [c for c in cards if c["role"] != "desk"]
    # what the player reads first: the original telling where the card shows it, else the summary
    front = lambda c: c["render"]["original"] if c["render"].get("front") == "original" else c["render"]["description"]
    if t == "P1":
        got = solve_p1([front(c) for c in puzzle], IDF)
        if not got or h(lock["salt"], normalize(got[1])) not in lock["accepted_hashes"]:
            errs.append(f"P1 solver finds {got}, which does not open the lock")
    elif t == "P2":
        tgt = lock["target_geo"]
        helpers = [c["geo"] for c in puzzle if c["role"] == "helper"]
        if len(helpers) != 3:
            errs.append("P2 needs three pinned helpers")
        else:
            pts = [to_xy(p, tgt) for p in helpers]
            cx, cy = sum(p[0] for p in pts) / 3, sum(p[1] for p in pts) / 3
            if not in_triangle((0, 0), *pts) and math.hypot(cx, cy) > CENTROID_KM:
                errs.append("P2 target outside the triangle and far from its middle")
            if cab == 1 and math.hypot(cx, cy) > MIDDLE_KM:
                errs.append("P2 in the tutorial: target too far from the middle of the three")
            if min(haversine(tgt, p) for p in helpers) <= lock["radius_km"]:
                errs.append("P2 a helper place lies within the pin radius")
        for c in puzzle:
            if c["role"] == "target" and (c["render"].get("place") or
                                          (c["render"].get("front") == "original" and lock_place(d) in normalize(front(c)))):
                errs.append("P2 target shows its place")
    elif t == "P3":
        intr = next((c for c in puzzle if c["id"] == lock["card"]), None)
        others = [c for c in puzzle if c is not intr]
        if not intr or len(others) != 3:
            errs.append("P3 needs one intruder among four")
        elif intr["render"]["code"] and any(o["render"]["code"] == intr["render"]["code"] for o in others):
            errs.append("P3 intruder's code is not different")
        elif not intr["render"]["code"] and cab == 1:
            errs.append("P3 in the tutorial hides its numbers")
        if lock["cabinet"] == cab:
            errs.append("P3 intruder belongs in its own cabinet")
    elif t in ("P4", "R4"):
        top = next((c for c in puzzle if c["id"] == lock["top_card"]), None)
        bottoms = [c for c in puzzle if c["render"].get("half") == "bottom"]
        true = next((c for c in bottoms if c["id"] == lock["bottom_card"]), None)
        if not top or not true or len(bottoms) != (12 if t == "P4" else R4_CARDS):
            errs.append(f"{t} needs a top half and {12 if t == 'P4' else R4_CARDS} bottom halves")
        else:
            if sum(b["render"]["code"] == top["render"]["code"] for b in bottoms) != 3:
                errs.append("P4 hint 3 lies: not exactly three halves with the number")
            kinds = ("animal", "object", "profession", "person", "building")
            ents = lambda s: {l for k in kinds for l in extract(s).get(k, {})}
            shared = ents(top["render"]["description"]) & ents(true["render"]["description"])
            if shared:
                if any(shared & ents(b["render"]["description"]) for b in bottoms if b is not true):
                    errs.append("P4 a distractor shares the telling entity")
            elif top["render"]["description"].rstrip()[-1:] in ".!?":
                errs.append("P4 no shared entity and no broken sentence")
    elif t == "P5":
        variants = [c for c in puzzle if c["role"] == "variant"]
        years = [c["render"]["year"] for c in variants]
        if len(variants) != 3 or len(set(years)) != 3:
            errs.append("P5 needs three variants with distinct years")
        else:
            oldest = min(variants, key=lambda c: c["render"]["year"])
            e = extract(front(oldest))
            ok = any(h(lock["salt"], normalize(v)) in lock["accepted_hashes"]
                     for kind in ("animal", "object", "number", "time_of_day", "colour")
                     for v, n in e.get(kind, {}).items() if n == 1)
            if not ok:
                errs.append("P5 nothing on the oldest card opens the lock")
    elif t == "P6":
        if not any(c["role"] == "inside" for c in puzzle):
            errs.append("P6 the box is empty")
        got = solve_p6([front(c) for c in puzzle if c["role"].startswith("clip")])
        if not got or h(lock["salt"], "-".join(map(str, got))) not in lock["accepted_hashes"]:
            errs.append(f"P6 solver finds {got}, which does not open the box")
    elif t == "P7":
        order = [c["id"] for c in sorted(puzzle, key=lambda c: c["render"]["year"])]
        if order != lock["order"]:
            errs.append("P7 order is not by year")
    elif t == "R1":
        if solve_r1([front(c) for c in puzzle]) != lock["hour"]:
            errs.append("R1 the cards do not all name the clock's hour")
    elif t == "R2":
        names = [normalize(c["render"]["place"] or "") for c in puzzle]
        sill = next((c for c in puzzle if c["id"] == lock["card"]), None)
        if len(puzzle) != R2_CARDS or len(set(names)) != R2_CARDS or "" in names:
            errs.append("R2 needs six cards with six different places")
        elif not sill or normalize(sill["render"]["place"]) != normalize(lock["text"]):
            errs.append("R2 the name on the glass is not the sill card's place")
        elif any(normalize(lock["text"]) in normalize(front(c)) for c in puzzle if c is not sill):
            errs.append("R2 the name on the glass occurs on another card")
    elif t == "R3":
        got = solve_r3([front(c) for c in puzzle])
        door = next((c for c in puzzle if c["id"] == lock["card"]), None)
        if not got:
            errs.append("R3 the cards do not each count one different number")
        elif lock["n"] not in R3_KNOCKS or not door or numbers(front(door)) != [lock["n"]]:
            errs.append("R3 the door card does not count the knocks")
    # section 3b: every card has a home, the stack is this drawer's own
    on = d.get("on_success", {})
    ids = {c["id"] for c in cards}
    if not set(on.get("stack", [])) <= ids or not on.get("stack"):
        errs.append("no stack, or a stack card that is not in the drawer")
    for c in cards:
        home = c.get("home")
        if home != d["id"] and not (t == "P3" and c["id"] == lock["card"] and home == f"cab:{lock['cabinet']}"):
            errs.append(f"card {c['id']} has home {home}")
        y = c["render"].get("year")
        if isinstance(y, int) and y > YEAR_MAX:
            errs.append(f"card {c['id']} recorded after {YEAR_MAX}")
    return errs


def check(b):
    errs = []
    cabs = {c["id"]: c for c in b["cabinets"]}
    chain = b["chain"]
    if chain[0] != 1 or sorted(chain[1:4]) != [2, 3, 4] or chain[4:] != [5]:
        errs.append("chain is not 1, a permutation of 2-4, then 5")
    nxt = dict(zip(chain, chain[1:]))
    firsts = []
    for cid in (1, 2, 3, 4):
        ds = cabs[cid]["drawers"]
        types = [d["type"] for d in ds]
        if len(ds) != 3 or types[1] != "P3" or types[2] != f"R{cid}" or types[0] not in ("P1", "P2", "P4", "P5", "P6"):
            errs.append(f"cabinet {cid}: drawers should be card puzzle, P3, R{cid}; got {types}")
        firsts.append(types[0])
        if ds[1]["lock"]["cabinet"] != nxt[cid]:
            errs.append(f"cabinet {cid}: misfiled card should lead to cabinet {nxt[cid]}")
        if ds[1].get("on_success", {}).get("trail_note") != chain.index(cid):
            errs.append(f"cabinet {cid}: wrong trail note")
        for d in ds:
            errs += [f"{d['id']} {e}" for e in check_drawer(d, cid)]
    # section 3c: drawer 1 of cabinets 2-4 marks a found card, never its first card nor a top half
    for cid in (1, 2, 3, 4):
        d1 = cabs[cid]["drawers"][0]
        fc = d1.get("found_card")
        if cid == 1:
            if fc:
                errs.append("cabinet 1 has a found card")
            continue
        card = next((c for c in d1["cards"] if fc and c["id"] == fc["card"]), None)
        if not card or card is d1["cards"][0] or card["role"] == "top":
            errs.append(f"cabinet {cid}: no proper found card in drawer 1")
        elif d1["type"] == "P5" and card["render"]["year"] == min(c["render"]["year"] for c in d1["cards"] if c["role"] == "variant"):
            errs.append(f"cabinet {cid}: the found card is the oldest telling")
        elif d1["type"] == "P2" and card["role"] != "helper":
            errs.append(f"cabinet {cid}: the found card of a map puzzle is not a helper")
    if len(set(firsts)) != 4:
        errs.append(f"drawer-1 kinds repeat: {firsts}")
    if firsts[0] not in ("P2", "P4"):
        errs.append("cabinet 1 does not start with a map or a torn card")
    if len(b["frame"].get("trail_notes", [])) != 4:
        errs.append("frame lacks the four trail notes")
    # each cabinet's digit is the number its room lock turns on, and the four differ
    for cid in (1, 2, 3, 4):
        r = cabs[cid]["drawers"][2]
        lock, dg = r["lock"], cabs[cid]["digit"]
        card = lambda i: next(c for c in r["cards"] if c["id"] == i)["render"]["description"]
        got = {"R1": lambda: lock["hour"], "R2": lambda: one_digit(card(lock["card"])),
               "R3": lambda: lock["n"], "R4": lambda: one_digit(card(lock["top_card"]) + " " + card(lock["bottom_card"]))}[r["type"]]()
        if got != dg or not 2 <= (dg or 0) <= 9 or r.get("on_success", {}).get("digit", {}).get("value") != dg:
            errs.append(f"cabinet {cid}: digit {dg} is not its room lock's number ({got})")
        # on the window's and typewriter's card the number is under a coffee stain
        if r["type"] in ("R2", "R4"):
            st = next((c for c in r["cards"] if c["render"].get("stain")), None)
            if not st or numbers(st["render"]["stain"]) != [dg] or st["render"]["stain"] not in st["render"]["description"]:
                errs.append(f"cabinet {cid}: the stain does not hide the digit")
            elif st["render"].get("original"):
                errs.append(f"cabinet {cid}: the stained card's back gives the number away")
            if r["type"] == "R4" and numbers(card(lock["top_card"])):
                errs.append(f"cabinet {cid}: the typed half shows a number")
    if len({cabs[c]["digit"] for c in (1, 2, 3, 4)}) != 4:
        errs.append("two cabinets share a digit")
    # disjoint stories, places in at most two puzzles
    seen, places = Counter(), Counter()
    for c in (1, 2, 3, 4):
        for d in cabs[c]["drawers"]:
            for s in {x["story_id"] for x in d["cards"] if x["story_id"]}:
                seen[s] += 1
            for p in {x["render"].get("place") for x in d["cards"] if x["render"].get("place")}:
                places[p] += 1
    if any(v > 1 for v in seen.values()):
        errs.append("a story is used in two drawers")
    if any(v > 2 for v in places.values()):
        errs.append("a place appears in more than two puzzles")
    # cabinet 1 is the easiest
    diff = {c: sum(d["rank"] for d in cabs[c]["drawers"]) / len(cabs[c]["drawers"]) for c in (1, 2, 3, 4)}
    if diff[1] > min(diff[c] for c in (2, 3, 4)):
        errs.append("cabinet 1 is not the easiest")
    return errs, diff


def main():
    files = sys.argv[1:] or [f[:-5] for f in sorted(os.listdir(BUNDLES)) if f[:-5].isdigit()]
    bad = 0
    harder = 0
    for s in files:
        with open(os.path.join(BUNDLES, f"{s}.json"), encoding="utf-8") as f:
            b = json.load(f)
        errs, diff = check(b)
        order = [diff[c] for c in b["chain"][:4]]
        harder += order[-1] == max(order)
        if errs:
            bad += 1
            print(s, errs[:4])
        elif len(files) == 1:
            print(f"seed {s}: chain {b['chain']}, difficulty along it {[round(x, 2) for x in order]}")
            for c in b["cabinets"][:4]:
                print(f"  {c['id']} {c['label']:<13} digit {c['digit']}: " +
                      ", ".join(f"{d['id']} {d['type']}" for d in c["drawers"]))
    print(f"{len(files) - bad}/{len(files)} bundles valid; the last cabinet in the chain is the hardest in {harder}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
