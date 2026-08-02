# Warlock level 5 vertical slice

The reviewed `warlock-5.json` fixture is Morrow, a Human Soldier Fiend Warlock. Morrow wears Leather
Armor, prepares six Warlock spells, knows three cantrips, and always has the six level-3 and level-5
Fiend Spells prepared. The five selected Eldritch Invocations are Pact of the Chain, Devil’s Sight,
Fiendish Vigor, Ascendant Step, and One with Shadows.

The evaluator derives 38 maximum Hit Points, AC 13, Charisma spell attack +6, spell save DC 14, and
two level-3 Pact Magic slots. Casting a lower-level prepared spell consumes a level-3 slot. Short
and Long Rests restore all Pact Magic slots. Magical Cunning tracks its once-per-Long-Rest use and
atomically restores half the maximum Pact slots, rounded up, after its one-minute rite.

The generated content retains all 20 Warlock progression rows, the complete 72-spell Warlock list,
all 28 Eldritch Invocation options and their source prerequisites, and every Fiend Patron feature as
source-linked structured content. Through level 5, these limits remain intentionally assisted:

- Invocation counts, distinct selections, minimum Warlock levels, and invocation dependencies are
  validated. Repeatable invocations that require a different spell or feat target remain
  descriptive because the character choice model does not yet store those targets.
- Invocation effects such as special sight, at-will spells, familiar options, and pact weapons are
  retained as structured text pending their corresponding senses, summons, and active-effect
  models.
- Dark One’s Blessing’s temporary Hit Point formula and enemy-defeat trigger remain
  encounter-assisted. The fixture demonstrates the resulting persisted temporary Hit Points.
- Fiend Spells are automatically always prepared. Dark One’s Own Luck and later Fiend features are
  retained as structured content outside the level-5 automation boundary.
