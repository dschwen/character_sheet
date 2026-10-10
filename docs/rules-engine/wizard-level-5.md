# Wizard through level 5

The Wizard vertical slice reads its mechanics from the generated Wizard class and spell entities.
At level 5 it calculates four known cantrips, a minimum 17-spell spellbook, nine prepared spells,
4/3/2 spell slots, spell attack bonus, and spell save DC.

The evaluator validates that learned spells are loaded Wizard spells, cantrips and prepared spells
match the progression, prepared spells are in the spellbook, expended slots do not exceed their
maximums, and active Concentration references a known Concentration spell. Spell summaries carry
their source references into the evaluated sheet.

Evocation Savant adds two level-1 or level-2 Wizard Evocations at level 3, then one additional
Evocation whenever a new spell-slot tier becomes available. These are separate, source-linked
builder choices, not always-prepared spells; they increase the normal spellbook minimum and
must be prepared normally. Initial choices cannot include cantrips, other schools, or spells
above the available slot tier. Separate grants cannot reuse the same spell.

Loading an older saved Evoker supplies missing grants using eligible spells not already known,
preserving its existing spellbook, preparation, inventory, and play state. A notice asks the player
to review these defaults before play. Existing explicit choices are not overwritten. There is no
automatic substitution if too few eligible new spells remain; the unresolved choice stays visible
in validation and requires manual review. There is no dedicated editor for historical Savant
choices yet; changing migrated defaults requires editing
an exported character and importing it again. Higher-level choice metadata is present, but does
not expand the current level-5 Wizard builder cap.

`proposeSpellCast` atomically previews slot expenditure and Concentration replacement. Wizard
Ritual Adept allows a ritual-tagged spell in the spellbook to be cast without preparation or a
slot. `proposeRest` restores all expended slots and ends Concentration on a Long Rest. Neither
operation mutates the input character.

Arcane Recovery is a separate once-per-Long-Rest resource. A Short Rest can optionally recover
selected expended slots with combined levels up to half Wizard level rounded up, excluding slots
above level 5. The Play rest controls expose the selection and its budget; invalid selections reject
the entire rest proposal. Ordinary Short Rests do not spend the optional use.

The reviewed `wizard-5.json` fixture exercises a Human Soldier Evoker with a legal spellbook,
preparation list, active Web Concentration, and partially expended slots. Its golden assertions
cover spell display, source links, attack/DC traces, spellbook and slot validation, ritual casting,
spell casting, and Long Rest recovery.
