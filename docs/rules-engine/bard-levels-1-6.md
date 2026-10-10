# Bard levels 1–6 and Magical Discoveries

The builder and same-class advancement support Lore Bards through level 6. Default level 6
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
Bard advancement; the public builder remains capped at 6 pending the next feature slices.

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
