"""Derived table 6: which cabinet a story belongs in (1–5), by the subgenre rules
of section 2 (cabinets.py). Stories that fit no cabinet, or more than one, stay out.

    python3 pipeline/t6_cabinets.py   ->  data/derived/cabinet_assignment.jsonl
"""
from collections import Counter

from cabinets import assign, sinsag_codes, C2F, FAM_CAB
from common import read_jsonl, sample, write_jsonl


def main():
    out = []
    for s in read_jsonl("spooky.jsonl"):
        cab = assign(s["description"], s["codes"])
        if not cab:
            continue
        # the type number this cabinet files it under (the first code that belongs here)
        types = [c for c in sinsag_codes(s["codes"]) if FAM_CAB.get(C2F.get(c)) == cab]
        out.append({"n": s["n"], "cabinet": cab, "type": types[0] if types else None})
    k = write_jsonl("cabinet_assignment.jsonl", out)
    print(f"cabinet_assignment.jsonl: {k} stories;", dict(sorted(Counter(r['cabinet'] for r in out).items())))
    sample(out)


if __name__ == "__main__":
    main()
