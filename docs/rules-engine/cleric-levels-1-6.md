# Cleric through level 6

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

At level 6, Channel Divinity increases to three uses, preparation increases to ten selected spells,
and the third-level slot maximum increases to three. The Life Domain grants Blessed Healer.
The spell-cast request records whether the spell actually restored HP to another creature; a
confirmed slotted healing spell also heals the caster for 2 + slot level, capped at maximum HP.
This change shares the atomic cast proposal and has its own source-linked calculation trace.
Self-only healing, unsuccessful casts, rituals, free castings, and non-healing spells do not trigger it.

Four reviewed spells have structured healing dice: Cure Wounds, Healing Word, Mass Healing Word,
and Prayer of Healing. Their dice scale with slot level. The roll helper uses the selected casting
source's ability, and adds Disciple of Life only on slotted casts. Target HP, multi-target selection,
Prayer of Healing's Short Rest and once-per-Long-Rest restriction, and whether a target actually
regained HP remain player-resolved. Disciple of Life's bonus applies only on the casting turn.
