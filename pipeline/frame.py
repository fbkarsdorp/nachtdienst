"""The authored frame (NACHTDIENST_PUZZLES.md section 7): written once, by hand,
the same in every bundle. Card texts are Dutch only.
"""

GENERATED_AT = "2026-10-21T06:00:00Z"

NOTE_TABLE = "Twaalf enveloppen invoegen.\nKast vijf blijft dicht.\nSluit af vóór twaalven.\n— J.J.V."
NOTE_FINAL = "Goed opgeborgen. Morgen om negen. — J.J.V."

INTRO = [
    "Je bent de nieuwe assistent.",
    "Op tafel ligt een briefje van de verzamelaar.",
    "De sleutel van de voordeur zit in zijn jas, en hij is naar huis.",
    "De klok zegt kwart over negen.",
    "Je begint te ordenen.",
]

DESK = (
    "In het Centraal Sagenarchief staat een leestafel met een groen kleed, en daarop een lamp met "
    "een groene kap. Langs de muur staan vijf kasten met laden vol kaarten. 's Avonds, als de anderen "
    "weg zijn, zit daar de assistent die 's avonds doorwerkte, en leest. Men ziet alleen de "
    "handen in het lamplicht."
)

# section 3d: on each misfiled card as it goes home, in J.J.V.'s pencil
TRAIL_NOTES = [
    "Niet door mij opgetekend. Mijn vorige assistent.",
    "Zelfde hand. Hij werkte 's avonds door.",
    "Zijn laatste. Daarna geen kaarten meer van hem.",
    "Deze heeft hij niet opgeborgen. Ik ook niet.",
]

FIVE = (
    "Er was eens een nieuwe assistent op het Sagenarchief die 's avonds bleef om het opbergen af te maken. "
    "De verzamelaar was naar huis gegaan. De assistent zette vier kasten op orde en maakte toen ook de "
    "vijfde open, al was gezegd dat die dicht moest blijven. Daarna is de assistent niet meer gezien. "
    "De kaarten lagen keurig op volgorde, en wat de assistent daar zag, dat was ____."
)


def desk_render():
    return {"kind": "Sage", "description": DESK, "place": "Amsterdam", "prov": "N.-H.", "year": 1936,
            "code": None, "initials": "J.J.V.", "teller": "de vorige assistent", "note": "Niet lezen. Opbergen."}


def frame():
    return {
        "collector": "J.J.V.",
        "intro": INTRO,
        "note_table": NOTE_TABLE,
        "note_final": NOTE_FINAL,
        "card_desk": desk_render(),
        "trail_notes": TRAIL_NOTES,
        "card_five": {"kind": "Sage", "description": FIVE, "place": "Amsterdam", "prov": "N.-H.",
                      "year": "tomorrow", "teller": "J.J.V.", "initials": "J.J.V.", "code": None},
        # the final lock also takes these, besides tonight's answers and your name
        "final_words": ["niets", "mij", "mijzelf", "de assistent", "de vorige assistent"],
        "door_locked": "Op slot. De sleutel zit in de jas van J.J.V.",
        "midnight": "De klok slaat twaalf.",
        "good_end": "Goed gedaan. Kast vijf blijft dicht.",
        "nee": "Nee.",
        "not_yet": "Nog niet.",
        # a single puzzle card on a drawer (3b), and J.J.V. on the first divider (3h)
        "into_envelope": "In de envelop.",
        "archive_note": "Achter het schot hoef je vannacht niet.",
        # a drawer in a cabinet the trail has unlocked, while another is still being done
        "finish_first": "Nog niet. Eerst kast {roman}.",
        # when a room lock opens, on the card it turned on: its number is the cabinet's digit
        "digit_note": "{n}. Het cijfer van kast {roman}.",
        "digit_first": "Onthouden: het slot van kast V wil er vier.",
        # section 3c: where the card that is not in the drawer is, in J.J.V.'s words (none for the bin)
        "found_notes": {
            "chair": "Eén ligt waar ik hem gisteren neerlegde.",
            "lamp": "Eén ligt onder de lamp. Niet de lamp verzetten.",
            "coat": "Eén zit in mijn jas. Jas laten hangen.",
            "typewriter": "Eén zit nog in de machine.",
        },
        "floor_note": "Die hoort niet in die la.",
        # R4: what the machine types under the half card it typed by itself
        "machine_continued": "— vervolg in la 3 —",
        # section 3e: J.J.V. reacts, once each
        "reactions": {
            "reopen_filed": "Die was klaar.",
            "stalled": "Opschieten.",
            "read_desk": "Ik had gezegd: niet lezen.",
            "typo3": "Het staat er. Lees.",
            "other_hand": "hij komt niet terug",
            "five_shut": "Dicht.",
        },
        "citation": "Bron: Nederlandse Volksverhalenbank, Meertens Instituut (KNAW), www.verhalenbank.nl",
    }
