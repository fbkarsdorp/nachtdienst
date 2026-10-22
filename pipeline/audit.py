"""Step 1 of the puzzle pipeline: field audit of the Verhalenbank dump.

    python3 pipeline/audit.py

Prints the fill rate of every field in data/spooky.sqlite (all stories, and the
located/dated sage subset the puzzles can use), so the spec's data assumptions
(NACHTDIENST_PUZZLES.md, section 5) can be checked before anything is built.
"""
import json
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "data", "spooky.sqlite")

FIELDS = ["record", "url", "subgenre", "language", "collector", "teller", "year", "codes", "sinsag",
          "lat", "lon", "description", "main_text"]


def filled(v):
    if v is None:
        return False
    if isinstance(v, str):
        s = v.strip()
        return bool(s) and s not in ("[]", "null", "{}")
    return True


def main():
    db = sqlite3.connect(DB)
    rows = db.execute(f"select {', '.join(FIELDS)} from stories").fetchall()
    sage = [r for r in rows if r[2] and "sage" in json.loads(r[2] or "[]")]
    usable = [r for r in sage if r[9] is not None and r[6]]
    print(f"stories: {len(rows)}   sage: {len(sage)}   sage with lat/lon and year: {len(usable)}\n")
    print(f"{'field':<12} {'all':>8} {'sage':>8} {'usable':>8}")
    for i, f in enumerate(FIELDS):
        a = sum(filled(r[i]) for r in rows) / len(rows)
        b = sum(filled(r[i]) for r in sage) / max(1, len(sage))
        c = sum(filled(r[i]) for r in usable) / max(1, len(usable))
        print(f"{f:<12} {a:8.1%} {b:8.1%} {c:8.1%}")
    # derived fields the spec assumes
    emb = db.execute("select count(*) from embeddings").fetchone()[0]
    print(f"\nembeddings (bge-m3, float16 x 1024): {emb} stories")
    long_desc = sum(1 for r in usable if r[11] and len(r[11].split()) >= 60)
    print(f"usable stories with a description of 60+ words: {long_desc}")
    langs = {}
    for r in usable:
        langs[r[3] or "?"] = langs.get(r[3] or "?", 0) + 1
    print("languages (usable):", ", ".join(f"{k} {v}" for k, v in sorted(langs.items(), key=lambda x: -x[1])[:8]))
    print("\nnot in the dump: a place-name field (places come from the coordinates via GeoNames),")
    print("narrator fields beyond 'teller', keywords (only subgenre and catalogue codes).")


if __name__ == "__main__":
    main()
