"""The five cabinets of NACHTDIENST_PUZZLES.md section 2, as rules on a story's
catalogue codes and words. Shared by t1_spooky.py (the subset S: anything a
cabinet would take) and t6_cabinets.py (exactly one cabinet, or none).
"""
import re

from typeindex import FAMILIES, code_to_family

CABINETS = {
    1: {"fam": "voortekenen", "label": "Voortekenen"},
    2: {"fam": "wittewieven", "label": "Witte wieven"},
    3: {"fam": "weerwolven", "label": "Weerwolven"},
    4: {"fam": "spoken", "label": "Spoken"},
    5: {"fam": "duivel", "label": "De duivel"},
}
FAM_CAB = {v["fam"]: k for k, v in CABINETS.items()}

# The type index's words for each family, widened to the spec's subgenre filters.
EXTRA = {
    "voortekenen": r"\bklop(?:t|te|ten|pen)?\b.{0,60}\b(?:dood|sterf|overl)|klok (?:bleef|stond) stil|klok stil"
                   r"|(?:hond|uil|ekster|kraai|haan) .{0,40}(?:huil|kras|kraai|roep).{0,60}(?:dood|sterf|overl)",
    "wittewieven": r"wittewievenkuil|wittewievenbult|witte wievenkuil|witte wieven(?:bult|berg|kuil)",
    "weerwolven": r"in een wolf|als (?:een )?wolf rond",
    "spoken": r"spookkoets|spookwagen|koets zonder paarden|lijkkoets .{0,40}(?:nacht|spook)|dode kwam terug"
              r"|kwam .{0,20}terug als (?:geest|spook)",
    "duivel": r"zwarte hond|klaverboer|ziel .{0,20}verkocht|verbond met de duivel|duivelsverbond",
}
RX = {f: re.compile(v["kw"] + "|" + EXTRA[f], re.I) for f, v in FAMILIES.items()}
C2F = code_to_family()


def sinsag_codes(codes):
    return [c.split()[1] for c in codes if c.startswith("SINSAG ")]


def matches(desc, codes):
    """{cabinet: 'code' | 'words'} for every cabinet whose rules take the story."""
    out = {}
    for c in sinsag_codes(codes):
        if c in C2F:
            out[FAM_CAB[C2F[c]]] = "code"
    for fam, rx in RX.items():
        if rx.search(desc or ""):
            out.setdefault(FAM_CAB[fam], "words")
    return out


def assign(desc, codes):
    """Exactly one cabinet, or None. Catalogue codes decide; words only when uncoded."""
    m = matches(desc, codes)
    by_code = [c for c, how in m.items() if how == "code"]
    if len(by_code) == 1:
        return by_code[0]
    if by_code:
        return None
    if len(m) == 1 and not sinsag_codes(codes):
        return next(iter(m))
    return None
