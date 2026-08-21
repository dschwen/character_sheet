# Sorcerer levels 1–6 vertical slice

The reviewed `sorcerer-5.json` fixture is Ember, a Human Soldier Draconic Sorcerer. The guided
level-up flow advances Ember to level 6 and records a source-defined Elemental Affinity choice.
Ember has
Quickened Spell and Subtle Spell, prepares nine Sorcerer spells, knows five cantrips, and always has
the six level-3 and level-5 Draconic Spells prepared.

The evaluator derives 37 maximum Hit Points, including one additional Hit Point per Sorcerer level,
and unarmored AC 15 from Dexterity and Charisma. It also derives Charisma spell attack +6, spell save
DC 14, the level-5 spell-slot progression, five Sorcery Points, two Innate Sorcery uses, and one
Sorcerous Restoration use. Long Rests restore those resources and spell slots. Quickened Spell and
Subtle Spell spend their configured Sorcery Point costs atomically; Sorcerous Restoration spends
its own use and restores half the Sorcerer level in Sorcery Points, rounded down.

At level 6, Elemental Affinity grants the selected Acid, Cold, Fire, Lightning, or Poison
resistance. Matching Sorcerer spell damage rolls expose the Charisma modifier as an explicit bonus
that applies to one damage roll of the spell. The level-up also raises the prepared-spell limit to
ten, Sorcery Points to six, and level-3 spell slots to three without resetting play state.

The generated content retains all 20 Sorcerer progression rows, the complete 138-spell Sorcerer
list, all ten Metamagic options, and every Draconic Sorcery feature as source-linked structured
content. Through level 5, these limits remain intentionally assisted:

- Innate Sorcery tracks uses and exposes its Bonus Action. Applying its one-minute spell save DC
  increase and spell-attack Advantage requires encounter-duration state and remains assisted.
- Font of Magic supplies and spends Sorcery Points. Converting slots to points and creating spell
  slots remain descriptive pending a general dynamic spell-slot transition.
- Quickened Spell and Subtle Spell spend their points, while changing casting time or suppressing
  Verbal, Somatic, and non-consumed Material components remains part of the spell-casting workflow.
- Sorcerous Restoration is exposed as an explicit post-Short-Rest action. The generic Short Rest
  transition does not invoke optional features automatically or remember that prerequisite, so its
  caller must offer the action only immediately after the rest.
- Draconic Resilience automates maximum Hit Points and its unarmored AC candidate. Elemental
  Affinity automates its persistent resistance and annotates eligible spell-damage rolls; the user
  still chooses which one damage roll receives the bonus when a spell has multiple damage rolls.
