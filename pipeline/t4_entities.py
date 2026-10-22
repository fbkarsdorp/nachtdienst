"""Derived table 4: entities per story, and a global idf per lemma.

    python3 pipeline/t4_entities.py   ->  data/derived/entities.jsonl (+ idf.json)

{kind: {lemma: count}} from the description, by the rule-based extractor in
entities.py. idf = ln(|S| / document frequency).
"""
import json
import math

from common import path, read_jsonl, sample, write_jsonl
from entities import extract


def main():
    S = read_jsonl("spooky.jsonl")
    rows, df = [], {}
    for s in S:
        e = extract(s["description"])
        rows.append({"n": s["n"], "e": e})
        for kind, lemmas in e.items():
            for lemma in lemmas:
                df[(kind, lemma)] = df.get((kind, lemma), 0) + 1
    idf = {f"{k}:{l}": round(math.log(len(S) / d), 3) for (k, l), d in df.items()}
    write_jsonl("entities.jsonl", rows)
    with open(path("idf.json"), "w", encoding="utf-8") as f:
        json.dump(idf, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f"entities.jsonl: {len(rows)} stories, {len(idf)} lemmas with an idf")
    sample(rows)
    common = sorted(idf.items(), key=lambda x: x[1])[:12]
    print("most common:", ", ".join(f"{k} {v}" for k, v in common))


if __name__ == "__main__":
    main()
