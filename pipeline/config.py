"""Tunable constants for the puzzle pipeline (NACHTDIENST_PUZZLES.md).

Tune by looking at the yield report (python3 pipeline/generate.py), not at
individual puzzles.
"""

# P1: a shared thing only counts if it is rarer than this (natural-log idf over S)
IDF_FLOOR = 3.0
# P2: a dropped pin within this many km of the true place is right
PIN_RADIUS_KM = 6.0
# P2: helpers lie within this many km of the target
HELPER_RADIUS_KM = 25.0
# P2: the target lies inside the helpers' triangle, or this close to its centroid
CENTROID_KM = 8.0
# P2: and, so that a pin in the middle of the three is right, at most this far from it
MIDDLE_KM = 4.5
# P3: the intruder must be this much further (cosine) from the trio's centroid than any trio member
OUTLIER_MARGIN = 0.15
# P3: the intruder is chosen among this many nearest stories of another cabinet
INTRUDER_NEAREST = 20
# P4: descriptions at least this long can be torn
TEAR_MIN_WORDS = 60
# P4: the loose box holds this many bottom halves (the true one included)
BOX_SIZE = 12
# P6: numbers on the strongbox's wheels
NUMBER_RANGE = (1, 12)

# the night is in 1983: no card recorded after it
YEAR_MAX = 1983

# R2: cards in the window drawer; the name on the glass is this long (letters)
R2_CARDS = 6
R2_NAME_LEN = (5, 9)
# R3: the numbers on the door drawer's cards (one each, all different) and the knocks it may be
R3_VALUES = (2, 3, 7, 8, 12)
R3_KNOCKS = (2, 3, 7)
# R4: bottom halves in the typewriter drawer (the true one included)
R4_CARDS = 6

# families of the same legend
FAMILY_MIN = 3
FAMILY_MAX = 12
FAMILY_COSINE = 0.62

# hints cost this many minutes on the clock
HINT_COST_MIN = (2, 4, 8)

# bundles: how many seeds to ship, and the first one
BUNDLE_COUNT = 120
BUNDLE_FIRST_SEED = 1001

# embeddings are projected down to this many dimensions (pure Python must stay quick)
EMBED_DIM = 256

# a story's own page in the Verhalenbank (the reading log on the last card links there)
VERHALENBANK_URL = "https://www.verhalenbank.nl/items/show/{n}"
