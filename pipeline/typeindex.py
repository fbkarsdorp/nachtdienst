"""The type index: five families of fear, the SINSAG types filed under each,
and the short Dutch headings typed on the cabinet plaques and drawer labels.

The headings are descriptive catalogue titles written for the archive; the
SINSAG numbers are the real codes carried by the stories in the Verhalenbank.
`cue` lists words that a reader can use to match a card to its heading
(used to grade catalogue-lookup puzzles), and `hard` the distinctive ones that
still identify the heading when the family word itself is absent; `kw` on a family is the word field
that marks a story as belonging to it.
"""

FAMILIES = {
    "voortekenen": {
        "title": "Voortekenen",
        "roman": "I",
        "being": "voortekenen",
        "kw": r"voorteken|voorgezicht|voorbode|voorspel|voorzegg|lijkstoet|lijkstatie|met de helm|helm geboren|helderzien|aankondig|kondigt .{0,40}aan|zal sterven|gaat sterven",
        "outsider_word": "een voorteken",
        "types": [
            ("0481", "Met de helm geboren: de lijkstoet gezien", r"helm|lijkstoet|lijkstatie|stoet|voorgezicht|opzij", r"helm|lijkstoet|lijkstatie"),
            ("0486", "Gerucht in huis als voorbode van de dood", r"geluid|gerommel|rommel|klop|gestommel|lawaai|horen|hoort", None),
            ("0487", "Licht en vuur als voorbode", r"licht|lucht|vuur|oorlog|gloed|vlam", None),
            ("0491", "De brand vooruit gezien", r"brand|afbrand|vuur", r"brand"),
            ("0492", "Trein en vaart voorzien", r"trein|tram|spoor|schepen|schip|vaart|kanaal|weg|auto", r"trein|tram|spoor|kanaal|auto|vaart"),
            ("0061", "Getimmer in de nacht", r"timmer|zaag|werk|kloppen|doodskist", r"timmer"),
            ("0483", "Het eigen einde gezien", r"doodskist|lijkkist|kist|waarzeg|eigen dood", r"doodskist|lijkkist|waarzeg"),
            ("0489", "Wie de dood kan aanzeggen", r"helderzien|voorspel|toekomst|zegt .*sterven|aankondig", None),
        ],
    },
    "wittewieven": {
        "title": "Witte wieven",
        "roman": "II",
        "being": "witte wieven",
        "kw": r"witte? ?wie(?:f|ven|ve|fke|fkes)\b|witte wijven|wit wijf|witte juf|witte vrouw|witte dame|witte madam|witte non|in het wit geklede vrouw|wit meisje",
        "outsider_word": "een witte vrouw",
        "types": [
            ("0310", "Witte wieven: waar zij dansen en dwalen", r"wit|dans|poel|heuvel|gestalte|zweeft", None),
            ("0311", "De witte juffer die geen rust vindt", r"juffer|moord|kasteel|freule|dame|non|zonder hoofd", None),
            ("0301", "De witte vrouw wijst de schat", r"schat|kist|geld|verloss", r"schat"),
            ("0161", "Achtervolgd door witte vrouwen", r"achterna|achtervolg|naakt|rennen|lopen", r"achtervolg|achterna"),
        ],
    },
    "weerwolven": {
        "title": "Weerwolven",
        "roman": "III",
        "being": "weerwolven",
        "kw": r"weerwol|wolfsvel|wolfshuid|wolfsriem",
        "outsider_word": "een weerwolf",
        "types": [
            ("0801", "De weerwolf springt op de rug", r"rug|springt|sprong|draag|zwaar", r"op (?:de|zijn|haar|hun) rug|op zijn nek"),
            ("0803", "Riem, hoepel en gedaanteverwisseling", r"hoepel|riem|gordel|veulen|twaalf uur", None),
            ("0804", "De weerwolf in andere gedaante", r"gedaante|ploeg|vogel|kat|haas", None),
            ("0805", "De weerwolf loopt mee tot de deur", r"begeleid|volg|mee|fiets|huis", None),
            ("0822", "Verwond en daardoor herkend", r"verwond|mes|steek|stak|bloed|schiet|geschoten|wond|litteken|kaart", r"verwond|gestoken|geschoten|wond"),
            ("0823", "Het meisje, de schort en de zakdoek", r"zakdoek|schort|meisje|vriendin|verkering|tanden", r"zakdoek|schort"),
            ("0824", "Het wolfsvel en de holle boom", r"vel|huid|holle boom|boom|verbrand", r"wolfsvel|holle boom|wolfshuid"),
        ],
    },
    "spoken": {
        "title": "Spoken",
        "roman": "IV",
        "being": "spoken",
        "kw": r"spook|spoken|spookt|spookte|spookhuis|geest\b|geesten|schim|rondwaren|ronddolen|geen rust",
        "outsider_word": "een spook",
        "types": [
            ("0450", "Wie na de dood geen rust vindt", r"rust|dwalen|dood|vloek|terug", None),
            ("0402", "De dode en de belofte", r"belofte|beloofd|sterfbed|graf|doodskleed|lijkkleed", r"belofte|beloofd|doodskleed|lijkkleed"),
            ("0404", "De grenssteenverlegger", r"grenssteen|steen|paal|grens|land", r"grenssteen|grenspaal|grensstenen"),
            ("0333", "Spokerij bij brug, hek en boerderij", r"brug|hek|boerderij|stal|vurige ogen|ketting", None),
            ("0401", "Het spookhuis en het verborgen geld", r"geld|schat|kist|potten|verborgen", r"geld|schat"),
            ("0456", "Het huis waar het spookt", r"huis|kamer|zolder|gegooid", None),
            ("0477", "De schim van de dode", r"schim|verschijning|gedaante|overleden", None),
            ("0478", "Plaatsen waar het niet pluis is", r"plaats|plek|weg|nacht", None),
        ],
    },
    "duivel": {
        "title": "De duivel",
        "roman": "V",
        "being": "de duivel",
        "kw": r"\bduivels?\b|\bduvel\b|de kwade\b|hansje pik|satan|de boze\b|paardenpoot|bokkenpoot",
        "outsider_word": "de duivel",
        "types": [
            ("0685", "Klaverboer haalt de fles", r"klaver|kaart|fles|jenever|drank", r"klaver"),
            ("0904", "De vreemde kaartspeler", r"kaart|vreemde|paardenpoot|hoef|onder de tafel|speler", r"kaart"),
            ("0881", "De verkochte ziel", r"ziel|verkocht|verkoop|contract|verbond", r"ziel"),
            ("0882", "De wisseldaalder van de kruisweg", r"daalder|kruisweg|kruispunt|geld|vrijmetselaar", r"daalder"),
            ("0883", "De zwarte hond", r"hond", r"hond"),
            ("0917", "Wie spot, wordt gestraft", r"spot|lach|pocht|niet bang|kerk", None),
            ("0945", "Door de duivel weggesmeten", r"smijt|gesmeten|gegooid|opgetild|weggeslingerd|klap|slaat", r"gesmeten|gegooid|smijt|geslingerd"),
            ("0893", "De duivel op het dansfeest", r"dans|hoef|paardenpoot|heer", r"dans"),
        ],
    },
}

ORDER = ["voortekenen", "wittewieven", "weerwolven", "spoken", "duivel"]


def code_to_family():
    out = {}
    for fam, f in FAMILIES.items():
        for code, *_ in f["types"]:
            out[code] = fam
    # Neighbouring types that belong to a family but are not on its plaque.
    extra = {
        "voortekenen": ["0488", "0493"],
        "wittewieven": ["0310A", "0310D", "0310F"],
        "spoken": ["0401", "0403", "0410", "0413", "0434", "0435", "0436", "0475", "0212", "0256", "0252"],
        "duivel": ["0903", "0907", "0916", "0918", "0922", "0933", "0934", "0361", "0334", "0982", "0892"],
    }
    for fam, codes in extra.items():
        for c in codes:
            out.setdefault(c, fam)
    return out


def type_title(code):
    for f in FAMILIES.values():
        for c, t, *_ in f["types"]:
            if c == code:
                return t
    return None
