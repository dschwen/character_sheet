# Cleric through level 5

The Cleric vertical slice uses the shared full-caster evaluation pipeline with Wisdom as its
spellcasting ability and `full-list` preparation. At level 5 it calculates four cantrips, nine
selected prepared spells, 4/3/2 spell slots, spell attack bonus, and spell save DC. Life Domain
adds six always-prepared spells without consuming those nine selections.

The reviewed fixture selects the Protector Divine Order, which adds Martial weapon proficiency and
Heavy armor training before equipment validation. The engine validates Divine Order cardinality,
Cleric subclass level, cantrip count, prepared-spell count, class-list membership, available spell
levels, slot expenditure, and active Concentration.

Channel Divinity is a traced two-use resource at level 5. Short Rests restore one use and Long Rests
restore all uses. Divine Spark, Turn Undead, and Preserve Life are roll-assisted atomic actions that
spend the shared resource. Spell casting and Long Rest behavior reuse the same slot and
Concentration transitions as Wizard.
