# Wizard through level 5

The Wizard vertical slice reads its mechanics from the generated Wizard class and spell entities.
At level 5 it calculates four known cantrips, a minimum 14-spell spellbook, nine prepared spells,
4/3/2 spell slots, spell attack bonus, and spell save DC.

The evaluator validates that learned spells are loaded Wizard spells, cantrips and prepared spells
match the progression, prepared spells are in the spellbook, expended slots do not exceed their
maximums, and active Concentration references a known Concentration spell. Spell summaries carry
their source references into the evaluated sheet.

`proposeSpellCast` atomically previews slot expenditure and Concentration replacement. Wizard
Ritual Adept allows a ritual-tagged spell in the spellbook to be cast without preparation or a
slot. `proposeRest` restores all expended slots and ends Concentration on a Long Rest. Neither
operation mutates the input character.

The reviewed `wizard-5.json` fixture exercises a Human Soldier Evoker with a legal spellbook,
preparation list, active Web Concentration, and partially expended slots. Its golden assertions
cover spell display, source links, attack/DC traces, spellbook and slot validation, ritual casting,
spell casting, and Long Rest recovery.
