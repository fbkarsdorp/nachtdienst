# Nachtdienst — puzzle & content specification (v2)

Spec for filling the existing five-cabinet archive room with a playable escape game built from the scary stories of the Dutch Folktale Database (Verhalenbank). Written for an implementing agent. The room, cabinets, table, map, typewriter, clock, window, lamp, door and coat hook exist (or are to be added) as a three.js scene; this document specifies what goes *in* them.

Read fully before coding. Sections 1–4 are fixed design. Section 5 (data) contains assumptions marked `ASSUMPTION` that must be verified against the local dump before the pipeline is written. Section 9 is the build order.

**v2 changes:** each cabinet now has two card puzzles and one *room lock* (an object in the room is the lock), one *found card* outside the drawer, an *enactment* when the cabinet is completed, and the misfiled cards form a *narrator trail*. Section 3b defines refiling. Section 3f defines pacing by the player's n-th cabinet.

---

## 1. Premise and player role

- Year 1983. The player is the new assistant at the Centraal Sagenarchief (an invented archive). The collector, **J.J.V.**, has gone home. A note on the reading table reads:

  > *Twaalf enveloppen invoegen. Kast vijf blijft dicht. Sluit af vóór twaalven. — J.J.V.*

- The note is impaled on the bill spike on the reading table; the night's envelopes will pile on top of it. The front-door key is in J.J.V.'s coat, supposedly on the Amsterdam tram. The clock reads 21:15. The player's job is to insert twelve envelopes of incoming cards into four cabinets. Each cabinet has three drawers: two card puzzles and one room lock.
- **Rule of the room (never explained, only shown):** cards out of order *leak*. While a cabinet has drawers that are not filed, its ambient effect is active and grows. Filing all three drawers of a cabinet silences it, triggers its enactment, and prints one digit on its label. Solving a lock is *knowing*; shutting the drawer is *filing*. Only filing counts.
- Cabinet five is locked with a four-digit dial. Opening it against instructions is the ending (Section 7).

The player's verbs, and the only ones: **open/shut** a drawer, **read** a card, **lay cards on the table** (max 4), **carry** an envelope or a single card to a cabinet or a room object, **pin** a place on the wall map, **type** on the typewriter, **pick up** a card found in the room. No inventory beyond the table and the one thing in the hand, no item combination, no hidden objects other than found cards.

Design principle for everything below: **every solved puzzle changes something the player can see or hear, and at least one puzzle per cabinet starts somewhere other than a drawer.**

## 2. The five cabinets

| # | Label | Subgenre filter | Ambient effect (grows while unfiled) | Room lock (drawer 3) | Enactment on completion |
|---|---|---|---|---|---|
| 1 | Voortekenen | omens, death portents, knocking, stopped clocks, animals foreseeing death | clock ticks too loudly; skips a beat every 40 s → 20 s → 10 s. *On the cabinet:* its drawers are knocked out of their runners on each missed beat, each on its own, once or a few times, a few centimetres, and drop back tilted — one drawer, then a row, then all of them; at step 3 the labels slip askew | **R1 De klok** — it has stopped; which card? | the ticking stops; five seconds of silence; it resumes at normal volume, from the hour the player set |
| 2 | Witte wieven | witte wieven, mist spirits, mounds, barrows | mist on the window thickens in three steps. *On the cabinet:* mist seeps out at its sides and pools at its foot, rising with the window's — up the lowest drawers, the next, to just under the puzzle row; at its sides it climbs higher | **R2 Het raam** — a name in the condensation | mist clears; for two seconds the glass reflects the room with the door standing open; then the reflection is normal |
| 3 | Weerwolven | werewolves, shape-shifting, animal transformation | a shape passes the window every 90 s → 45 s → 20 s. *On the cabinet:* claw marks on its drawer fronts as the shape passes — scratches, then gouges to the raw wood, then the brass plate hangs by one screw | **R3 De deur** — count the knocks | three knocks; then footsteps going away over gravel |
| 4 | Spoken | haunted houses, revenants, restless dead, phantom coaches | the lamp flickers in bursts wherever the player is, more often each step, and dims while moving between stations, more each step. *On the cabinet:* frost, spreading while the lamp is down — on the brass plate and round the corners onto its sides, then over the wood, front and sides, then the player's breath shows when standing at it | **R4 De schrijfmachine** — it typed on its own | the lamp goes out; when it comes back the **desk card** (Section 7) lies on the table |
| 5 | De duivel | the devil at cards, crossroads, black dogs, pacts | — (locked until 4 digits known) | the dial | the ending |

Cabinet 1 must be played first (tutorial). Cabinets 2–4 are unlocked by the P3 trail (Section 3d): cabinet 1's misfiled card unlocks one of them, that cabinet's misfiled card unlocks the next, and so on. The chain is seed-determined; the player experiences it as free choice with a push.

Drawers within a cabinet open in order 1 → 2 → 3; drawer 3 (the room lock) only opens when drawers 1 and 2 are filed.

## 3. Card puzzles (drawers 1 and 2)

Five by-construction types (phase 1) and two solver-backed types (phase 2). Every puzzle has: a **fiction**, **drawer contents**, **player actions**, a **lock** (how the answer is submitted and checked), a **generation rule**, a **validation rule**, and a **hint ladder** of exactly three hints as J.J.V.'s pencil notes.

All in-game text is Dutch. UI chrome may be bilingual; card text and J.J.V. notes are Dutch only.

### P1 — Het losse etiket (common entity) — *phase 2, solver-backed*

- **Fiction:** the drawer's label has rubbed off. Four cards all mention one and the same thing; that thing is the label.
- **Drawer contents:** 4 cards from one legend family. Visible: description (standard Dutch), place, year, catalogue code. Note: *"Alle vier noemen ze hetzelfde ding. Dat wordt het etiket. Niet 'een beest' schrijven."*
- **Lock:** `word` on the typewriter. On success a new label prints on the drawer.
- **Generation:** per family, per 4-combination: intersect extracted entities of kinds `{object, animal, profession, building}`, keep lemmas with `idf > IDF_FLOOR`; accept iff exactly one.
- **Validation (solver):** receives only the four rendered descriptions, re-extracts, intersects, applies the floor, must return exactly `{answer}`. Must not reuse the generator's entity table.
- **Hints:** *"Lees de vier nog eens. Let op wat er in elk van de vier vóórkomt, niet op wat erin gebeurt."* / *"Het is een {kind_nl}."* / *"Begint met een {letter}. {len} letters."*

### P2 — De kaart zonder plaats (pin the place) — *phase 1*

- **Fiction:** one card has no place. J.J.V. clipped it to three others: *"Zonder plaats. Ergens tussen de andere drie. Prik hem op de kaart."*
- **Drawer contents:** 1 target (place shown as `——`), 3 helpers with places. All show description, year, code.
- **Player actions:** lay helpers on the table (their places pin grey on the map automatically); drop a red pin.
- **Lock:** `place`: haversine(pin, target) ≤ `PIN_RADIUS_KM` (default 6). On success the pin turns black and the target's place types itself in.
- **Generation:** family with ≥4 geocoded stories (confidence ≥ 0.9); helpers within 25 km of target; four distinct place names.
- **Validation:** target inside the helpers' convex hull or within 8 km of their centroid; no gazetteer place within `PIN_RADIUS_KM` of the target that appears on any card in the drawer.
- **Hints:** *"Drie plaatsen staan er al. De vierde ligt daartussen."* / *"Binnen {n} uur lopen van {nearest helper}."* ({n} = distance / 5 km, rounded up) / *"Zoek {target} op de kaart."*

### P3 — De verdwaalde kaart (misfiled card) — *phase 1, the trail*

- **Fiction:** four cards; one belongs in another cabinet. Note: *"Eén hoort hier niet. Terug naar zijn eigen kast."*
- **Drawer contents:** 3 cards from one family in this cabinet's subgenre + 1 intruder from the *destination cabinet's* subgenre (destination fixed by the trail chain, Section 3d). All show description, place, year, code; the intruder's code prefix differs.
- **Player actions:** carry the intruder to the destination cabinet and drop it on the cabinet.
- **Lock:** `card_to_cabinet`. Wrong card or wrong cabinet: card returns, note *"Nee."* Success: the destination cabinet unlocks (its drawer 1 slides open a hand's width), the intruder slides into it, and the **trail note** for this step appears on the intruder as it goes (Section 3d).
- **Generation:** trio from one family; intruder from the destination cabinet's stories, among the 20 nearest by embedding to the trio centroid.
- **Validation:** intruder's code prefix differs from all three; intruder's cosine distance to the trio centroid exceeds the max trio-member distance by ≥ `OUTLIER_MARGIN` (0.15).
- **Hints:** *"Kijk naar de nummers in rood potlood."* / *"Drie kaarten vertellen in wezen hetzelfde. De vierde niet."* / *"De kaart over {intruder place} hoort bij de {destination label}."*

### P4 — De gescheurde kaart (torn card) — *phase 1*

- **Fiction:** a card torn in half. Top half in the envelope; bottom half in the loose box on the table. Note: *"Doorgescheurd. De rest ligt in de doos op tafel."*
- **Drawer contents:** the top half (place, year, code, text before the split). Loose box: the true bottom + 11 distractors from the same subgenre with similar codes.
- **Lock:** `card_match`: drop the right bottom on the top; wrong halves spring apart.
- **Generation:** description ≥ 60 words; split at the sentence boundary nearest 35%; distractors share the code's type number/prefix.
- **Validation:** true bottom identifiable by (a) an entity present in both halves and in no distractor, or (b) mid-sentence continuation (then split mid-sentence). Prefer (a).
- **Hints:** *"Lees het bovenste stuk tot het laatste woord. Wat wordt er al genoemd?"* / *"Het onderste stuk noemt {entity} opnieuw."* / *"Het nummer is {code}. Er zijn er {k} met dat nummer in de doos."* ({k} computed from the box contents; one fixed template, no conditional)

### P5 — De oudste zegsman (earliest witness) — *phase 1*

- **Fiction:** three accounts disagree on one detail; a summary card has a blank. Note: *"De vertellers spreken elkaar tegen. Houd de oudste aan."*
- **Drawer contents:** 3 variants (year shown) + summary card: *"Te {place} werd omstreeks {year} een {slot kind} gezien: ____."*
- **Lock:** `word`; accepted = spelling variants of the oldest card's slot value.
- **Generation:** family, ≥3 distinct years, one slot (animal / object / number / time-of-day / colour) filled differently on each.
- **Validation:** values pairwise distinct after normalization; oldest year unique; the value occurs exactly once on the oldest card.
- **Hints:** *"Kijk naar de jaartallen."* / *"De oudste is uit {year}."* / *"Op die kaart staat een {slot kind}. Welk?"* (*Welke?* for a colour)

### P6 — De cijfers (number lock) — *phase 2, solver-backed*

- **Fiction:** a strongbox with a three-digit dial; three cards clipped to it in order, each with one number. Note: *"Elk verhaal één getal. In deze volgorde."*
- **Lock:** `number3`.
- **Generation:** three stories whose numeral extraction yields exactly one number in 1–12 each.
- **Validation (solver):** re-extract from rendered descriptions; exactly one in-range number each.
- **Hints:** *"Elk verhaal telt."* / *"Het eerste getal is {n}."* / *"{n} — {m} — {k}."*

### P7 — De volgorde (ordering) — *phase 1, filler*

- Five cards with distinct years, shuffled; drag into the rack in order of recording. Lock `order`. Used only when a cabinet's drawer 1 has no other acceptable instance.

## 3a. Room locks (drawer 3 of each cabinet)

Authored mechanics with generated parameters. Each is bound to a room object, which becomes the lock. Drawer 3 contains the cards the room lock refers to; the object is already "active" when the drawer opens (or earlier, Section 3f).

### R1 — De klok (cabinet 1)

- **Fiction:** the clock has stopped — the ticking (cabinet 1's ambient effect) cuts out when drawer 3's envelope is taken, and the hands stand at some hour. A clock stopping by itself is the oldest omen in the cabinet. Note: *"De klok is blijven staan. Het staat op een van de kaarten. Die kaart in de klokkenkast."* This is the one room lock whose note spells out the gesture; the player learns it here and reuses it at the window and the door.
- **Drawer contents:** 6 omen cards, each with exactly one clock hour (a clock stopping, a bell, a knock at an hour), all distinct; one matches the face.
- **Player actions:** read the face; find the card; walk to the clock; open the little door of the case; lay the card inside.
- **Lock:** `card_to_object` (object `clock`). Wrong card: the case door swings back open and the card slides out. Success: the case door shuts, the hands swing round by themselves to the right time, the pendulum starts, ticking returns at normal volume; cards return to the envelope.
- **Generation:** six stories from cabinet 1's pool whose time-of-day extraction yields exactly one clock hour (1–12) each, all distinct; `hour` = one of them. The clock's stopped position is `hour`.
- **Validation:** re-extract from rendered text: exactly one hour per card; six distinct.
- **Hints:** *"Kijk hoe laat hij stilstaat."* / *"Eén kaart noemt dat uur."* / *"{hour} uur. In de kast van de klok."*

**Principle shared by all four room locks** (learned at R1): *the archive leaks stories into the room; find which story the room is telling and give it back.* The clock stops at an hour from a card; the window writes a place from a card; the door knocks a number from a card; the typewriter types the beginning of a card.

### R2 — Het raam (cabinet 2)

- **Fiction:** the mist has reached the top of the window. Written in the condensation, mirrored (written from outside), is a place name. Note: *"Er staat iets op het raam. Niet afvegen."*
- **Drawer contents:** 6 witte-wieven cards with six distinct places; one is the place on the window.
- **Player actions:** read the window (mirrored text; moving to the window station flips the camera so it reads correctly for a second, then flips back — the player must hold the thought); find the card; drop it on the windowsill.
- **Lock:** `card_to_object` (object `window`). Wrong card: it slides off the sill. Success: the mist recedes one step and the name fades; cards stack.
- **Generation:** six stories from cabinet 2's pool with distinct geocoded places; `target` = one of them, preferring names of 5–9 letters.
- **Validation:** six distinct normalized place names; the target name does not occur in any other card's description.
- **Hints:** *"Lees het van achteren naar voren."* / *"Het begint met een {letter}."* / *"{place}. Leg die kaart op de vensterbank."*

### R3 — De deur (cabinet 3)

- **Fiction:** something knocks at the door, `n` times, every 30 s. Note: *"Als er geklopt wordt: tel. Die kaart onder de deur."*
- **Drawer contents:** 6 werewolf/transformation cards, each with exactly one small number in its text (knocks, nights, times, bullets), all distinct; one equals `n`.
- **Player actions:** listen and count (the knocks are also faintly visible as the door shivering); find the card; drop it at the foot of the door.
- **Lock:** `card_to_object` (object `door`). Success: the knocking stops for good; the card is gone; cards stack. Wrong card: it is pushed back out from under the door.
- **Generation:** six stories from cabinet 3's pool with exactly one numeral in 2–7 each, all distinct; `n` = one of them.
- **Validation:** re-extract; exactly one in-range number per card; all distinct.
- **Hints:** *"Wacht op het kloppen. Tel het."* / *"Een {oneven|even} getal."* / *"{n} keer. Die kaart."*

### R4 — De schrijfmachine (cabinet 4)

- **Fiction:** the player returns to the table and the typewriter has typed the top half of a card by itself, with the carriage still moving. The machine itself types, after the half card: *— vervolg in la 3 —*. Note on the envelope, in pencil, written before he left: *"Als de machine begint: laten uittikken. Het vervolg zit hierin."*
- **Drawer contents:** drawer 3 holds 6 bottom halves; one continues the typed top.
- **Player actions:** read the typed half in the machine; find the continuation; drop it on the typewriter.
- **Lock:** `card_match` on the typewriter. Success: the machine types the final line itself: the **narrator line** of the trail (Section 3d), then the bell; the fused card and the five others stack.
- **Generation & validation:** as P4, but with 6 candidates instead of 12 and the top half rendered as typewriter text rather than a card.
- **Hints:** *"Lees wat de machine getypt heeft, tot het laatste woord."* / *"Het vervolg noemt {entity} opnieuw."* / *"Het nummer is {code}. Er zijn er maar {k} in de envelop."*

Room-lock objects also exist when their cabinet is not active: the clock ticks, the window mists lightly, the door is silent, the typewriter is idle. They only become puzzles when their drawer 3 opens (or by Section 3f).

## 3b. Refiling — what happens after a lock opens

**The envelope.** The puzzle cards of a drawer are not loose in it: they arrive in a manila **envelope** clipped to the drawer's front, stamped *IN TE VOEGEN — la 2-1*, with J.J.V.'s note written on it and a card count in the corner (*4*). These are incoming records awaiting insertion into the archive behind the divider (Section 3h). The puzzle is what the assistant has to establish before the cards can be inserted; filing is the insertion.

Every drawer has four states: **shut** → **open** (envelope taken) → **solved** (lock opened) → **filed** (cards inserted, drawer shut). Only *filed* counts. Scene, state model and bundle use these names.

1. Success feedback.
2. All cards whose `home` is this drawer, wherever they are, slide back **into the envelope** on the table; the flap closes; a tick appears next to the count. Changed cards show their new state. The envelope is the stack: one object, one gesture.
3. The player carries the envelope to its cabinet, slides the drawer out, and drops the envelope on it. The cards fan out of the envelope into the archive behind the divider, each finding its slot (0.5 s, with a riffle sound). The drawer is pushed shut (click; or auto-shut after 1.5 s). → *filed*.
4. The emptied envelope is stamped *INGEVOEGD* and goes onto the **spike** on the table — a bill spike that accumulates the night's envelopes and is the only progress indicator in the game.
5. When all three drawers of a cabinet are *filed*: ambient effect stops, the enactment plays (Section 2), the digit prints.

**The count on the envelope is live.** Cards that leave the envelope for good (the P3 intruder, the R3 door card) lower it (*4* → *3*), so the player never looks for a card that is meant to be gone. A found card (3c) makes the envelope arrive one short: the printed count is *4* but the envelope holds 3, and the note says where the fourth is.

| Type | Goes back into the envelope | Goes elsewhere |
|---|---|---|
| P1 | 4 cards; the drawer's new label is also printed on insertion | — |
| P2 | 4 cards, target with place filled | the pin stays on the map, black |
| P3 | the 3 family cards | the intruder was inserted directly into the destination cabinet |
| P4 | the fused card (visible tear line) | distractors return to the loose box by themselves |
| P5 | 3 variants + completed summary | — |
| P6 | 3 cards, strongbox open | — |
| P7 | 5 cards in order | — |
| R1 | 3 cards | — |
| R2 | 5 cards + the sill card (it comes back damp) | — |
| R3 | 5 cards | the door card is gone |
| R4 | fused card + 5 others | — |
| desk card | arrives in no envelope; may be inserted into any drawer of any cabinet, accepted silently | — |
| cabinet 5 | one sealed envelope with no count, the fourth trail card's place name on it | — |

**Refusals** (envelope or card slides back, note on it): envelope to its drawer before the lock is solved: *"Nog niet."* Envelope to the wrong drawer: *"Nee."* Envelope with a card missing (left on the table): the flap won't close; the count shows *3/4*. A single puzzle card dropped on a drawer (other than the intruder and the desk card): *"In de envelop."*

**Cabinet physics:** one envelope out at a time (the table holds one); drawers open in order 1→2→3 within a cabinet. Drawers slide out in place for insertion and for browsing the archive (3h); a filed drawer's inserted cards lift into the reading view but cannot be taken out again.

## 3c. Found cards

In every cabinet except the player's first, one card of drawer 1's puzzle is **not in the envelope**. J.J.V.'s note on the envelope says where, his way. Locations, assigned by the scene according to Section 3f:

| Location key | Where | Note | Interaction |
|---|---|---|---|
| `chair` | on the seat of the reading chair | *"Eén ligt waar ik hem gisteren neerlegde."* | pick up |
| `lamp` | under the foot of the lamp | *"Eén ligt onder de lamp. Niet de lamp verzetten."* | pick up; the lamp wobbles |
| `coat` | in the pocket of the coat on the hook (so he did not take his coat — the key was never on the tram) | *"Eén zit in mijn jas. Jas laten hangen."* | click the pocket |
| `typewriter` | already in the machine | *"Eén zit nog in de machine."* | pull it out |
| `bin` | crumpled in the wastepaper basket | no note (he threw it away; the trail note explains, Section 3d) | pick up, click to smooth |
| `floor` | on the floor by the door — a card the player already filed, now out again | no note; in another hand: *"Die hoort niet in die la."* | pick up; it goes back to its own drawer |

Bundle: drawer 1 of each cabinet has `found_card: {card_id, location}`; cabinet 1 has none. `floor` is special: it is not a puzzle card but a scene-side event in the player's 4th cabinet (Section 3f), and `card_id` is chosen at runtime from already-filed cards.

## 3d. The narrator trail

The four P3 intruders are not random. The trail is **authored** (four notes) and attached to **generated** cards: the intruder in each step gets the trail note of that step, revealed as it slides into its destination cabinet.

Chain: cabinet 1 → a → b → c (a, b, c a seed-determined permutation of 2, 3, 4); c's intruder belongs to **cabinet 5** and is accepted through the slot in its locked front.

| Step | From → to | Trail note (pencil, on the intruder as it goes) |
|---|---|---|
| 1 | 1 → a | *"Niet door mij opgetekend. Mijn vorige assistent."* |
| 2 | a → b | *"Zelfde hand. Hij werkte 's avonds door."* |
| 3 | b → c | *"Zijn laatste. Daarna geen kaarten meer van hem."* |
| 4 | c → 5 | *"Deze heeft hij niet opgeborgen. Ik ook niet."* |

R4 (the typewriter) types the narrator line that ties it: *"Zegsman: de vorige assistent."* The desk card and card five (Section 7) complete it. Nothing else explains it.

Assembly constraint: the four intruders should, when possible, share a narrator value or a collector value in the data; if the dump supports it, prefer intruders whose narrator field is identical. If not supported, no constraint — the notes carry the trail.

## 3e. J.J.V. reacts; the leak grows

**Reactions** — short notes that appear on the top card on the table (or on the drawer if the table is empty), once each:

| Trigger | Note |
|---|---|
| reopening a filed drawer | *"Die was klaar."* |
| a cabinet open > 4 min without progress | *"Opschieten."* |
| reading the desk card | *"Ik had gezegd: niet lezen."* |
| a wrong typewriter answer, 3rd time in a row | *"Het staat er. Lees."* |
| the player's 4th cabinet, first drawer opened | in another hand, smaller: *"hij komt niet terug"* |
| standing at cabinet 5 before the digits are known | *"Dicht."* |

**Leak escalation** — each cabinet's ambient effect has three intensities (Section 2), in the room and on the cabinet itself, in step with each other; intensity rises one step every 3 minutes the cabinet stays unfiled. Each filed drawer that is not the last takes it back down a step (the 3-minute clock keeps running) and the cabinet's effect visibly shrinks back for a moment. When the last drawer is filed the effect on the cabinet clears first, in front of the player standing at it; then the head turns to the room's half as it stops and the enactment plays. Never blocks play; never louder than the typewriter bell.

## 3f. Pacing by the player's n-th cabinet

Order of cabinets 2–4 is the player's, so escalations attach to the *n-th cabinet played*, not to a fixed cabinet. The scene counts.

| n-th cabinet | What is different |
|---|---|
| 1st (always cabinet 1) | no found card; the clock stops only when drawer 3's envelope is taken; short enactment |
| 2nd | found card at `chair` or `lamp` |
| 3rd | the room lock is **already active on entering** (knocking has started / the typewriter is typing / the window is fully misted / the clock is wrong) before drawer 3 is reached; found card at `coat` or `typewriter` |
| 4th | found card at `bin`; the `floor` event (a filed card lies by the door) fires when drawer 1 opens; the other-hand note (3e) appears |

## 3g. Envelope handling — how cards reach the table and return

The cabinets and the table are different stations. Cards never teleport; the **envelope comes to the table**, and the drawers stay in their cabinets.

**Taking an envelope.** At a cabinet station, click the envelope clipped to a drawer's front (drawers must be taken in order 1→2→3; the next envelope is greyed until the previous drawer is filed). The envelope lifts into the hand; the camera walks the rail to the table and lays it down in the envelope bay at the near edge, flap up. J.J.V.'s note is on the envelope and is readable the moment it lands — it is the puzzle prompt. Only one envelope can be out at a time; the other envelopes are inert while it is.

**Opening the envelope.** Click the flap: the cards slide out and stand upright in the bay, showing their top edges and tabs (place, year, code in red). Hover fans them. Click lifts one into the **reading view**: large, legible, with the front (typed standard-Dutch description, fields) and, on click, the back (the dialect original where the dump has one; otherwise blank with the collector's initials). From the reading view, *leg neer* drops the card into the next free table slot; clicking away stands it back in the bay. Dragging bay → slot also works. A fifth card replaces the oldest, which stands back up in the bay.

**The hand.** A single card can be picked up (click) and carried: click the destination — windowsill, foot of the door, another cabinet's front, the typewriter — and the rail walks there with the card held bottom-right in view. The hand holds one card or one envelope, never more; there is no inventory screen. Found cards are picked up the same way and carried to the table, where they join the bay.

**Returning.** After the lock opens, the cards slide back into the envelope (3b); it is now the only thing to carry. Click it, click its cabinet: the rail walks there; the drawer slides out in place; the envelope is dropped on it and the cards fan into the archive behind the divider; the drawer is pushed shut; the emptied envelope goes to the spike on the table on the walk back. Each drawer is therefore *fetch → work → return → shut*: two short rail walks (~1.5 s each). Ambient events (lamp dim, shape at the window) preferentially fire during walks, when the player is moving and looking.

**Room locks** use the same grammar: drawer 3's envelope comes to the table like any other; its answer leaves the table in the hand (R1, R2, R3), or the typewriter has started before the player returns (R4).

**P3 and unlocking.** The intruder is carried in the hand to the destination cabinet while its own envelope lies on the table; dropping it on the cabinet front inserts it directly (the drawer slides out, the card slips in behind the divider, the trail note shows as it goes) and the envelope's count drops by one. The destination's drawer-1 envelope un-greys as the signal; it can be taken only after the current envelope has been returned.

## 3h. The archive behind the game — showing what the Verhalenbank holds

Secondary to the game, and never in its way: nothing the player needs is hidden in the archive, and nothing in the archive can be mistaken for a puzzle card (puzzle cards are cream; archive cards are grey stock).

1. **Deep drawers.** Behind each drawer's divider the drawer is full: the real cards of that cabinet's subgenre — hundreds of tabs with real places, years and codes. Sliding a drawer out at its cabinet shows the divider and the tabs behind it; any card can be lifted into the reading view, front and back. Tabs are instanced geometry; card text loads on demand from `public/archive/cabinet-N.json` (id, place, year, code, description, original), one chunk per cabinet, a few MB each, fetched when the cabinet is first opened. J.J.V.'s note on the first divider: *"Achter het schot hoef je vannacht niet."* Drawers 1–3 of a cabinet share one archive; the divider sits in whichever drawer is open.
2. **The map carries the archive.** Underneath the puzzle pins, every geocoded story in S is a faint dot — one point cloud, one draw call, from `public/archive/geo.bin` (lat, lon as float32 pairs). Hovering a cluster shows the place name and count. Puzzle pins in colour on top.
3. **Card backs.** The reading view's back shows the dialect original wherever the dump has one; this applies to puzzle and archive cards alike.
4. **The reading log.** The back of the player's own final card lists every card read tonight — place, year, code — each linking to its record on the live Verhalenbank (URL pattern from `config.py`), with: *"{n} kaarten gelezen. Nog {N − n} in deze kasten."*
5. **Dagdienst** *(after the first release)*: after either ending, a *Dagdienst* button returns to the same room in daylight — lamp off, window grey, no clock, every drawer open and browsable, the map at full density, the spike full. The game removed, the archive left. May link to the other Verhalenbank pieces.

Pipeline additions: `export.py` also writes the archive chunks and `geo.bin` from `spooky.parquet` + `cabinet_assignment.parquet` + `geo.parquet`. Only S is shipped, never the whole dump; descriptions are shipped as-is, originals only where present.

## 4. Cabinet composition

Each cabinet: drawer 1 = one of P2 / P4 / P5 / P7 (P1 / P6 in phase 2); drawer 2 = P3 (trail step); drawer 3 = its room lock. Constraints:

- Cabinet 1: drawer 1 is the lowest-difficulty P2 or P4 available; drawer 2's P3 destination = chain step 1.
- Across all drawers: story ids disjoint; no place name in more than two puzzles; drawer-1 types all different across the four cabinets (so the player sees P2, P4, P5 and one of P7/P1/P6 once each).
- P3 destinations follow the chain 1 → a → b → c → 5.
- Found-card assignment is by Section 3f and is done by the scene, but the bundle marks which card of drawer 1 is the found card (`found_card`), chosen as the card that is least necessary to *start* the puzzle (a helper in P2, a distractor-free card in P5, the top half never).

Assembly: greedy with random restarts over the pool of validated instances, seed-determined, until all constraints hold. Fail loudly if impossible for a seed; try the next.

## 5. Data model

`ASSUMPTION`: the dump provides per story — id, original text (often dialect), standard-Dutch description, place name, lat/lon (possibly partial), year, collector, narrator fields, subgenre, keywords, catalogue/type codes. **Verify fill rates first.**

Derived tables (one script each, one input → one output, cached, never recomputed inside puzzle code):

1. `spooky.parquet` — subset S (subgenre/keyword rules; classifier only as fallback). 10–20k rows.
2. `embeddings.parquet` — local model, float16, once.
3. `families.parquet` — cluster, then split by code prefix and region (≤ ~60 km). Keep size ≥ 3.
4. `entities.parquet` — per story `{kind: {lemma: count}}` for `object, animal, profession, building, person, number, time_of_day, colour`; global `idf`. Time-of-day extraction must yield clock hours (1–12) where a story says *"om twaalf uur"*, *"klokslag drie"*, *"tegen middernacht"* (= 12).
5. `geo.parquet` + `gazetteer.parquet` — place → lat/lon, confidence; ambiguous names at 0.5.
6. `cabinet_assignment.parquet` — story → cabinet by the Section 2 rules.

The puzzle generator reads only these.

## 6. Bundle format (contract between pipeline and scene)

### 6.1 Schema

```json
{
  "seed": 2026,
  "generated_at": "2026-10-21T06:00:00Z",
  "chain": [1, 3, 2, 4, 5],
  "frame": { "note_table": "...", "note_final": "...", "card_desk": {...}, "card_five": {...},
             "trail_notes": ["...", "...", "...", "..."], "reactions": {"reopen_filed": "...", "...": "..."} },
  "cabinets": [
    {
      "id": 1, "label": "Voortekenen", "digit": 7,
      "drawers": [
        {
          "id": "1-1", "type": "P2", "difficulty": 0.31,
          "note": "Zonder plaats. Ergens tussen de andere drie. Prik hem op de kaart.",
          "found_card": null,
          "cards": [
            { "id": "c1", "story_id": "VB123", "role": "target", "home": "1-1",
              "render": { "description": "...", "place": null, "year": 1912, "code": "SINSAG 0901" } },
            { "id": "c2", "story_id": "VB456", "role": "helper", "home": "1-1",
              "render": { "description": "...", "place": "Ruinen", "year": 1908, "code": "SINSAG 0901" },
              "geo": [52.76, 6.36] }
          ],
          "lock": { "kind": "place", "target_geo": [52.80, 6.40], "radius_km": 6 },
          "hints": ["...", "...", "..."],
          "on_success": { "fill_field": { "card": "c1", "field": "place", "value": "Pesse" },
                          "stack": ["c1", "c2", "c3", "c4"] }
        },
        { "id": "1-2", "type": "P3", "...": "...",
          "lock": { "kind": "card_to_cabinet", "card": "c7", "cabinet": 3 },
          "on_success": { "trail_note": 0, "unlock_cabinet": 3, "stack": ["c5", "c6", "c8"] } },
        { "id": "1-3", "type": "R1", "...": "...",
          "lock": { "kind": "card_to_object", "card": "c10", "object": "clock", "hour": 12 },
          "on_success": { "stack": ["c9", "c10", "c11"] } }
      ]
    }
  ]
}
```

Lock kinds:

| kind | payload | client check |
|---|---|---|
| `word` | `accepted_hashes`, `salt` | `sha256(salt + normalize(input)) ∈ accepted_hashes` |
| `number3` | `accepted_hashes`, `salt` | as `word` |
| `place` | `target_geo`, `radius_km` | haversine ≤ radius |
| `card_to_cabinet` | `card`, `cabinet` | id equality |
| `card_match` | `top_card`, `bottom_card` | id equality |
| `order` | `order: [ids]` | sequence equality |
| `card_to_object` | `card`, `object` (`clock` / `window` / `door`) | id equality |

`home` per card: a drawer id, `"cab:N"` for intruders (N = 5 allowed), `"any"` for the desk card. `on_success` may carry `stack` (always; the cards that return to the envelope), `fill_field`, `fuse`, `print_label` (P1; text derived client-side from the accepted input, never stored), `rack`, `trail_note` (index into `frame.trail_notes`), `unlock_cabinet`, `type_line` (R4: the narrator line the machine types).

Room-lock parameters (`hour` — the stopped position, `n`, the window place) and card ids are stored in plain text — unavoidable and acceptable; word and number answers are hashes only.

### 6.2 Normalization

`normalize(s)`: NFKD, strip diacritics, lowercase, trim, collapse whitespace, strip leading article (`de`, `het`, `een`, `'n`, `'t`), strip trailing punctuation. `accepted` = `{lemma, plural, spelling variants, surface form}` normalized then hashed; variants from the lemmatizer plus `aliases.yaml` (< 100 lines, the only hand-maintained pipeline content).

### 6.3 Hints

Three per drawer, from the templates above, slot-filled. Cost on the clock: +2 / +4 / +8 min. Completion time is the only score. No LLM pass in the first release.

### 6.4 Difficulty

```
difficulty = 0.4 * log(answer_space_size) + 0.3 * (rendered chars / 1500) + 0.3 * (1 - margin)
```
answer_space: P1 = union of entities; P2 = gazetteer places within 25 km; P3 = 4; P4 = 12; P5 = 3; P6 = 1728; P7 = 120; R1 = 6; R2 = 6; R3 = 6; R4 = 6. Used for ordering only.

## 7. Authored content (fixed, in `content/frame_nl.yaml`)

- `note_table` — the opening note (Section 1).
- `trail_notes` — the four notes of Section 3d.
- `reactions` — the notes of Section 3e.
- `card_desk` — appears on the table after cabinet 4's enactment. *Sage. Amsterdam. 1936. Zegsman: de vorige assistent.* A plain description of this room, the table, the lamp, "de assistent die 's avonds doorwerkte". Note: *"Niet lezen. Invoegen."* Reading it triggers the reaction; filing it anywhere is accepted.
- `card_five` — the only card in cabinet 5, plus the trail's fourth intruder lying on top of it. *Sage. Amsterdam. {tomorrow's date}. Zegsman: J.J.V.* The assistant who stayed late to finish filing and was not seen again, in the archive's plain style, ending: *"...en wat de assistent daar zag, dat was ____."*
- **Final lock:** `word`; accepted at runtime = every correct word answer the player typed tonight ∪ the player's name (if entered at start) ∪ `niets`, `mij`, `mijzelf`, `de assistent`, `de vorige assistent`. The door opens as the clock strikes twelve; cut to grey morning.
- `note_final` — foot of the player's own card: *"Goed ingevoegd. Morgen om negen. — J.J.V."*
- **Final screen:** the player's card in house format — Zegsman: player name; Opgetekend: date and completion time; Plaats: Amsterdam; a catalogue code from the seed; the Verhalenbank citation. Exportable as PNG. The only place the database is named.
- **Alternative ending:** all four cabinets filed, player stands at the door for 60 s without opening cabinet 5: the lamp goes out, the clock strikes nine, the door opens. *"Goed gedaan. Kast vijf blijft dicht."* The coat is still on the hook.

## 8. Scene integration

Existing: room, five cabinets, table, map, typewriter, door, camera on rails. Required (each a small module):

- **Objects to add if absent:** wall clock with a case door that opens and a card slot inside, hands that swing to a time on command; window with a mist shader (3 levels) and a text layer for mirrored condensation writing; lamp with dimmable intensity; coat on a hook with a clickable pocket; reading chair; wastepaper basket; door that can shiver and has a floor-level drop target; a slot in cabinet 5's front.
- **Card rendering:** one component from `render`; redacted field, torn edge, typewriter fill-in, crumpled state, damp state, "other hand" note style. Legible without zoom at 1440×900.
- **Envelope:** manila envelope object with stamp, note, live count and tick; lifts from the drawer front, travels with the camera to the table bay and back (Section 3g); flap opens to stand the cards upright with tabs; hover fan; reading view with front/back flip; cards slide back in on lock success; flap refuses to close while a card is missing; stamped *INGEVOEGD* and spiked after insertion. One envelope out at a time.
- **Insertion:** drawer slides out in place; envelope dropped on it fans its cards into the archive behind the divider with a riffle; single-card insertion for the intruder and the desk card.
- **Spike:** bill spike on the table accumulating stamped envelopes; the only progress display.
- **Hand:** holds one card or one envelope in view during rail walks; click-to-pick, click-destination-to-walk.
- **Table:** envelope bay at the near edge; 4 slots; loose box fans 12 (or 6); rack for P7; the spike.
- **Archive (3h):** instanced tab geometry behind the divider per cabinet; on-demand chunk loading; reading view for archive cards; map point cloud from `geo.bin`; reading log on the final card.
- **Map:** grey pins for helpers on the table; one red pin; radius check.
- **Typewriter:** single-line input; ding/jam; prints labels; fills fields; R4 self-typing animation with carriage sound; types `type_line` on R4 success.
- **Drawers/cabinets:** four states; drop targets for cards, stacks, intruders; order 1→2→3; one open per cabinet; digit printing; cabinet 5 dial and slot.
- **Room locks:** `card_to_object` handler for clock, window and door; activation per Section 3f.
- **Found cards:** six location handlers; `floor` event.
- **Ambient:** three-step escalation per cabinet, in the room and on the cabinet; timers per Section 3e.
- **Enactments:** four scripted sequences (Section 2), each ≤ 10 s, non-blocking.
- **Reactions:** trigger table from `frame.reactions`, each once.
- **Clock:** starts 21:15, real time + hint penalties.
- **State:** `localStorage`: seed, per-drawer state, every card's location, cabinet play order, fired reactions/enactments, correct word answers. Restore on reload.

Nothing in the scene knows a plaintext word answer.

## 9. Build order and acceptance checks

1. **Field audit.** Fill rates; confirm `ASSUMPTION`s; confirm time-of-day and numeral extraction are feasible on a sample (R1, R3 depend on them). *Accept:* table reviewed.
2. **Derived tables.** Six scripts; outputs committed. *Accept:* counts, samples, family histogram, cabinet counts; a sample of 20 clock-hour and 20 small-number extractions eyeballed as a distribution check.
3. **Contract + scene wiring (fake bundle).** Hand-write cabinet 1: P2, P3, R1, plus a `found_card` at `chair`. Wire envelope (take, open, cards to slots, return, insert, spike), map, typewriter, drawers (four states, order), clock case lock (`card_to_object`), cabinet unlock via P3, digit printing. A placeholder archive (50 dummy tabs behind the divider) so insertion has somewhere to go. *Accept:* cabinet 1 playable from opening note to filed ×3 and the clock enactment; refusals behave; screenshots at every station.
4. **Phase-1 generators:** P2, P3, P4, P5, P7, R1, R2, R3, R4, each with validator and synthetic tests first. *Accept:* yield report per type; flat preview renders three drawers per type.
5. **Assembly + real bundle.** Chain, composition constraints, found-card marking. `check_bundle.py`. *Accept:* passes; preview shows all 12 drawers; full playthrough of cabinets 1–4 with each enactment seen.
6. **Room objects, found cards, pacing, reactions, escalation.** *Accept:* a playthrough in which the 2nd, 3rd and 4th cabinets show their Section 3f differences; screenshots of each found-card location.
6b. **Archive (3h items 1–4).** Export chunks and `geo.bin`; deep drawers with real tabs; map point cloud; card backs; reading log. *Accept:* each cabinet's archive browsable with real text; map shows the point cloud under the pins; the final card's back lists the night's cards with working links; load time of a cabinet chunk measured and reported.
7. **Authored frame + endings.** Desk card via enactment, cabinet 5, final lock, both endings, final card export. *Accept:* both endings reachable.
8. **Phase 2:** P1, P6 with solvers and synthetic suite first. *Accept:* suite green; P1 answer frequency list reviewed.
9. **Polish:** sound, replay by seed, share image, Dagdienst (3h item 5).

Tunables in `config.py`: `IDF_FLOOR`, `PIN_RADIUS_KM`, `OUTLIER_MARGIN`, hint costs, escalation intervals, family size bounds. Tune from yield reports, not from individual puzzles.