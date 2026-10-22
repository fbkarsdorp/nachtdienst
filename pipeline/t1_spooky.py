"""Derived table 1: the spooky subset S.

    python3 pipeline/t1_spooky.py   ->  data/derived/spooky.jsonl

Located, dated legends (sage) whose catalogue codes or words put them in one of
the five cabinets' subgenres, with a usable standard-Dutch description.
"""
import json
import re
import sqlite3

from cabinets import matches
from common import DB, clean, initials, sample, write_jsonl

NL_BOX = (50.74, 3.35, 53.56, 7.23)
META = re.compile(r"onbekend\.?$|niet bekend|geen verhalen|kent geen|weet niets|niets van bekend"
                  r"|^(voorbeeld|opmerking|voorstelling|verhalen over|diverse|bewering|uitleg|beschrijving"
                  r"|informatie|lijst|overzicht|het verhaal|dit verhaal|verteller vertelt over)", re.I)


def main():
    db = sqlite3.connect(DB)
    rows = db.execute("select n, record, url, subgenre, language, collector, teller, year, codes, lat, lon, "
                      "description, main_text from stories where lat is not null")
    out = []
    for n, record, url, sub, lang, coll, teller, year, codes, lat, lon, desc, text in rows:
        if not (NL_BOX[0] < lat < NL_BOX[2] and NL_BOX[1] < lon < NL_BOX[3]):
            continue
        sub = json.loads(sub or "[]")
        if "sage" not in sub and "personal narrative" not in sub:
            continue
        if not year or not (1800 <= year <= 1990):
            continue
        desc = clean(desc)
        if not (40 <= len(desc) <= 1400) or META.search(desc):
            continue
        codes = json.loads(codes or "[]")
        if not matches(desc, codes):
            continue
        out.append({
            "n": n, "record": record or "", "url": url or "", "language": lang or "",
            "collector": (collector := (coll or "").strip("[]")), "initials": initials(collector),
            "teller": teller or "", "year": year, "codes": codes, "lat": round(lat, 5), "lon": round(lon, 5),
            "description": desc, "text": clean(text)[:1400],
        })
    k = write_jsonl("spooky.jsonl", out)
    print(f"spooky.jsonl: {k} stories (target 10–20k)")
    sample(out)


if __name__ == "__main__":
    main()
