"""Puzzle generators with validation (NACHTDIENST_PUZZLES.md sections 3 and 6.4).

    python3 pipeline/generate.py   ->  data/derived/instances.jsonl, yield report, preview.html

Reads only the six derived tables. For every puzzle type it proposes instances by
the type's generation rule, keeps those that pass its validation rule, scores their
difficulty and writes them all, with plain answers, for assemble.py (bundles hold
hashes only). P7 is generated too, but only used if a cabinet cannot be filled.
"""
import html
import itertools
import json
import math
import random
import re
from collections import Counter, defaultdict

from cabinets import CABINETS
from typeindex import FAMILIES
from common import (centroid, cos_dist, haversine, in_triangle, normalize, path, read_jsonl, sentences,
                    to_xy, tokens, write_jsonl)
from config import (BOX_SIZE, CENTROID_KM, HELPER_RADIUS_KM, IDF_FLOOR, INTRUDER_NEAREST, NUMBER_RANGE,
                    OUTLIER_MARGIN, PIN_RADIUS_KM, R2_CARDS, R2_NAME_LEN, R3_KNOCKS, R3_VALUES, R4_CARDS,
                    TEAR_MIN_WORDS, YEAR_MAX)
from entities import KIND_NL, LEMMAS, extract, number_word, numbers, surface_forms
from solvers import P1_KINDS, one_digit, slot_value, solve_p1, solve_p6, solve_r1, solve_r3

import geo as geomod

RNG = random.Random(1994)
MAX_DESC = 620  # a card shows this much description legibly


# ---------------------------------------------------------------- loading

def load():
    S = {r["n"]: r for r in read_jsonl("spooky.jsonl")}
    vec = {r["n"]: r["v"] for r in read_jsonl("embeddings.jsonl")}
    ents = {r["n"]: r["e"] for r in read_jsonl("entities.jsonl")}
    geo = {r["n"]: r for r in read_jsonl("geo.jsonl")}
    cab = {r["n"]: r for r in read_jsonl("cabinet_assignment.jsonl")}
    fams = read_jsonl("families.jsonl")
    with open(path("idf.json"), encoding="utf-8") as f:
        idf = json.load(f)
    stories = {}
    for n, s in S.items():
        if n not in geo or n not in cab:
            continue
        # tonight is in 1983: nothing recorded later is in the archive yet
        if s["year"] and s["year"] > YEAR_MAX:
            continue
        g, c = geo[n], cab[n]
        code = f"SINSAG {c['type']}" if c["type"] else (s["codes"][0] if s["codes"] else None)
        stories[n] = {
            "n": n, "record": s["record"], "desc": s["description"], "year": s["year"],
            "orig": original(s), "lang": s["language"], "url": s["url"],
            "initials": s["initials"], "code": code, "type": c["type"], "cabinet": c["cabinet"],
            "place": g["place"], "prov": g["prov"], "province": g["province"],
            "geo": (g["lat"], g["lon"]), "conf": g["conf"], "vec": vec.get(n), "e": ents.get(n, {}),
        }
    return stories, fams, idf


STD = "Standaardnederlands"
MAX_ORIG = 760  # an original telling fits the front of a card up to about this length


def original(s):
    """The original telling, if it says more than the summary and fits on a card."""
    t = (s.get("text") or "").strip()
    if len(t) < 60 or normalize(t)[:80] == normalize(s["description"])[:80]:
        return None
    if len(t) > MAX_ORIG:
        cut = t[:MAX_ORIG]
        m = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        if m < MAX_ORIG * 0.55:
            return None
        t = cut[:m + 1] + " …"
    return t


def render(s, front="description", **over):
    """What a card shows: the original telling on the front where the puzzle allows it,
    the archive's summary on the back, and the story's address in the Verhalenbank."""
    r = {"description": s["desc"], "place": s["place"], "prov": s["prov"], "year": s["year"],
         "code": s["code"], "initials": s["initials"], "url": s["url"]}
    if s.get("orig"):
        r["original"] = s["orig"]
        r["lang"] = s["lang"]
        r["front"] = front if front == "original" else "description"
    r.update(over)
    return r


def front_text(s, front):
    return s["orig"] if front == "original" and s.get("orig") else s["desc"]


def dialect_share(stories_fronts):
    """How much of what is on the fronts is dialect (it makes a drawer harder)."""
    k = [s for s, f in stories_fronts if f == "original" and s.get("orig") and not s["lang"].startswith(STD)]
    return len(k) / max(1, len(stories_fronts))


def aliases():
    out = {}
    with open(path("../../pipeline/aliases.yaml"), encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^([^#:\s][^:]*):\s*\[(.*)\]", line)
            if m:
                out[m.group(1).strip()] = [x.strip() for x in m.group(2).split(",") if x.strip()]
    return out


ALIASES = aliases()


def accepted(lemma, cards_text=()):
    """Spec 6.2: lemma, plural and variants, the alias file, and the forms on the cards."""
    acc = {lemma}
    if lemma in LEMMAS:
        acc.update(LEMMAS[lemma][1])
        for t in cards_text:
            acc.update(surface_forms(lemma, t))
    acc.update(ALIASES.get(lemma, []))
    return sorted({normalize(a) for a in acc if a})


def difficulty(space, chars, margin):
    return round(0.4 * math.log(max(space, 1)) + 0.3 * (chars / 1500) + 0.3 * (1 - max(0.0, min(1.0, margin))), 4)


def short(s):
    return len(s["desc"]) <= MAX_DESC


# ---------------------------------------------------------------- P1 het losse etiket

def gen_p1(stories, fams, idf):
    out, tried = [], 0
    for f in fams:
        if f["cabinet"] == 5:
            continue
        mem = [stories[n] for n in f["members"] if n in stories and short(stories[n])]
        if len(mem) < 4:
            continue
        combos = list(itertools.combinations(mem, 4))
        RNG.shuffle(combos)
        for four in combos[:200]:
            tried += 1
            sets = [{(k, l) for k in P1_KINDS for l in s["e"].get(k, {}) if idf.get(f"{k}:{l}", 0) > IDF_FLOOR}
                    for s in four]
            common = set.intersection(*sets)
            if len(common) != 1:
                continue
            ans = next(iter(common))
            descs = [s["desc"] for s in four]
            # the solver sees only the rendered text, and must find exactly this
            if solve_p1(descs, idf) != ans:
                continue
            kind, lemma = ans
            union = set().union(*[{(k, l) for k in P1_KINDS for l in s["e"].get(k, {})} for s in four])
            front = "original" if solve_p1([front_text(s, "original") for s in four], idf) == ans else "description"
            fronts = [front_text(s, front) for s in four]
            out.append({
                "type": "P1", "cabinet": f["cabinet"], "family": f["family"],
                "dialect": dialect_share([(s, front) for s in four]),
                "cards": [{"story": s["n"], "role": "card", "render": render(s, front)} for s in four],
                "note": "Alle vier noemen ze hetzelfde ding. Dat wordt het etiket. Niet ‘een beest’ schrijven.",
                "answer": {"kind": "word", "value": lemma, "accepted": accepted(lemma, descs + fronts)},
                "hints": [
                    "Lees de vier nog eens. Let op wat er in elk van de vier vóórkomt, niet op wat erin gebeurt.",
                    f"Het is een {KIND_NL[kind]}.",
                    f"Begint met een {lemma[0].upper()}. {len(lemma)} letters.",
                ],
                "on_success": {"label": lemma},
                "difficulty": difficulty(len(union), sum(len(d) for d in descs), 0.5),
            })
            break  # one instance per family keeps the pool varied
    return out, tried


# ---------------------------------------------------------------- P2 de kaart zonder plaats

def gazetteer_cells():
    cells = defaultdict(list)
    for p in geomod.load_places():
        if p["code"] != "PPLX":
            cells[(int(p["lat"] * 10), int(p["lon"] * 10))].append(p)
    return cells


def places_within(cells, pt, km):
    n = 0
    ci, cj = int(pt[0] * 10), int(pt[1] * 10)
    for i in range(ci - 3, ci + 4):
        for j in range(cj - 5, cj + 6):
            for p in cells.get((i, j), ()):
                if haversine(pt, (p["lat"], p["lon"])) <= km:
                    n += 1
    return n


def gen_p2(stories, fams, cells):
    out, tried = [], 0
    for f in fams:
        if f["cabinet"] == 5:
            continue
        mem = [stories[n] for n in f["members"] if n in stories and stories[n]["conf"] >= 0.9 and short(stories[n])]
        if len(mem) < 4:
            continue
        found = 0
        for t in mem:
            near = [h for h in mem if h is not t and h["place"] != t["place"]
                    and haversine(t["geo"], h["geo"]) <= HELPER_RADIUS_KM]
            for trio in itertools.combinations(near, 3):
                tried += 1
                if len({t["place"], *(h["place"] for h in trio)}) != 4:
                    continue
                # no place on a card may be within the pin radius: clicking it must not count
                dmin = min(haversine(t["geo"], h["geo"]) for h in trio)
                if dmin <= PIN_RADIUS_KM:
                    continue
                pts = [to_xy(h["geo"], t["geo"]) for h in trio]
                cx, cy = sum(p[0] for p in pts) / 3, sum(p[1] for p in pts) / 3
                inside = in_triangle((0, 0), *pts)
                if not inside and math.hypot(cx, cy) > CENTROID_KM:
                    continue
                nearest = min(trio, key=lambda h: haversine(t["geo"], h["geo"]))
                walk = max(1, math.ceil(haversine(t["geo"], nearest["geo"]) / 5))
                # an original that names its own place would give the game away
                tf = "original" if t.get("orig") and normalize(t["place"]) not in normalize(t["orig"]) else "description"
                cards = [{"story": t["n"], "role": "target", "render": render(t, tf, place=None), "geo": t["geo"]}]
                cards += [{"story": h["n"], "role": "helper", "render": render(h, "original"), "geo": h["geo"]} for h in trio]
                middle = math.hypot(cx, cy)
                out.append({
                    "type": "P2", "cabinet": f["cabinet"], "family": f["family"], "cards": cards,
                    "middle_km": round(middle, 2), "dialect": dialect_share([(x, "original") for x in [t, *trio]]),
                    "note": "Zonder plaats. Ergens tussen de andere drie. Prik hem op de kaart.",
                    "answer": {"kind": "place", "geo": t["geo"], "place": t["place"], "radius_km": PIN_RADIUS_KM},
                    "hints": [
                        "Drie plaatsen staan er al. De vierde ligt daartussen.",
                        f"Binnen {'een uur' if walk == 1 else f'{walk} uur'} lopen van {nearest['place']}.",
                        f"Zoek {t['place']} op de kaart.",
                    ],
                    "on_success": {"fill_field": {"field": "place", "value": t["place"]}},
                    # off the middle is harder than in it
                    "difficulty": round(difficulty(places_within(cells, t["geo"], HELPER_RADIUS_KM),
                                                   sum(len(c["render"]["description"]) for c in cards),
                                                   (dmin - PIN_RADIUS_KM) / 10) + 0.06 * middle, 4),
                })
                found += 1
                break
            if found >= 3:
                break
    return out, tried


# ---------------------------------------------------------------- P3 de verdwaalde kaart

def gen_p3(stories, fams):
    by_cab = defaultdict(list)
    for s in stories.values():
        if s["vec"] and s["code"] and s["type"] and short(s):
            by_cab[s["cabinet"]].append(s)
    out, tried = [], 0
    per_cab = Counter()
    fams = fams[:]
    RNG.shuffle(fams)
    for f in fams:
        c = f["cabinet"]
        if c == 5 or per_cab[c] >= 90:
            continue
        mem = [stories[n] for n in f["members"] if n in stories and stories[n]["vec"] and stories[n]["code"]
               and short(stories[n])]
        if len(mem) < 3:
            continue
        trio = RNG.sample(mem, 3)
        cen = centroid([s["vec"] for s in trio])
        dmax = max(cos_dist(s["vec"], cen) for s in trio)
        trio_types = {s["type"] for s in trio}
        # the last step of the trail leads to cabinet 5, through the slot in its front
        for dest in (1, 2, 3, 4, 5):
            if dest == c:
                continue
            tried += 1
            near = sorted(by_cab[dest], key=lambda s: cos_dist(s["vec"], cen))[:INTRUDER_NEAREST]
            for s in near:
                d = cos_dist(s["vec"], cen)
                # two honest routes: the red-pencil number differs, and the reading does
                if s["type"] in trio_types or d < dmax + OUTLIER_MARGIN:
                    continue
                cards = [{"story": m["n"], "role": "member", "render": render(m, "original")} for m in trio]
                cards.insert(RNG.randrange(4), {"story": s["n"], "role": "intruder", "render": render(s, "original")})
                label = CABINETS[dest]["label"]
                label = label[3:] if label.startswith("De ") else label
                others = trio
                if all(m["place"] != s["place"] for m in others):
                    which = f"De kaart over {s['place']}"
                elif all(m["year"] != s["year"] for m in others):
                    which = f"De kaart van {s['year']}"
                else:
                    which = f"De kaart met {s['code']}"
                out.append({
                    "type": "P3", "cabinet": c, "family": f["family"], "dest": dest, "cards": cards,
                    "subject": FAMILIES[CABINETS[dest]["fam"]]["outsider_word"],
                    "dialect": dialect_share([(x, "original") for x in [*trio, s]]),
                    "note": "Eén hoort hier niet. Terug naar zijn eigen kast.",
                    "answer": {"kind": "card_to_cabinet", "story": s["n"], "cabinet": dest},
                    "hints": [
                        "Kijk naar de nummers in rood potlood.",
                        "Drie kaarten vertellen in wezen hetzelfde. De vierde niet.",
                        f"{which} hoort bij de {label}.",
                    ],
                    "on_success": {"return_to_cabinet": dest},
                    "difficulty": difficulty(4, sum(len(x["render"]["description"]) for x in cards),
                                             (d - dmax - OUTLIER_MARGIN) / 0.2),
                })
                per_cab[c] += 1
                break
    return out, tried


# ---------------------------------------------------------------- P4 de gescheurde kaart

ENTITY_KINDS = ("animal", "object", "profession", "person", "building")


def tear(desc):
    """Split at the sentence boundary nearest 35%; None if there is no such boundary."""
    sents = sentences(desc)
    if len(sents) < 2:
        return None
    total, acc, best = len(desc), 0, None
    for i in range(1, len(sents)):
        acc += len(sents[i - 1]) + 1
        if best is None or abs(acc / total - 0.35) < abs(best[0] / total - 0.35):
            best = (acc, i)
    i = best[1]
    return " ".join(sents[:i]), " ".join(sents[i:])


def tear_mid(desc):
    """Fallback: tear mid-sentence near 35%, so the top half breaks off in a sentence."""
    words = desc.split()
    k = max(4, round(len(words) * 0.35))
    while k < len(words) - 4 and re.search(r"[.!?]$", words[k - 1]):
        k += 1
    return " ".join(words[:k]), " ".join(words[k:])


def ents_of(text):
    e = extract(text)
    return {l for k in ENTITY_KINDS for l in e.get(k, {})}


def torn(s, by_cab_type, box, halves=None):
    """Tear s (or take the halves given) and find box - 1 distractor bottoms in its cabinet
    (exactly two more with its number, the rest a similar one). Returns (top_card, bottoms,
    answer, hints, chars) or None."""
    c = s["cabinet"]
    given = halves is not None
    halves = halves or tear(s["desc"])
    shared = None
    if halves:
        shared = sorted(ents_of(halves[0]) & ents_of(halves[1]))
    route = "entity"
    if not shared and given:
        # given halves torn mid-sentence: the broken sentence is the clue
        if re.search(r"[.!?]\s*$", halves[0]):
            return None
        route = "sentence"
    elif not shared:
        halves, route = tear_mid(s["desc"]), "sentence"
        # a mid-sentence tear may still name the same thing twice: then that is the clue
        shared = sorted(ents_of(halves[0]) & ents_of(halves[1]))
        if shared:
            route = "entity"
    top, bottom = halves
    same = [x for x in by_cab_type[(c, s["type"])] if x is not s and len(x["desc"].split()) >= 30]
    prefix = s["type"][:2]
    similar = [x for (cc, t), xs in by_cab_type.items() if cc == c and t != s["type"] and t[:2] == prefix
               for x in xs if len(x["desc"].split()) >= 30]
    if len(similar) < box - 3:
        similar = [x for (cc, t), xs in by_cab_type.items() if cc == c and t != s["type"]
                   for x in xs if len(x["desc"].split()) >= 30]
    RNG.shuffle(same)
    RNG.shuffle(similar)
    dis = []
    for x in same + similar:
        if len([d for d in dis if d["type"] == s["type"]]) >= 2 and x["type"] == s["type"]:
            continue
        h = tear(x["desc"]) or tear_mid(x["desc"])
        # no distractor may carry the shared thing: then the match would not be unique
        if route == "entity" and set(shared) & ents_of(h[1]):
            continue
        dis.append({**x, "_bottom": h[1]})
        if len(dis) == box - 1:
            break
    if len(dis) < box - 1 or sum(d["type"] == s["type"] for d in dis) != 2:
        return None
    top_card = {"story": s["n"], "role": "top", "render": render(s, description=top, half="top")}
    # a torn card is torn summary: no original behind it
    for k in ("original", "lang", "front"):
        top_card["render"].pop(k, None)
    bottoms = [{"story": s["n"], "role": "bottom", "render": {"description": bottom, "half": "bottom", "code": s["code"]}}]
    bottoms += [{"story": d["n"], "role": "distractor", "render": {"description": d["_bottom"], "half": "bottom", "code": d["code"]}}
                for d in dis]
    RNG.shuffle(bottoms)
    cue = shared[0] if shared else None
    answer = {"kind": "card_match", "top": s["n"], "bottom": s["n"], "route": route, "shared": shared}
    hints = [
        "Lees het bovenste stuk tot het laatste woord. Wat wordt er al genoemd?",
        f"Het onderste stuk noemt ‘{cue}’ opnieuw." if cue
        else "Het bovenste stuk breekt midden in een zin af. Het onderste maakt hem af.",
        f"Het nummer is {s['code']}. Er zijn er drie met dat nummer in de doos.",
    ]
    return top_card, bottoms, answer, hints, len(s["desc"]) + sum(len(d["_bottom"]) for d in dis)


def tearable(stories, cabinets):
    by_cab_type = defaultdict(list)
    for s in stories.values():
        if s["type"] and s["cabinet"] in cabinets:
            by_cab_type[(s["cabinet"], s["type"])].append(s)
    cands = [s for s in stories.values() if s["type"] and s["cabinet"] in cabinets
             and len(s["desc"].split()) >= TEAR_MIN_WORDS and len(s["desc"]) <= 900]
    RNG.shuffle(cands)
    return by_cab_type, cands


def gen_p4(stories):
    by_cab_type, cands = tearable(stories, (1, 2, 3, 4))
    out, tried = [], 0
    per_cab = Counter()
    for s in cands:
        c = s["cabinet"]
        if per_cab[c] >= 60:
            continue
        tried += 1
        got = torn(s, by_cab_type, BOX_SIZE)
        if not got:
            continue
        top_card, bottoms, answer, hints, chars = got
        out.append({
            "type": "P4", "cabinet": c, "cards": [top_card] + bottoms, "dialect": 0,
            "note": "Doorgescheurd. De rest ligt in de doos op tafel.",
            "answer": answer, "hints": hints, "on_success": {"join": True},
            "difficulty": difficulty(BOX_SIZE, chars, 0.5),
        })
        per_cab[c] += 1
    return out, tried


# ---------------------------------------------------------------- P5 de oudste verteller

SLOT_KINDS = ("animal", "object", "number", "time_of_day", "colour")
P5_SIMILAR = 0.6
WHICH = {"animal": "Welk?", "object": "Welk?", "number": "Welk?", "time_of_day": "Welk?", "colour": "Welke?"}
SLOT_SUMMARY = {
    "animal": "een dier gezien", "object": "een voorwerp gezien", "number": "een getal genoemd",
    "time_of_day": "een tijdstip genoemd", "colour": "een kleur gezien",
}
NUM_WORD = {v: k for k, v in {"een": 1, "twee": 2, "drie": 3, "vier": 4, "vijf": 5, "zes": 6, "zeven": 7, "acht": 8,
                              "negen": 9, "tien": 10, "elf": 11, "twaalf": 12}.items()}


def gen_p5(stories, fams):
    out, tried = [], 0
    # the thin cabinets also get legend groups by catalogue type across provinces
    groups = [f for f in fams if f["cabinet"] != 5]
    by_type = defaultdict(list)
    for s in stories.values():
        if s["cabinet"] in (2, 3) and s["type"] and short(s):
            by_type[(s["cabinet"], s["type"])].append(s["n"])
    groups += [{"family": f"T{c}-{t}", "cabinet": c, "members": m} for (c, t), m in by_type.items() if len(m) >= 3]
    for f in groups:
        mem = [stories[n] for n in f["members"] if n in stories and short(stories[n])]
        if len(mem) < 3:
            continue
        found, used = 0, set()
        combos = list(itertools.combinations(mem, 3))
        RNG.shuffle(combos)
        for trio in combos[:4000]:
            if found >= 3:
                break
            if used & {s["n"] for s in trio}:
                continue
            done = False
            years = [s["year"] for s in trio]
            if len(set(years)) != 3:
                continue
            # three accounts of the same event: close together in meaning, not just in catalogue
            if any(not s["vec"] for s in trio) or min(1 - cos_dist(a["vec"], b["vec"])
                                                     for a, b in itertools.combinations(trio, 2)) < P5_SIMILAR:
                continue
            tried += 1
            oldest = min(trio, key=lambda s: s["year"])
            for kind in SLOT_KINDS:
                # the oldest names exactly one, once; the others name the slot too, and never the same thing
                v = slot_value(oldest["desc"], kind)
                if not v:
                    continue
                sets = [set(extract(s["desc"]).get(kind, {})) for s in trio]
                if any(not x for x in sets) or any(a & b for a, b in itertools.combinations(sets, 2)):
                    continue
                if kind == "number":
                    acc = sorted({normalize(v), normalize(NUM_WORD.get(int(v), v))})
                    kind_nl = "getal"
                else:
                    acc = accepted(v, [oldest["desc"]])
                    kind_nl = KIND_NL[kind]
                # the originals on the front only if they disagree in just the same way
                front = "description"
                if all(x.get("orig") for x in trio) and slot_value(oldest["orig"], kind) == v:
                    osets = [set(extract(x["orig"]).get(kind, {})) for x in trio]
                    if all(osets) and not any(a & b for a, b in itertools.combinations(osets, 2)):
                        front = "original"
                        if kind != "number":
                            acc = sorted(set(acc) | set(accepted(v, [oldest["orig"]])))
                # no year on the summary: the three disagree, and only the oldest counts
                summary = f"In {oldest['province']} werd {SLOT_SUMMARY[kind]}: ____. (volgens de oudste opname)"
                cards = [{"story": s["n"], "role": "variant", "render": render(s, front)} for s in trio]
                cards.append({"story": None, "role": "summary",
                              "render": {"description": summary, "place": None, "year": None, "code": None,
                                         "initials": "J.J.V.", "summary": True}})
                out.append({
                    "type": "P5", "cabinet": f["cabinet"], "family": f["family"], "cards": cards,
                    "dialect": dialect_share([(x, front) for x in trio]),
                    "note": "De vertellers spreken elkaar tegen. Houd de oudste aan.",
                    "answer": {"kind": "word", "value": v, "accepted": acc, "slot": kind},
                    "hints": ["Kijk naar de jaartallen.", f"De oudste is uit {oldest['year']}.",
                              f"Op die kaart staat een {kind_nl}. {WHICH[kind]}"],
                    "on_success": {"fill_field": {"card": "summary", "field": "blank", "value": v}},
                    "difficulty": difficulty(3, sum(len(s["desc"]) for s in trio), 0.5),
                })
                done = True
                break
            if done:
                found += 1
                used |= {s["n"] for s in trio}
    return out, tried


# ---------------------------------------------------------------- P6 de cijfers

def gen_p6(stories):
    lo, hi = NUMBER_RANGE
    # what J.J.V. kept locked in the box: one more story from the same cabinet
    keep = defaultdict(list)
    for s in stories.values():
        if s["cabinet"] in (1, 2, 3, 4) and 140 <= len(s["desc"]) <= 420 and s["code"]:
            keep[s["cabinet"]].append(s)
    by_cab = defaultdict(list)
    for s in stories.values():
        if s["cabinet"] not in (1, 2, 3, 4) or not short(s):
            continue
        nums = numbers(s["desc"])
        if len(nums) == 1 and lo <= nums[0] <= hi:
            by_cab[s["cabinet"]].append(s)
    out, tried = [], 0
    for c, pool in by_cab.items():
        for _ in range(40):
            if len(pool) < 3:
                break
            tried += 1
            three = RNG.sample(pool, 3)
            got = solve_p6([s["desc"] for s in three])
            if not got or len(set(got)) == 1:
                continue
            combo = "-".join(str(x) for x in got)
            front = "original" if solve_p6([front_text(s, "original") for s in three]) == got else "description"
            inside = RNG.choice([k for k in keep[c] if k not in three])
            out.append({
                "type": "P6", "cabinet": c,
                "dialect": dialect_share([(s, front) for s in three]),
                "cards": [{"story": s["n"], "role": f"clip{i + 1}", "render": render(s, front)} for i, s in enumerate(three)]
                + [{"story": inside["n"], "role": "inside", "render": render(inside, "original", note="Deze bewaar ik apart.")}],
                "note": "Elk verhaal één getal. In deze volgorde.",
                "answer": {"kind": "number3", "value": combo},
                "hints": ["Elk verhaal telt.", f"Het eerste getal is {got[0]}.", f"{got[0]} — {got[1]} — {got[2]}."],
                "on_success": {"open_box": True},
                "difficulty": difficulty(1728, sum(len(s["desc"]) for s in three), 0.5),
            })
    return out, tried


# ---------------------------------------------------------------- room locks (section 3a)
# Each room lock turns on one number, 1-9, and that number is its cabinet's digit for the
# dial of cabinet 5: the hour the clock is set to, the one number on the window's card,
# the knocks at the door, the one number on the card the typewriter completes.

def room_text(s):
    """Room-lock cards show the archive's summary: the lock is read off it."""
    return s["desc"]


def gen_r1(stories):
    """R1 De klok: three omens of cabinet 1 that each count one number, the same one (any
    count, not only hours); the clock is set to it."""
    by_n = defaultdict(list)
    for s in stories.values():
        if s["cabinet"] != 1 or not short(s):
            continue
        d = one_digit(room_text(s))
        if d:
            by_n[d].append(s)
    out, tried = [], 0
    for n, pool in by_n.items():
        if len(pool) < 3:
            continue
        for _ in range(min(40, 4 * len(pool))):
            tried += 1
            three = RNG.sample(pool, 3)
            if solve_r1([room_text(x) for x in three]) != n:
                continue
            out.append({
                "type": "R1", "cabinet": 1,
                "cards": [{"story": x["n"], "role": "omen", "render": render(x)} for x in three],
                "dialect": 0,
                "note": "De klok staat stil. Deze drie weten hoe laat het is.",
                "answer": {"kind": "clock_hour", "hour": n},
                "digit": n,
                "hints": ["Lees ze nog eens. Ze tellen alle drie iets.", "Drie keer hetzelfde getal. Zo laat is het.",
                          f"{n} uur. Zet de klok."],
                "on_success": {"chime": n},
                "difficulty": difficulty(9, sum(len(x["desc"]) for x in three), 0.5),
            })
    return out, tried


def gen_r2(stories):
    """R2 Het raam: six witte-wieven cards with six places; one place is written on the glass."""
    pool = [s for s in stories.values() if s["cabinet"] == 2 and short(s) and s["place"] and s["conf"] >= 0.5]
    out, tried = [], 0
    lo, hi = R2_NAME_LEN
    for _ in range(3000):
        if len(out) >= 60:
            break
        tried += 1
        six = RNG.sample(pool, R2_CARDS)
        names = [normalize(x["place"]) for x in six]
        if len(set(names)) != R2_CARDS:
            continue
        # the card on the sill gives the cabinet its digit: it names exactly one number
        fits = [x for x in six if lo <= len(x["place"].replace(" ", "")) <= hi and " " not in x["place"]
                and all(normalize(x["place"]) not in normalize(y["desc"]) for y in six if y is not x)
                and one_digit(room_text(x))]
        if not fits:
            continue
        target = RNG.choice(fits)
        dg = one_digit(room_text(target))
        # its one number is under a coffee stain (it will show on the glass); and no original
        # telling on its back, which would give the number away
        sill = render(target, stain=number_word(room_text(target), dg))
        for k in ("original", "lang", "front"):
            sill.pop(k, None)
        out.append({
            "type": "R2", "cabinet": 2,
            "cards": [{"story": x["n"], "role": "sill" if x is target else "card",
                       "render": sill if x is target else render(x)} for x in six],
            "dialect": 0,
            "note": "Er staat iets op het raam. Niet afvegen.",
            "answer": {"kind": "card_to_object", "story": target["n"], "object": "window", "text": target["place"]},
            "digit": dg,
            "hints": ["Lees het van achteren naar voren.", f"Het begint met een {target['place'][0].upper()}.",
                      f"{target['place']}. Leg die kaart op de vensterbank."],
            "on_success": {"mist_step": True},
            "difficulty": difficulty(R2_CARDS, sum(len(x["desc"]) for x in six), 0.5),
        })
    return out, tried


def gen_r3(stories):
    """R3 De deur: five werewolf cards, each with one number, all different; one is the knocks."""
    by_value = defaultdict(list)
    for s in stories.values():
        # the pool is thin (one story names twelve, and it is a little long): up to 700 characters
        if s["cabinet"] != 3 or len(s["desc"]) > 700:
            continue
        nums = numbers(room_text(s))
        if len(nums) == 1 and nums[0] in R3_VALUES:
            by_value[nums[0]].append(s)
    out, tried = [], 0
    if not all(by_value[v] for v in R3_VALUES):
        return out, tried
    for _ in range(200):
        if len(out) >= 40:
            break
        tried += 1
        five = [RNG.choice(by_value[v]) for v in R3_VALUES]
        got = solve_r3([room_text(x) for x in five])
        if not got:
            continue
        n = RNG.choice(R3_KNOCKS)
        door = five[R3_VALUES.index(n)]
        RNG.shuffle(five)
        out.append({
            "type": "R3", "cabinet": 3,
            "cards": [{"story": x["n"], "role": "door" if x is door else "card", "render": render(x)} for x in five],
            "dialect": 0,
            "note": "Als er geklopt wordt: tel. Die kaart onder de deur.",
            "answer": {"kind": "card_to_object", "story": door["n"], "object": "door", "n": n},
            "digit": n,
            "hints": ["Wacht op het kloppen. Tel het.", f"Een {'even' if n % 2 == 0 else 'oneven'} getal.", f"{n} keer. Die kaart."],
            "on_success": {"knocking_stops": True},
            "difficulty": difficulty(len(R3_VALUES), sum(len(x["desc"]) for x in five), 0.5),
        })
    return out, tried


def tear_before_number(desc):
    """Tear at the sentence boundary nearest 35% that leaves the one number in the bottom half."""
    sents = sentences(desc)
    k = next((i for i, x in enumerate(sents) if numbers(x)), None)
    if not k:
        return tear_mid_before_number(desc)
    total, acc, best = len(desc), 0, None
    for i in range(1, k + 1):
        acc += len(sents[i - 1]) + 1
        if acc / total >= 0.15 and (best is None or abs(acc / total - 0.35) < abs(best[0] / total - 0.35)):
            best = (acc, i)
    if not best:
        return tear_mid_before_number(desc)
    return " ".join(sents[:best[1]]), " ".join(sents[best[1]:])


def tear_mid_before_number(desc):
    """Tear mid-sentence, a few words before the number, so it falls in the bottom half."""
    words = desc.split()
    k = next((i for i, w in enumerate(words) if numbers(w)), None)
    if k is None:
        return None
    for cut in range(k - 1, 3, -1):
        if not re.search(r"[.!?]$", words[cut - 1]) and cut / len(words) >= 0.2:
            return " ".join(words[:cut]), " ".join(words[cut:])
    return None


def r4_hints(answer, s):
    """R4's ladder: the typed half read to its end, then what the rest names again (or that the
    machine stopped mid-sentence), then the number: three halves in the envelope carry it."""
    cue = answer["shared"][0] if answer["shared"] else None
    return [
        "Lees wat de machine getypt heeft, tot het laatste woord.",
        f"Het vervolg noemt ‘{cue}’ opnieuw." if cue else "De machine stopt midden in een zin. Het vervolg maakt hem af.",
        f"Het nummer is {s['code']}. Er zijn er maar drie in de envelop.",
    ]


def gen_r4(stories):
    """R4 De schrijfmachine: the machine types the top half of a cabinet 4 card itself;
    drawer 3 holds six bottom halves, one of them the rest. The completed card's one
    number is under a coffee stain on the bottom half; the machine types it."""
    by_cab_type, cands = tearable(stories, (4,))
    cands = [s for s in cands if one_digit(s["desc"])]
    out, tried = [], 0
    for s in cands:
        if len(out) >= 60:
            break
        tried += 1
        got = None
        for split in (tear_before_number, tear_mid_before_number):
            halves = split(s["desc"])
            if not halves or numbers(halves[0]) or not one_digit(halves[1]):
                continue
            got = torn(s, by_cab_type, R4_CARDS, halves=halves)
            if got:
                break
        if not got:
            continue
        top_card, bottoms, answer, hints, chars = got
        dg = one_digit(halves[1])
        # in this drawer the other halves are part of it, not a box of strays
        for b in bottoms:
            if b["role"] == "distractor":
                b["role"] = "half"
            if b["role"] == "bottom":
                b["render"]["stain"] = number_word(halves[1], dg)
        out.append({
            "type": "R4", "cabinet": 4, "cards": [top_card] + bottoms, "dialect": 0,
            "note": "Als de machine begint: laten uittikken. Het vervolg zit hierin.",
            "answer": answer, "hints": r4_hints(answer, s),  "digit": dg,
            "on_success": {"type_line": "Verteller: de vorige assistent."},
            "difficulty": difficulty(R4_CARDS, chars, 0.5),
        })
    return out, tried


# ---------------------------------------------------------------- P7 de volgorde

def gen_p7(stories):
    by_cab = defaultdict(list)
    for s in stories.values():
        if s["cabinet"] in (1, 2) and len(s["desc"]) <= 300:
            by_cab[s["cabinet"]].append(s)
    out = []
    for c, pool in by_cab.items():
        for _ in range(10):
            five = RNG.sample(pool, 5)
            if len({s["year"] for s in five}) != 5:
                continue
            order = [s["n"] for s in sorted(five, key=lambda s: s["year"])]
            out.append({
                "type": "P7", "cabinet": c,
                "cards": [{"story": s["n"], "role": "card", "render": render(s)} for s in five],
                "note": "Op volgorde van opname, graag.", "answer": {"kind": "order", "order": order},
                "hints": ["Kijk naar de jaartallen.", "De oudste eerst.", "Van links naar rechts: oud naar nieuw."],
                "on_success": {}, "difficulty": difficulty(120, sum(len(s["desc"]) for s in five), 0.5),
            })
    return out, 10 * len(by_cab)


# ---------------------------------------------------------------- report and preview

def preview(instances):
    """A flat HTML page: every drawer as plain cards, for eyeballing."""
    parts = ["<!doctype html><meta charset=utf-8><title>Nachtdienst puzzles</title><style>",
             "body{font:14px/1.45 Georgia,serif;background:#e8e2d4;color:#222;margin:20px}",
             ".d{background:#fff8ea;margin:0 0 22px;padding:12px 16px;box-shadow:0 1px 3px #0003}",
             ".c{display:inline-block;vertical-align:top;width:300px;margin:6px;padding:8px;background:#fdfbf5;"
             "border:1px solid #ccb;font-family:'Courier New',monospace;font-size:12px}",
             ".r{color:#a33}.n{font-style:italic;color:#555}h3{margin:0 0 4px}</style>"]
    for i, p in enumerate(instances):
        parts.append(f"<div class=d><h3>{p['type']} · kast {p['cabinet']} · difficulty {p['difficulty']}</h3>")
        parts.append(f"<div class=n>J.J.V.: {html.escape(p['note'])}</div>")
        for c in p["cards"][:6]:
            r = c["render"]
            head = f"{html.escape(str(r.get('place') or '——'))} · {r.get('year') or ''} · <span class=r>{html.escape(str(r.get('code') or ''))}</span>"
            parts.append(f"<div class=c><b>[{c['role']}]</b> {head}<br>{html.escape(r['description'])}</div>")
        if len(p["cards"]) > 6:
            parts.append(f"<div class=c>… and {len(p['cards']) - 6} more halves in the box</div>")
        parts.append(f"<div>answer: <code>{html.escape(json.dumps(p['answer'], ensure_ascii=False)[:300])}</code></div>")
        parts.append("<ol>" + "".join(f"<li>{html.escape(h)}</li>" for h in p["hints"]) + "</ol></div>")
    with open(path("preview.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


def histogram(vals, bins=8):
    if not vals:
        return ""
    lo, hi = min(vals), max(vals)
    w = (hi - lo) / bins or 1
    cnt = Counter(min(bins - 1, int((v - lo) / w)) for v in vals)
    return " ".join(f"{lo + i * w:.2f}:{cnt[i]}" for i in range(bins))


def main():
    stories, fams, idf = load()
    cells = gazetteer_cells()
    report, allp = [], []
    for name, fn in [("P1", lambda: gen_p1(stories, fams, idf)), ("P2", lambda: gen_p2(stories, fams, cells)),
                     ("P3", lambda: gen_p3(stories, fams)), ("P4", lambda: gen_p4(stories)),
                     ("P5", lambda: gen_p5(stories, fams)), ("P6", lambda: gen_p6(stories)),
                     ("P7", lambda: gen_p7(stories)), ("R1", lambda: gen_r1(stories)),
                     ("R2", lambda: gen_r2(stories)), ("R3", lambda: gen_r3(stories)),
                     ("R4", lambda: gen_r4(stories))]:
        got, tried = fn()
        allp += got
        per = Counter(p["cabinet"] for p in got)
        report.append((name, tried, len(got), dict(sorted(per.items())), histogram([p["difficulty"] for p in got])))
    for i, p in enumerate(allp):
        p["id"] = f"I{i:05d}"
        p["difficulty"] = round(p["difficulty"] + 0.5 * p.get("dialect", 0), 4)
    write_jsonl("instances.jsonl", allp)
    preview(allp)
    print(f"{'type':<5}{'proposed':>9}{'valid':>7}  per cabinet            difficulty")
    for name, tried, n, per, hist in report:
        print(f"{name:<5}{tried:>9}{n:>7}  {str(per):<22} {hist}")
    if any(p["type"] == "P1" for p in allp):
        freq = Counter(p["answer"]["value"] for p in allp if p["type"] == "P1")
        print("P1 answers:", ", ".join(f"{k} {v}" for k, v in freq.most_common(25)))
    print("instances.jsonl and preview.html in data/derived/")


if __name__ == "__main__":
    main()
