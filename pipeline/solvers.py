"""Independent solvers for the solver-backed puzzles (P1, P6), the room locks that count
(R1, R3), and the P5 check.

Each receives only the rendered card text a player would see, re-runs extraction
on it, and returns the answer it finds (or None when the answer is not unique).
They never read the generator's stored entity table (entities.jsonl / idf.json is
passed in only as the idf floor's word list, which is part of the puzzle's rules).
"""
from entities import extract, numbers
from config import IDF_FLOOR, NUMBER_RANGE, R3_VALUES

P1_KINDS = ("object", "animal", "profession", "building")


def solve_p1(descriptions, idf):
    """The one thing all four descriptions mention, or None."""
    sets = []
    for d in descriptions:
        e = extract(d)
        sets.append({(k, l) for k in P1_KINDS for l in e.get(k, {}) if idf.get(f"{k}:{l}", 0) > IDF_FLOOR})
    common = set.intersection(*sets) if sets else set()
    return next(iter(common)) if len(common) == 1 else None


def solve_p6(descriptions):
    """The three numbers in card order, or None if any card does not count exactly one."""
    lo, hi = NUMBER_RANGE
    out = []
    for d in descriptions:
        nums = numbers(d)
        if len(nums) != 1 or not (lo <= nums[0] <= hi):
            return None
        out.append(nums[0])
    return out


def slot_value(description, kind):
    """The single value of a kind on a card (P5), or None if there is not exactly one."""
    e = extract(description).get(kind, {})
    if len(e) != 1:
        return None
    (lemma, count), = e.items()
    return lemma if count == 1 else None


# a cabinet's digit, and the hour the clock is set to: 2-9 ('één' is mostly 'one of', not a count)
DIGITS = range(2, 10)


def solve_r1(descriptions):
    """The one number (2-9) every card counts, each exactly one, or None: the hour to set."""
    got = set()
    for d in descriptions:
        nums = numbers(d)
        if len(nums) != 1 or nums[0] not in DIGITS:
            return None
        got.add(nums[0])
    return got.pop() if len(got) == 1 else None


def one_digit(description):
    """The card's one number, if it names exactly one and it is 2-9 (a cabinet's digit)."""
    nums = numbers(description)
    return nums[0] if len(nums) == 1 and nums[0] in DIGITS else None


def solve_r3(descriptions):
    """Each card's one number (from R3_VALUES), all different, or None."""
    out = []
    for d in descriptions:
        nums = numbers(d)
        if len(nums) != 1 or nums[0] not in R3_VALUES:
            return None
        out.append(nums[0])
    return out if len(set(out)) == len(out) else None
