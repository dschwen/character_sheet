# Sorcerer levels 1–7 vertical slice

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

At level 7, creation and advancement support eleven selected prepared spells, five cantrips,
seven Sorcery Points, 4/3/3/1 slots, and always-prepared Arcane Eye and Charm Monster. Existing
choices, possessions, spent resources and slots, current HP, and other play state are preserved.

Innate Sorcery's Bonus Action now atomically spends one use and activates a visible status.
While active, source-linked status metadata grants +1 Sorcerer spell save DC and Advantage on
Sorcerer spell attacks. Advantage cancels Disadvantage, even when another Advantage source is
also present; duplicate status IDs do not stack. Weapon attacks, saving throws, species spells,
and Magic Initiate casting are unaffected. The status requires the granted Innate Sorcery
feature, so manually putting it on a different class does not grant spellcasting benefits.

Sorcery Incarnate supplies a second Bonus Action only from level 7. It requires zero normal
Innate Sorcery uses remaining and at least two Sorcery Points, spends exactly two points, and
activates the same status without restoring normal uses. Both activations are unavailable while
the status is already active or actions are disabled. Failed proposals change neither resources
nor status. The shared resource predicate supports explicit positive minimum amounts.

Play action feedback explains the one-minute duration and benefits. End Innate Sorcery in
Beneficial statuses when the minute expires; rests clear it automatically. The manual toggle
also permits DM-approved corrections without spending resources. At level 7, its description
reminds the player that up to two Metamagic options can apply to each spell while active.
Metamagic selection, timing, and association with a particular cast remain manually adjudicated.
Rendered UI verification is still pending because no connected browser was available.

The generated content retains all 20 Sorcerer progression rows, the complete 138-spell Sorcerer
list, all ten Metamagic options, and every Draconic Sorcery feature as source-linked structured
content. Through level 7, these limits remain intentionally assisted:

- Innate Sorcery duration is manually tracked between rests. The app does not run an encounter
  clock, track Bonus Action budgets, or automatically apply multiple Metamagic options to a cast.
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
