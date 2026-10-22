# Nachtdienst

An escape room in the Centraal Sagenarchief, a made-up archive of folk tales, built in three.js on the
stories of the Nederlandse Volksverhalenbank. The puzzles follow
`NACHTDIENST_PUZZLES.md`.

1983. You are the new assistant. The collector, J.J.V., has gone home and left a note
on the reading table: *"Twaalf enveloppen invoegen. Kast vijf blijft dicht. Sluit af vóór
twaalven."* The front-door key is in his coat. The clock reads 21:15. Put four
cabinets in order: twelve drawers, three in each: two card puzzles and one *room
lock*, a thing in the room that is the lock (the clock, the window, the door, the
typewriter).

Solving a lock is *knowing*; inserting the cards is *filing*, and only filing counts. A
drawer's puzzle cards are incoming records in a manila envelope clipped to its front
(*IN TE VOEGEN — la 2-1*); you carry the envelope to the table and work there. When a
lock opens, every card of that drawer slides back into the envelope and it is sealed;
carry it to its drawer, and the cards are inserted into the archive behind the divider.
The emptied envelope, stamped *INGEVOEGD*, goes onto the bill spike on the table: the only
thing that shows how far you are. A drawer goes shut, open (envelope taken), solved,
filed; the next one in a
cabinet opens only when the ones before it are filed. One cabinet at a time: the next
one along the trail unlocks when its misfiled card goes home (its first drawer stands a
hand's width open), but its drawers open only once the cabinet you are on is filed
(*"Nog niet. Eerst kast I."*).

Each room lock turns on one number, 2 to 9, and that number is the cabinet's digit for
the dial of cabinet 5, and each shows it in the room: the hour you set the clock to,
the knocks at the door, a figure that comes in the window's mist, a word the typewriter
types. On the window's and the typewriter's card that number is under a coffee stain,
so it can only be read where it shows itself. When a room lock opens, the card it
turned on comes up with J.J.V.'s pencil: *"6. Het cijfer van kast II."* The four digits
of a night all differ; the strip at the top keeps them.

Cards that are out of order leak. Only the cabinet you are working on leaks: from the
moment its first drawer comes out until all three are filed, its effect is in the room
and on the cabinet itself, in step, and it grows a step every three minutes; each drawer
filed takes it a step back down, and on the cabinet it shrinks back a moment. The cabinets
waiting their turn are quiet. Nobody explains this: when the last drawer of a cabinet is
filed, its leak clears off the cabinet in front of you, then your head turns of its own
accord to where it was in the room, you watch it stop, and the cabinet's *enactment*
plays there.

## Running it

The game is a static site with no build step. It needs a web server, because
ES modules and `fetch` don't work from `file://`:

```sh
./serve.sh            # or: cd game && python3 -m http.server 8137
open http://localhost:8137/
```

Use headphones: the room is mostly sound (the clock, the wind at the window, things outside).

Online it is served from GitHub Pages: every push to `main` publishes `game/` as it is
(`.github/workflows/pages.yml`). The raw dumps in `data/` and the downloaded sources in
`blender/assets/` are not in the repository; the pipeline and `blender/fetch_assets.py`
fetch and rebuild them.

- `?seed=1001` picks a night: one of the bundles in `game/data/bundles/`. Any other
  name (`?seed=halloween`) always maps to the same one of them.
- Progress (the seed, every drawer's state, what has happened) is saved in
  `localStorage`; the title card offers to resume.
- `?admin` (e.g. `?seed=1006&admin`) adds a panel for testing, toggled with the backquote
  key: the night's order, digits and room-lock answers, where the found cards are, the
  leaks; per cabinet *begin hier* (everything before it filed) and *alles in deze kast*;
  per drawer *open*, *los op* (opens the lock the way a right answer does) and *berg op*
  (inserts the envelope's cards and spikes it, without carrying it); cabinet V and both endings; every enactment
  again, leaks to step 1-3, the wolf, a skipped beat; fetching or laying down the found
  card, the floor card; the clock forward or to 23:55; any viewpoint; another night, or
  this one from the start. It goes through the game's own steps, so what you see is what
  a player sees (`game/js/admin.js`).

## How it plays

The verbs, and the only ones: **open/shut** a drawer, **read** a card, **lay cards on
the table**, **carry** an envelope or a single card to a cabinet or a room object, **pin**
a place on the wall map, **type** on the typewriter, **set** the clock, **pick up** a card
found in the room.

- **Walking about.** Drag to look round; W A S D (or the arrows) or a click on the floor
  to walk, Shift to walk briskly. Click a thing to step up to it (the walk finds its way
  round the furniture; a click on the way hurries it); drawers can be clicked once you
  stand in front of a cabinet. Esc or right-click steps back. The tabs at the bottom are
  shortcuts.
- **Envelopes (sections 3b, 3g).** Cards never fly about. Each puzzle drawer has its
  envelope clipped to its front, greyed until it is that drawer's turn; it says what is
  to be done (J.J.V.'s note, where a missing card is, any hints asked for) and how many
  cards belong in it. The count is live: the misfiled card and the door's card leave it
  for good; a card still elsewhere in the room shows as *3/4*. Click an envelope: it comes
  into your hand and you carry it to the table, where it is laid in the bay at the near
  edge. One envelope is out at a time.
- **Cards in the tray.** Click the envelope and the flap opens: the cards stand upright in
  the tray behind it, showing their top edges and tabs (place, year, the code in red);
  the pointer fans them a little. Click one to read it: F turns it over (the original
  telling, or the collector's initials on a blank back), ← → go through the tray, **Op
  tafel** (Enter) lays it in the next of the four places on the table, Esc stands it
  back. Dragging a card from the tray onto the table lays it there too; a fifth card on
  the table sends the oldest back. Click a card on the table to read it, the space bar to
  see them side by side, **In de la** to stand it back. Found cards join the tray.
- **The hand** holds one card or one envelope, never more. **Meenemen** takes a card (to a
  cabinet, the windowsill, the door, the typewriter); it is carried at the bottom right
  of what you see. A card in the wrong place gets *"Nee."*; a puzzle card on a drawer by
  itself *"In de envelop."*; it stays in your hand, nothing flies back by itself. Cards
  are swapped or put back at the table (clicking *In de hand* elsewhere walks you there).
- **Filing.** When the lock opens the cards slide back into the envelope, the flap shuts
  and a tick comes by the count (a card kept in the hand holds it open until it goes in
  too). Click the envelope to take it, click its cabinet or drawer: you walk there, the
  drawer slides out, the envelope's cards riffle in behind the divider, and the drawer is
  pushed shut a moment later (or on a click): filed. Before its lock is open: *"Nog
  niet."*; the wrong drawer: *"Nee."* The emptied envelope, stamped, goes into your
  pocket (your hand is free at once) and onto the spike by itself when you are next at the
  table.
- **The archive (section 3h).** Click any puzzle drawer's handle and it slides out in
  place: behind a brown divider (*"Achter het schot hoef je vannacht niet."* on the
  first) stand the cabinet's real cards on grey stock, hundreds of them, from the
  Verhalenbank; once a drawer is filed, tonight's cards stand cream just behind the
  divider. Hover a tab for its place, year and code; click to read it, front and back. The
  text loads the first time a cabinet is opened. Nothing in the archive is needed for the
  puzzles. The wall map carries the archive too: every story with a place is a faint dot,
  and hovering a place says how many stories come from round there.
- **Cards.** The front shows the original telling (often in dialect) wherever the puzzle
  allows it, the archive's summary is on the back; where an original would make the
  puzzle ambiguous it is the other way round. A story that is in the Verhalenbank carries
  the archive's violet stamp with its number, bottom right; click the stamp on a lifted
  card to open the story's own page in a new window.
- **"Vraag J.J.V."** adds his next pencil note to the envelope: three per drawer,
  costing 2, 4 and 8 minutes on the clock. Your time is the only score.

### The puzzles

| | drawer | what you do | lock |
|---|---|---|---|
| P1 | *Het losse etiket*: four cards, the label rubbed off | find the one thing all four mention; type it | word (the label prints) |
| P2 | *De kaart zonder plaats*: one card's place is missing | its three companions are pinned in grey on the map, joined in pencil; the missing place lies between them (in cabinet 1, in their middle). Put a red pin there | within 6 km (the pin turns black, the place types itself in); a miss says which way: *"Nee. Meer naar het noorden."* |
| P3 | *De verdwaalde kaart*: one of four belongs elsewhere | take it (Meenemen) and drop it on the cabinet it belongs in | card to cabinet; a wrong card or cabinet: *"Nee."*, and the card stays in your hand. Back at the table, click another card to swap them (*Ruilen*) |
| P4 | *De gescheurde kaart*: the top half of a torn card | the top half comes in the envelope; the box of loose halves comes to the table with it. Click the box (or the top half): twelve halves, the one under the pointer brought forward to read. Click one to try it under the top half | the right half joins; a wrong one springs back |
| P5 | *De oudste verteller*: three tellings disagree on one detail | read the years; type the detail from the oldest | word (J.J.V.'s summary card, *"…gezien: ____ (volgens de oudste opname)"*, fills its blank) |
| P6 | *De cijfers*: a strongbox with three wheels of 1–12 | each clipped card counts something, in order | the box opens, and what J.J.V. kept locked in it comes out: one more story, *"Deze bewaar ik apart."* |

P3 is always drawer 2: the trail. As the misfiled card goes home, the cabinet it belongs
in unlocks (its first drawer slides open a hand's width) and J.J.V.'s pencil appears on
the card: *"Niet door mij opgetekend. Mijn vorige assistent."*, then three more notes
down the chain. The last misfiled card belongs in cabinet 5 and goes through the slot in
its locked front. P7 (the spec's filler) is not used: the game has no rack for it.

### The room locks (drawer 3)

| | cabinet | the lock | how |
|---|---|---|---|
| R1 | Voortekenen | **the clock**: three omens each count the same number (two weeks, two horses, two people), and J.J.V. only says *"Alle drie tellen ze hetzelfde. Daarna laat je de klok met rust."* Once a card of the drawer has been read and put down, the loud ticking stops dead and the head turns to the clock: it has stopped | go to the clock and turn the hour hand (drag it, or click an hour); leave it on the hour for two seconds. It strikes that hour and goes again, keeping that time from then on (the game's own time stays in the strip; at midnight it strikes regardless). Digit: the hour |
| R2 | Witte wieven | **the window**: the mist reaches the top of the glass, and a place name is written in it from outside, mirrored. At the window the view flips for a second so it reads | find the card of that place among six and lay it on the sill. The name fades, the mist goes down a step, and a figure comes in it, written from outside too: the number that is under a coffee stain on that card. The card comes back damp. Digit: that figure |
| R3 | Weerwolven | **the door**: something knocks 2, 3 or 7 times every half minute, and the door shivers | find the one of five cards that counts as often, and slide it under the door. It is gone; the knocking stops. Digit: the knocks |
| R4 | Spoken | **the typewriter** starts as drawer 3 is taken out: by the time you sit down with it, it has typed the top half of a card by itself, the carriage still moving, then *"— vervolg in la 3 —"* | drawer 3 holds six bottom halves: lay the right one on the typewriter. On a fresh page it types *"Verteller: de vorige assistent."* and the word that is under a coffee stain on the half (*"— drie —"*), and rings. Digit: that number |

A room lock wakes once its cards have been read and put down: first something happens
that you hear (the loud clock falls silent, a finger squeaks on the glass and a name
comes in the mist, the first knocks, the typewriter starts), then your head turns to it.

### Found cards and pacing (sections 3c, 3f)

In every cabinet but the first, one card of drawer 1 is not in the drawer: the one
least needed to start (a helper of a map puzzle, a younger telling, the last clipped
card, the half that fits a torn card). J.J.V.'s note on the envelope says where (its count
shows it short); pick it
up there (it comes up to be read, then it is in your hand) and bring it to the table.
Where depends on the order you play the cabinets in:

| cabinet played | the missing card | also |
|---|---|---|
| 1st (always Voortekenen) | none | the clock only wakes when drawer 3 opens |
| 2nd | on the seat of the armchair by the window (*"De vierde ligt waar ik hem gisteren neerlegde."*), or under the foot of the lamp (*"Eén ligt onder de lamp. Niet de lamp verzetten."*), and the lamp wobbles as you pull it out | |
| 3rd | in the pocket of J.J.V.'s coat, a corner sticking out (*"Eén zit in mijn jas. Jas laten hangen."*), or stuck in the typewriter (*"Eén zit nog in de machine."*; never when this cabinet's own lock is the typewriter) | its room lock is going already: once the first drawer's cards are put down, the window mists and the name comes, the knocking starts, or the typewriter types, long before drawer 3 |
| 4th | crumpled in the wastepaper basket, with no note: click it to smooth it out | as its first drawer opens, a card you filed earlier lies on the floor by the door, *"Die hoort niet in die la."* in another hand; it goes back into its own drawer. The envelope of that drawer has a line in that hand too: *"hij komt niet terug"* |

### The night

| cabinet | leak (grows every 3 minutes, three steps) | enactment when filed |
|---|---|---|
| 1 Voortekenen | the clock ticks too loudly and unevenly, louder and less even at each step; the escapement catches (a stuttered tick), the pendulum hangs and a beat is missed every 40, 20, 10 s. On the cabinet the drawers are knocked out of their runners on each missed beat, each at its own moment and a few centimetres, dropping back tilted (one, a row, all of them, each with its own knock), and at the third step the labels slip askew | the ticking stops; five seconds of silence; it goes on softly, from the hour you set |
| 2 Witte wieven | condensation on the window: a band round the frame and bars, then most of each pane, then all the glass, milky and visible across the room; the moonlight on the floor and the cold light from the window fade with it. Mist seeps out beside the cabinet and pools at its foot, rising with it: up the lowest drawers, then the next, to just under the drawers you work; at its sides it climbs higher | the mist clears; for two seconds the glass shows the room with the door standing open |
| 3 Weerwolven | something wolf-like goes along the ledge outside every 90, 45, 20 s, slowly, with claws on the zinc, its shadow crossing the moonlight and blocking the window's light; from the second step it stops at the glass on the way and breathes on it (1.6 s, then 3 s). Claw marks come on the cabinet's drawers as it passes, with a scratching there: scratches, gouges to the raw wood, then the plate hangs by one screw | it stands on the ledge, then goes; three knocks at the door; footsteps away over gravel |
| 4 Spoken | the lamp flickers in short bursts wherever you are and whatever you face, every 8–14 s, then 4–8 s, then 1.5–4 s, the hum stuttering with it; it dims while you move or turn, more at each step (to 40, 25, 10 %), and comes back slowly after you stop; from the second step it falters on the way down. Frost spreads over the cabinet while the lamp is down: on the brass plate (and creeping round onto its sides), over the wood of the front and further over the sides, and at the third step your breath shows when you stand at it | the lamp goes out; when it comes back the desk card lies on the table: dated 1936, told by *de vorige assistent*, *"Niet lezen. Opbergen."* It goes into any drawer |
| 5 De duivel | — | locked with a four-digit dial: the digits of cabinets 1 to 4, from their room locks |

Cabinet 1 comes first (drawer 1 its easiest map or torn card); its misfiled card opens
one of the others, whose own misfiled card opens the next: a chain 1 → a → b → c → 5.
Each night shows P2, P4, P5 and one of P1/P6 in the drawers 1. Past the tutorial,
misfiled cards have no red-pencil numbers ("nog niet ingedeeld"), so they have to be
read; the missing place of a map puzzle is no longer in the middle of its three; and
more of the fronts are in dialect.

### Two endings

- **Open cabinet 5.** In its Varia drawer is one card, dated tomorrow, told by J.J.V.:
  a new assistant stayed late to finish the filing and was not seen again, *"…en wat de
  assistent daar zag, dat was ____."* Type one word into it: any answer you got right
  tonight, your name, or *niets*, *mij*, *mijzelf*, *de assistent*, *de vorige
  assistent*. The card goes home,
  the clock strikes twelve, and the door opens on a grey morning. The last screen is
  your card in the house format: you as narrator, the date and your time, a catalogue
  code from the seed, and the citation to the Verhalenbank. Save it as a PNG. Its back
  (**Achterkant**) lists every card you read tonight, puzzle and archive alike, each
  linking to its own page in the Verhalenbank: *"12 kaarten gelezen. Nog 9647 in deze
  kasten."*
- **Leave it shut.** With four cabinets done, stand at the door for a minute without
  opening the fifth: the lamp goes out, the clock strikes nine, the door opens. *"Goed
  gedaan. Kast vijf blijft dicht."* No card.

### Why 1983

The spec sets the night in 1983 (today's date, in 1983). Almost all the stories in the
corpus were recorded between 1950 and 1975; the seven recorded after 1983 are left out.

## What's generated, what's authored

**Authored once** (`pipeline/frame.py`): J.J.V.'s note, the trail notes, his reactions,
the desk card, the card in cabinet 5, the closing lines; plus the type index (`pipeline/typeindex.py`, the drawer
headings), the motif lexicon (`lexicon.py`, `entities.py`) and the hand-kept alias
file (`aliases.yaml`). Everything else is generated from the dump.

### The room

The room is modelled, textured and lit in Blender by scripts in `blender/`, and
exported for the game. Nothing is modelled by hand: `blender/build.py` builds it.

- **Built from scratch:** the architecture (herringbone floor, panelled wainscot,
  mouldings, beams, window with sashes and curtain, radiator, door and corridor),
  the five card cabinets with their 120 drawers (cabinet V's bar and lock are made in
  the game), the reading table and chairs, the
  banker's lamp, the wall clock, the steel archive shelving with its labelled boxes, the
  pin board, the coat stand, the typewriter's body, a reel-to-reel tape recorder with
  its tapes on the side desk (the collectors' tool), a woven wastepaper basket, the oak
  bookcase by the door with its lever arch files and archive boxes, and the taped
  removal boxes waiting by the window.
- **CC0 props from Poly Haven:** encyclopaedias, armchair, side table,
  cassette recorder, office desk, pendant lamps, magnifying glass, stapler,
  binder, clipboard, picture frames and a suitcase. The five copies of the
  encyclopaedia are bound in different cloths in the game (`scenery.js`), and read from a
  softer level of their mipmaps, so the gilt titles do not crawl.
- **CC0 texture sets:** the surfaces use scanned textures from Poly Haven and
  ambientCG. What the game builds itself in wood or cardboard (the card tray, the
  drawers' bodies, the box of halves) uses the same sets, at their real size.
- **On the walls** (made in the game, `game/js/prints.js`): four sheets of the
  *Volkskunde-atlas voor Nederland en Vlaams-België* (Meertens and De Meyer), pinned
  up like working maps: two Weerwolf sheets across from cabinet III, Duivel on the
  window wall by cabinet V, Kabouter on the door wall. Click one to read it. The scans
  are in `data/meertens-maps/`, reduced copies in `game/models/prints/`. On the pin
  board by the door: a calendar of tonight's month in 1983, a notice to the staff, a
  newspaper clipping, and the torn corners of notes taken down.

The light is baked in Cycles, in two layers per surface: the desk lamp alone, and
everything else (moonlight at the window, the corridor, the night). The game adds
the two layers, so the lamp can flicker without the rest of the room flickering
with it.
- **Flat surfaces:** get lightmaps, three 2048px atlases.
- **Dense imported models:** get their light in vertex colours.
- **What moves or is drawn by the game** (cards, pins, keys, the carriage, labels):
  lit live by lights that match the bake.
- **Reflections:** come from a capture of the room taken when the game starts.
- **Moonlight:** the game adds a cool fill that comes in at the window and fades down
  the room, the window's panes as a patch on the floor, and the corridor lamp's strip
  under the door (`buildNightLight` in `room.js`); the bake alone leaves the far end
  black.
- **Outside the window:** the far side of the canal, drawn by a shader on a plane 22 m
  back so it shifts as you walk: gabled houses with a few lit windows (and one
  television), quay lamps, bare elms, the water. While the witte wieven leak, mist rises
  off it too; in the morning it all goes grey.
- **Before baking**, long edges of the architecture are cut into metre lengths: a wall
  that is one 15 m quad bakes into blotches.
- **Walls and ceiling** are clean distemper: `blender/derive.py` makes `clean_plaster`
  from Poly Haven's painted plaster at the start of a build, keeping the trowel grain
  and taking out the stains and dark specks, which repeated every 2 m and read as dirt.
  Walls are cream, the ceiling whiter; the window joinery and radiator are plain
  yellowed gloss paint.

```
blender/fetch_assets.py ─► blender/assets/      (CC0 textures and models, build input only)
blender/build.py        ─► game/models/room.glb, room.json, lm_*.webp, tex/*.webp
```

**Generated:** every drawer, by the puzzle pipeline (section 5 of the spec). It runs
on the Python standard library alone, so its derived tables are JSON Lines in
`data/derived/` rather than parquet; each script reads them and writes one.

```
audit.py          fill rates of every field in data/spooky.sqlite
t1_spooky.py      spooky.jsonl             the subset S: 10,434 located, dated legends a cabinet takes
t2_embeddings.py  embeddings.jsonl         the dump's bge-m3 vectors, projected to 256 dimensions
t3_families.py    families.jsonl           same legend, several tellings: type, province, embedding
t4_entities.py    entities.jsonl, idf.json things, animals, trades, buildings, numbers, times, colours
t5_geo.py         geo.jsonl                place names from the coordinates, with a confidence
t6_cabinets.py    cabinet_assignment.jsonl story -> cabinet 1-5
generate.py       instances.jsonl          every puzzle type and room lock (R1-R4), validated; yield report; preview.html
assemble.py       game/data/bundles/*.json one night per seed (section 4); bundle_preview.html
check_bundle.py                            every drawer re-solved from the bundle alone
export.py         game/data/archive/       the archive behind the dividers (3h): a chunk per cabinet, geo.bin for the map's dots
test_solvers.py                            the P1, P6, R1 and R3 solvers on synthetic cases
```

Tunable constants are in `pipeline/config.py`. Word and number answers reach the game
only as salted SHA-256 hashes; the client hashes what is typed or dialled and compares.

## Rebuilding

```sh
pipeline/fetch_geo.sh             # once: GeoNames NL + Natural Earth layers into data/geo/
python3 pipeline/geo.py           # wall map geometry and gazetteer for the game
python3 pipeline/audit.py         # the field audit
for t in t1_spooky t2_embeddings t3_families t4_entities t5_geo t6_cabinets; do python3 pipeline/$t.py; done
python3 pipeline/test_solvers.py  # the solvers, before the generators
python3 pipeline/generate.py      # about a minute
python3 pipeline/assemble.py
python3 pipeline/check_bundle.py  # every bundle; or one, verbosely: check_bundle.py 1001
python3 pipeline/export.py        # the archive: 9.7k stories, a chunk per cabinet (0.2-2.6 MB), the map's dots

python3 blender/fetch_assets.py                     # once: CC0 textures and models
Blender -b -P blender/build.py -- --bake --export   # the room, its light, the export (about 1 min on an M4)
Blender -b -P blender/build.py -- --preview room,table --ev 2.5   # Cycles stills into blender/preview/
```

`Blender` is the Blender 5.1 executable (on macOS
`/Applications/Blender.app/Contents/MacOS/Blender`). The room's measurements live in
`blender/layout.py` and must agree with the constants in `game/js/room.js`,
`door.js`, `mapwall.js` and `typewriter.js`.

## Files

```
game/index.html            page, overlays
game/css/style.css
game/js/main.js            boot, renderer, title card
game/js/admin.js           the ?admin test panel
game/js/bundle.js          loads a night's bundle; normalising and hashing answers
game/js/game.js            the night: drawer states, envelopes (taken, opened, sealed, inserted, spiked), the hand, filing, the locks and room locks, enactments, the trail, hints, the clock, save/resume, both endings
game/js/room.js            measurements; drawer labels and plates, the lamp's live light, clock face, window
game/js/scenery.js         loads the Blender room and gives baked surfaces their light
game/js/cardface.js        filing cards drawn on canvas in the house style
game/js/cards3d.js         cards (and envelopes, with their flap) as objects in the room: index tabs, held in the hand, standing in the tray
game/js/archive.js         the archive behind the dividers: chunks loaded on demand, grey cards and tabs in the drawer slid out
game/js/mapwall.js         the wall map, its pins, and every story in the archive as a dot
game/js/typewriter.js      the typewriter and its paper
game/js/door.js            the door
game/js/lock.js            cabinet 5: the bar and its four digit rings
game/js/tablekit.js        the P6 strongbox, the P4 box of loose halves, the envelope's tray, the bill spike
game/js/prints.js          the Volkskunde-atlas sheets on the walls, and what is pinned to the board by the door
game/js/rails.js           walking about (keys, clicks, dragging to look), stations and eased walks to them
game/js/audio.js           sound: synthesised, except cards and envelopes (recordings in game/sounds/)
game/js/voice.js           subtitles, a line at a time
game/js/atmos.js           the four leaks (growing, and their silencing), the window's writing and mirror, the knocking, the lamp, morning
game/js/leaks.js           each leak's half on its own cabinet: jolting drawers, mist at its foot, claw marks, frost and breath
game/js/post.js            grain, vignette, a little bloom
game/data/bundles/         one night per seed, made by the pipeline
game/models/               the exported room, lightmaps and texture sets
game/sounds/               card and envelope recordings (Kenney, CC0), trimmed and levelled
game/models/beast.png      the creature at the window: six frames of Muybridge's walking mastiff (pipeline/beast/)
blender/                   the room: layout, materials, architecture, furniture, props, bake, export
pipeline/                  the puzzle pipeline (above), geography, type index, lexicon, frame
```

## Sources

- Stories: Nederlandse Volksverhalenbank, Meertens Instituut (KNAW),
  www.verhalenbank.nl (dump in `data/`).
- Volkskunde-atlas voor Nederland en Vlaams-België, sheets 6, 7, 13 and 15: scans from
  the Meertens Instituut (`data/meertens-maps/`).
- Gazetteer: GeoNames (CC BY 4.0). Map geometry: Natural Earth (public domain).
- Textures and models: Poly Haven (polyhaven.com) and ambientCG (ambientcg.com), CC0.
- Card and envelope sounds: Kenney (kenney.nl), Casino Audio and RPG Audio, CC0.
- The creature at the window: Eadweard Muybridge, *Animal Locomotion* (1887), "A mastiff
  walking", Wellcome Collection, public domain.
- Fonts: Special Elite, Homemade Apple, IM Fell English (Google Fonts). Three.js r160.
