"""Rule-based entity extraction: the things a collector would underline.

extract(text) -> {kind: {lemma: count}} for the kinds
  object, animal, profession, building, person, number, time_of_day, colour

No NER model is installed here, so this is a gazetteer of forms per lemma (the
motif lexicon in lexicon.py, plus buildings, people, numbers, times of day and
colours). The generators store its output in entities.jsonl; the solvers call it
again on the rendered card text, never on the stored table.
"""
import re

from common import strip_accents, tokens
from lexicon import L as LEXICON

KIND_OF_CAT = {"dier": "animal", "voorwerp": "object", "persoon": "profession"}
BUILDINGS = {"kerk", "kapel", "molen", "herberg", "stal", "schuur", "kasteel", "boerderij", "brug"}
KIND_NL = {"object": "voorwerp", "animal": "dier", "profession": "beroep", "building": "gebouw",
           "person": "persoon", "number": "getal", "time_of_day": "tijdstip", "colour": "kleur"}

LEMMAS = {}  # lemma -> (kind, forms, compound)
for lemma, e in LEXICON.items():
    kind = KIND_OF_CAT.get(e["cat"])
    if lemma in BUILDINGS:
        kind = "building"
    if kind:
        LEMMAS[lemma] = (kind, [strip_accents(f) for f in e["forms"]], e["compound"])


def add(kind, lemma, forms, compound=False):
    LEMMAS[lemma] = (kind, forms, compound)


add("building", "huis", ["huis", "huizen", "huisje", "woning"])
add("building", "toren", ["toren", "torens", "kerktoren"], True)
add("building", "klooster", ["klooster", "kloosters"])
add("building", "school", ["school", "scholen"])
add("building", "hut", ["hut", "hutje", "hutten"])
add("profession", "boer", ["boer", "boeren", "boerin"])
add("profession", "bakker", ["bakker", "bakkers"])
add("profession", "slager", ["slager", "slagers"])
add("profession", "wever", ["wever", "wevers"])
add("profession", "veerman", ["veerman", "veerlui"])
add("profession", "notaris", ["notaris"])
add("profession", "burgemeester", ["burgemeester"])
add("profession", "smokkelaar", ["smokkelaar", "smokkelaars"])
add("person", "vrouw", ["vrouw", "vrouwen", "vrouwtje"])
add("person", "man", ["man", "mannen", "mannetje"])
add("person", "kind", ["kind", "kinderen", "kindje"])
add("person", "meisje", ["meisje", "meisjes"])
add("person", "jongen", ["jongen", "jongens"])
add("time_of_day", "middernacht", ["middernacht"])
add("time_of_day", "nacht", ["nacht", "nachts"])
add("time_of_day", "avond", ["avond", "avonds", "schemer", "schemering", "schemeravond"])
add("time_of_day", "ochtend", ["ochtend", "morgens", "dageraad"])
add("time_of_day", "middag", ["middag", "middags"])
add("colour", "wit", ["wit", "witte"])
add("colour", "zwart", ["zwart", "zwarte"])
add("colour", "rood", ["rood", "rode"])
add("colour", "grijs", ["grijs", "grijze", "grauw", "grauwe"])
add("colour", "groen", ["groen", "groene"])
add("colour", "blauw", ["blauw", "blauwe"])
add("colour", "geel", ["geel", "gele"])
add("colour", "bruin", ["bruin", "bruine"])

NUMBER_WORDS = {"twee": 2, "drie": 3, "vier": 4, "vijf": 5, "zes": 6, "zeven": 7, "acht": 8, "negen": 9,
                "tien": 10, "elf": 11, "twaalf": 12, "honderd": 100, "dertien": 13, "veertien": 14,
                "vijftien": 15, "twintig": 20, "dertig": 30, "veertig": 40, "vijftig": 50, "duizend": 1000}
MONTHS = {"januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september",
          "oktober", "november", "december"}

# a compound is not its own last part: 'kerkhof' is not 'hof', 'weerwolf' is not 'wolf'
NOT_INSIDE = {"wolf": ("weerwolf",), "kerk": ("kerkhof",), "wit": ("witwief",)}


# Number words that are also other words, and how to tell: the verb 'achten' ('dit acht je
# niet', 'in acht nemen'), 'vieren' ('vier je feest'), the creature 'elf' ('een elf').
PRONOUNS = {"je", "jij", "u", "hij", "zij", "ze", "men", "ik", "we", "wij", "het", "hem", "haar",
            "mij", "me", "zich", "jou", "ons"}
NOT_NUMBER = {
    "acht": lambda prev, nxt: nxt in PRONOUNS | {"slaan", "slaat", "sloeg", "geven", "nemen", "neemt", "nam",
                                                  "genomen", "te"} or prev in {"geen", "ik", "hij", "men"},
    "vier": lambda prev, nxt: nxt in PRONOUNS - {"ze"} | {"feest"} or prev in {"ik", "we", "wij", "men"},
    "elf": lambda prev, nxt: prev in {"een", "die", "deze", "het", "kleine", "boze"},
}
_WORD = re.compile(r"[^\W_]+", re.U)


def numbers(text):
    """Every numeral in the text as an int (words and digits), not counting years or dates.
    'één' with its accents is the number one (plain 'een' is the article). Not counted: a
    number word that is another word here (see NOT_NUMBER), one with a capital in mid
    sentence (a place: 'in Acht'), and a half hour ('om half acht' is no count of eight)."""
    words = [(m.group(0), m.start()) for m in _WORD.finditer(text)]
    low = [strip_accents(w.lower()) for w, _ in words]
    out = []
    for i, (w, at) in enumerate(words):
        t = low[i]
        prev = low[i - 1] if i else ""
        nxt = low[i + 1] if i + 1 < len(low) else ""
        if re.fullmatch(r"[EeÉé][éÉ]n|[Éé][Ee]n", w):
            out.append(1)
            continue
        if t in NUMBER_WORDS:
            if prev == "half" or (t in NOT_NUMBER and NOT_NUMBER[t](prev, nxt)):
                continue
            # a capital where no sentence starts: a name
            gap = text[:at]
            before = gap.rstrip()
            if (w[0].isupper() and before and before[-1] not in ".!?:\"'‘“(-—"
                    and "\n" not in gap[len(before):]):
                continue
            out.append(NUMBER_WORDS[t])
        elif t.isdigit() and len(t) <= 3 and nxt not in MONTHS:
            out.append(int(t))
    return out


HOUR_WORDS = {"een": 1, "één": 1, "twee": 2, "drie": 3, "vier": 4, "vijf": 5, "zes": 6, "zeven": 7, "acht": 8,
              "negen": 9, "tien": 10, "elf": 11, "twaalf": 12}
_HW = "|".join(sorted({strip_accents(k) for k in HOUR_WORDS}, key=len, reverse=True))
_HOUR = re.compile(rf"\b(half\s+)?({_HW}|1[0-2]|[1-9])\s+uur\b")
# an hour on the clock, not a duration: a clock word before it, or the time of day after it
_BEFORE = re.compile(r"(?:\b(?:om|tegen|klokslag|slag|rond|omstreeks|precies|stipt|tot)|\bhet\s+(?:is|was|werd)|\bdat\s+het)\s+$")
_AFTER = re.compile(r"\s*(?:'s\s+(?:nachts|avonds|morgens|middags)|in\s+de\s+nacht|\b(?:is|was|sloeg)\b)")
_DURATION = re.compile(r"\s+(?:lang|later|geleden|daarna|verder|lopen|gaans|ver|weg|vantevoren|van\s+tevoren|tevoren|eerder)\b")
_SLAG = re.compile(rf"\bklokslag\s+({_HW}|1[0-2]|[1-9])\b")
_MIDNIGHT = re.compile(r"\b(?:middernacht|spookuur)\b")
_HALF = re.compile(rf"\b(?:om|tegen|rond)\s+half\s+(?:{_HW}|1[0-2]|[1-9])\b(?!\s+uur)")


def hours(text):
    """Every clock hour (1-12) the text names: 'om twaalf uur', 'het was twee uur', 'twaalf
    uur 's nachts', 'klokslag drie', 'tegen middernacht' (12). Durations ('twee uur lang')
    do not count; a half hour ('half twaalf') counts as 0, so it never passes as an hour."""
    t = strip_accents(text.lower())
    out = []
    for m in _HOUR.finditer(t):
        rest = t[m.end():]
        if _DURATION.match(rest):
            continue
        if not (_BEFORE.search(t[:m.start()]) or _AFTER.match(rest)):
            continue
        v = int(m.group(2)) if m.group(2).isdigit() else HOUR_WORDS[m.group(2)]
        out.append(0 if m.group(1) else v)
    for m in _SLAG.finditer(t):
        if not re.match(r"\s+uur", t[m.end():]):
            out.append(int(m.group(1)) if m.group(1).isdigit() else HOUR_WORDS[m.group(1)])
    out += [12] * len(_MIDNIGHT.findall(t))
    out += [0] * len(_HALF.findall(t))
    return out


_NUM_TOKEN = re.compile(r"\b(" + "|".join(sorted(NUMBER_WORDS, key=len, reverse=True)) + r"|[EeÉé][éÉ]n|[Éé][Ee]n|\d{1,3})\b", re.I)


def number_word(text, value):
    """The word in text (as it is written there) that names value: 'zes', 'Drie', '7'."""
    for m in _NUM_TOKEN.finditer(text):
        w = m.group(1)
        v = int(w) if w.isdigit() else NUMBER_WORDS.get(strip_accents(w.lower()), 1)
        if v == value:
            return w
    return None


def extract(text):
    toks = tokens(text)
    flat = " " + " ".join(toks) + " "
    out = {}
    for lemma, (kind, forms, compound) in LEMMAS.items():
        n = 0
        for t in toks:
            for f in forms:
                if " " in f:
                    continue
                if t == f or (compound and len(t) > len(f) + 2 and t.endswith(f)
                              and not any(t.endswith(x) for x in NOT_INSIDE.get(lemma, ()))):
                    n += 1
                    break
        for f in forms:
            if " " in f:
                n += flat.count(" " + f + " ")
        if n:
            out.setdefault(kind, {})[lemma] = n
    nums = numbers(text)
    if nums:
        out["number"] = {}
        for v in nums:
            out["number"][str(v)] = out["number"].get(str(v), 0) + 1
    # 'twaalf uur' at night is midnight as well as a number
    if re.search(r"\btwaalf uur\b|\b12 uur\b", strip_accents(text.lower())):
        out.setdefault("time_of_day", {})["middernacht"] = out.get("time_of_day", {}).get("middernacht", 0) + 1
    return out


def surface_forms(lemma, text):
    """The forms of lemma as they actually occur in text (for accepted answers)."""
    kind, forms, compound = LEMMAS[lemma]
    found = set()
    for t in tokens(text):
        for f in forms:
            if t == f or (compound and len(t) > len(f) + 2 and t.endswith(f)):
                found.add(t)
    return found
