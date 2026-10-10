# Bard levels 1–7, Magical Discoveries, and Countercharm

The builder and same-class advancement support Lore Bards through level 7. Default level 6
builds have 45 maximum Hit Points, three normal cantrips, ten selected prepared spells, two
always-prepared Magical Discoveries, and three third-level slots. Existing Inspiration, Expertise,
Jack of All Trades, and Cutting Words behavior is retained.

Magical Discoveries uses shared `classFeatureChoiceSchema.spellSelection` metadata on the Lore
subclass. The source-linked feature identifies the casting class, allowed class lists, cantrip
eligibility, and always-prepared behavior. Choices store actual spell IDs in level history;
no per-spell option entities or class-specific UI branches are introduced.

The complete Cleric/Druid/Wizard list union is available, filtered by Bard slot access. Both
leveled spells and cantrips use Bard Charisma. Leveled spells consume normal slots and follow
normal concentration rules; cantrips require no slots. These selections do not consume normal
cantrip or preparation choices. If a discovered spell is also on the Bard list, it cannot also
consume a regular prepared selection.

The evaluator validates counts, duplicates, source lists, source-feature ownership, and slot
eligibility at the recorded selection level. Its grant trace cites Magical Discoveries. The
preparation editor marks the selected spells always prepared. Builder and advancement searches
filter by spell name and hide spells not yet available. One replacement is supported on later
Bard advancement; level 7 adds a fourth-level slot and eleven regular prepared spells.

## Countercharm

At level 7, the source-linked Reaction on SRD page 33 can reroll a failed saving throw against
an effect that applies Charmed or Frightened, for the Bard or a creature within 30 feet.
Shared action metadata defines the eligible conditions, range, and Advantage grant. The core
validates declared failure, available Reaction, target distance, and matching self-save context.
Direct or inherited Incapacitated blocks use. Countercharm spends no Bardic Inspiration and
does not automatically remove a condition.

Play → Feature actions presents self/other targeting and explicit eligibility confirmations.
Self-use rerolls the latest saving throw with the shared fullscreen/fallback dice pipeline.
Advantage cancels any Disadvantage, including when an earlier source of Advantage had already
canceled it; Advantage sources never stack. The new roll uses the original static modifier and
ordinary bonus-die definitions. Post-roll consumable bonuses are not carried forward, and the
same Countercharm cannot be applied twice to that displayed result.

For another creature, the UI instructs it to reroll on its own sheet; it never uses the Bard's
modifier for that creature. Compare the new result with the DC and resolve any condition manually.
Range, failure, Reaction availability/reset, and other-creature rolls are assisted declarations,
not inferred encounter state. Browser interaction verification remains outstanding: no connected
browser was available.

## Complete descriptive spell catalog

`python -m srd_extract.spells --spell-extraction generated/extraction/srd-5.2.1-spells
--output packages/content-srd-5.2.1/generated` extracts 339 source-linked spell entries and appends
missing entries while refreshing source-derived casting fields and preserving existing effect
annotations. Run it before the Bard generator, then
regenerate coverage. The raw catalog is stored in `generated/entities/spells.json`.

The parser recovers explicit casting labels misclassified as running headers at a column boundary
(including Nondetection's material component), retaining the original source blocks. It separates
descriptive headings after Duration instead of folding them into casting metadata. It does not
infer numerical damage or conditional-effect automation from prose. New entries are display-only;
the sheet labels them **Effects assisted**. Casting time, range, components, duration, ritual,
concentration, attack type, and saving-throw mentions are structured, but encounter adjudication
and numerical spell effects still require separate semantic review and annotations.
