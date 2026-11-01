# Ritual Caster — 2014 PHB variant engine semantics

The 2014 Ritual Caster is evaluated from its out-of-SRD edition-reference record
`dnd2014.feat.general.ritual-caster` (see `docs/adr/0013-out-of-source-edition-reference-records.md`
and [Out-of-SRD edition-reference records](../extraction/edition-references.md)). It is not SRD
content and is never presented as such. Like the 2024 variant, acquisition rides the existing
General-feat machinery: a recorded entry in `build.levels[].featSelections` at a level where the feat
is available, and the shared `FEAT_*` validations — including the feat's Intelligence-or-Wisdom 13
prerequisite (`FEAT_ABILITY_PREREQUISITE`, checked before any increase at the same level) and the
level gate, which this record states no minimum for (see the prerequisite note in
[Ritual Caster — 2024 PHB variant](ritual-caster-2024.md)). The feat grants no ability increase, so
its recorded selection carries an empty `abilityScoreIncreases`; a feat whose record declares no
increase patterns now occupies its feat slot with exactly one legal allocation — no increases at all —
so aggregate reconciliation accepts it. Level-1 acquisition through an origin feature (Variant Human
style) is not modeled: feats are offered at the reviewed Ability Score Improvement levels.

## The ritual book is a class-list choice

Three records in `build.choices` describe the book, all keyed by the feat's entity id:

| Choice id                              | Meaning                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| `<featId>.choice.spell-list-class`     | Exactly one class id from the record's `classListOptions` |
| `<featId>.choice.ritual-spells`        | Exactly `initialSpellCount` (2) distinct starting spells  |
| `<featId>.choice.ritual-book-research` | Optional further spells copied in later                   |

`classListOptions` is a machine field of class entity ids (`srd521.class.bard` …
`srd521.class.wizard`) so the choice resolves against class entities in the pinned SRD package; the
record's rules text keeps the printed class-name wording. Anything other than exactly one allowed
class id whose entity parses as a `spellcastingClassBody` is `RITUAL_CASTER_CLASS_CHOICE_INVALID`,
and the feat evaluates to nothing. A second record for any single choice id is
`DUPLICATE_RITUAL_CASTER_CHOICE` (shared with the 2024 variant).

## Book contents and research limit

The starting book must contain exactly two distinct spells; any other count is
`RITUAL_CASTER_INITIAL_COUNT_INVALID`. Researched spells must be distinct and not already in the
initial book (`RITUAL_CASTER_RESEARCH_DUPLICATE`). Every book spell — initial or researched — must be
on the chosen class's own `spellList`, carry the Ritual tag, and be within its level bound: level 1
for the initial spells, and at most half the character's level, rounded up, for research
(`Math.ceil(levels.length / 2)`); anything else is `RITUAL_CASTER_SPELL_INVALID` naming the class,
and the rejected spell is not granted while the rest of the book still is. The exactly-two start and
the half-level research cap are the owner-chosen policy for this record; printed 2014 renderings
diverge and the divergence is recorded in the record's review notes rather than resolved silently.
The engine never grows the book on its own — research is declared, and only validated.

## Casting ability and edition-qualified traces

The book's spellcasting ability is the chosen class's own `spellcastingAbility`, read from the class
entity. Both variants share the feat slug `general.ritual-caster`, so the calculation traces are
qualified by the full feat entity id — `spellcasting.<featId>.attackBonus` and
`.saveDifficultyClass` — and a single sheet carrying both variants keeps two independent traces (one
citing `phb-2014`, one `phb-2024`), each feeding its own feat's grants.

## Casting the book

Book spells are granted as spell summaries that are **not prepared**, and their casting options
carry no free-cast fields at all — no `freeCastAtWill` and no `freeCastResourceId`, because the
2014 text has no quick-casting benefit to model. Casting a book spell therefore goes through a
ritual casting request (`request.asRitual` in the shared spell transition), which for a level 1+
spell checks only the Ritual tag and never reaches the preparation check, so no spell slot is
expended and no preparation is required; a `useFreeCast` request on a book spell is rejected with
`SPELL_FREE_CAST_UNAVAILABLE`. In the sheet, the Ritual affordance is the only casting path for
these grants, and the Overview attributes each one to its variant record. Book possession, finding
scrolls or spellbooks to copy, and the extended ritual casting time are assisted, not modeled.

## Provenance

The feat's traces and casting options cite its edition-reference span honestly: `sourceId phb-2014`
with the record's own quote hash and no page, because no pinned SRD page contains it. The spells it
grants are real SRD 5.2.1 entities and keep their pinned sources — the feat's provenance never
relabels them.

## Not yet implemented

Researching new book spells during play is not a UI flow: the builder and level-up read the
research record but never add to it, so a researched spell exists only in a document authored or
imported with one. The rest of the selection flow is built and browser-gated — see
[Browser verification harness](../testing/browser-verification.md) (`e2e/ritual-caster.spec.ts`).
