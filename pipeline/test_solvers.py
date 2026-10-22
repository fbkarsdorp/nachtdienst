"""Synthetic test suite for the P1, P6, R1 and R3 solvers (spec section 9, steps 4 and 7).

    python3 pipeline/test_solvers.py

Ten tiny families with known outcomes: some survive, some are rejected because
the answer is ambiguous, some because the only shared thing is too common (idf).
"""
import sys

from solvers import solve_p1, solve_p6, solve_r1, solve_r3

# a small idf table: 'hond' and 'huis' are common, the rest rare
IDF = {"animal:hond": 2.4, "building:huis": 2.0, "object:lantaarn": 4.8, "object:kist": 4.1,
       "building:molen": 4.5, "profession:smid": 5.2, "animal:haan": 4.9, "object:spiegel": 5.0,
       "object:sleutel": 4.6, "animal:kat": 3.6, "building:kerk": 3.4}

P1_CASES = [
    ("lantaarn in all four", ["Een man zag een lantaarn bij de sloot.", "Bij de brug hing een lantaarn.",
                              "Zij droeg een lantaarntje over het pad.", "Er dwaalde een lantaarn over de heide."],
     ("object", "lantaarn")),
    ("molen, compound counts", ["Bij de molen spookte het.", "De molenaar zag iets bij de molen.",
                                "Een witte gedaante stond bij de korenmolen.", "Achter de molen liep een vrouw."],
     ("building", "molen")),
    ("two shared things: ambiguous", ["Een smid zag een kist.", "De smid vond een kist.",
                                      "In de kist zat de smid.", "Een kist en een smid."], None),
    ("only hond shared: below the idf floor", ["Een hond liep mee.", "De hond blafte.", "Een zwarte hond.",
                                               "Hij had een hond."], None),
    ("nothing shared", ["Een haan kraaide.", "Een spiegel brak.", "Een sleutel viel.", "Een kat miauwde."], None),
    ("rare thing shared, common one too", ["De haan in het huis.", "Een haan bij het huis.",
                                           "De haan kraaide driemaal.", "Daar zat de haan."], ("animal", "haan")),
]
P6_CASES = [
    ("one number each", ["Het klopte drie keer.", "Er brandden zeven kaarsen.", "Na twaalf dagen was hij dood."],
     [3, 7, 12]),
    ("digits count", ["Hij hoorde 4 slagen.", "Zij zag 2 lichten.", "Het duurde 9 nachten."], [4, 2, 9]),
    ("two numbers on a card: reject", ["Drie of vier keer klopte het.", "Zes kaarsen.", "Elf dagen."], None),
    ("out of range: reject", ["Honderd jaar later.", "Drie keer.", "Vijf nachten."], None),
]
R1_CASES = [
    ("all three count three", ["Drie keer klopte het.", "Er zaten drie kraaien op het dak.", "Na drie dagen was hij dood."], 3),
    ("digits count too", ["Hij zag 7 lichten.", "Zeven nachten lang.", "Het duurde 7 weken."], 7),
    ("two numbers on a card: reject", ["Drie of vier keer.", "Drie kraaien.", "Drie dagen."], None),
    ("numbers disagree: reject", ["Drie keer.", "Vier kraaien.", "Drie dagen."], None),
    ("past nine is not on the dial for a digit: reject", ["Om twaalf uur.", "Twaalf slagen.", "Twaalf dagen."], None),
    ("'acht' the verb is no number: reject", ["Dit acht je niet.", "Acht zonen.", "Acht dagen later."], None),
    ("Acht the village is no number: reject", ["Een boer in Acht.", "Acht zonen.", "Na acht dagen."], None),
    ("half eight is a time, not a count: reject", ["Om half acht.", "Acht zonen.", "Acht dagen."], None),
    ("eight at the start of a sentence counts", ["Acht zonen had hij.", "Zij zag acht kraaien.", "Het duurde 8 weken."], 8),
]
R3_CASES = [
    ("five different counts", ["Drie keer klopte het.", "Zeven nachten lang.", "Twee kogels.", "Acht zonen.",
                               "Twaalf slagen."], [3, 7, 2, 8, 12]),
    ("a repeated count: reject", ["Drie keer.", "Drie nachten.", "Twee kogels.", "Acht zonen.", "Zeven."], None),
    ("a number outside the set: reject", ["Vier keer.", "Zeven nachten.", "Twee.", "Acht.", "Twaalf."], None),
]


def main():
    bad = 0
    for name, descs, want in P1_CASES:
        got = solve_p1(descs, IDF)
        ok = got == want
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} P1 {name}: {got}")
    for name, descs, want in P6_CASES:
        got = solve_p6(descs)
        ok = got == want
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} P6 {name}: {got}")
    for name, descs, want in R1_CASES:
        got = solve_r1(descs)
        ok = got == want
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} R1 {name}: {got}")
    for name, descs, want in R3_CASES:
        got = solve_r3(descs)
        ok = got == want
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} R3 {name}: {got}")
    print("all green" if not bad else f"{bad} failing")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
