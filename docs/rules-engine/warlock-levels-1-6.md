# Warlock levels 1–6 vertical slice

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
source-linked structured content. The builder and same-class advancement support level 6:
45 maximum Hit Points with the default build, seven selected prepared spells, five invocations,
and two third-level Pact slots.

Dark One's Own Luck grants a separate Charisma-modifier resource (minimum one use) that recharges
only on Long Rest. The action requires a completed ability check or saving throw, rolls 1d10, and
spends one use atomically. Initiative is an ability check; attacks and damage rolls are ineligible.
The UI preserves the original d20, mode, modifier, and previous bonus dice when adding the result.
It remembers applied action IDs on that displayed roll, preventing repeated use on the same roll.
Saving throws have dedicated roll controls on the Overview tab.

The completed-roll context is caller-owned; it is not an authenticated or persisted encounter
history. Engine clients must carry applied action IDs forward and invoke the action before the
roll's effects occur. The app clears the roll on character changes, rest/state changes, and undo.
It does not infer success/failure or resolve external encounter consequences.

These limits remain intentionally assisted:

- Invocation counts, distinct selections, minimum Warlock levels, and invocation dependencies are
  validated. Repeatable invocations that require a different spell or feat target remain
  descriptive because the character choice model does not yet store those targets.
- Invocation effects such as special sight, at-will spells, familiar options, and pact weapons are
  retained as structured text pending their corresponding senses, summons, and active-effect
  models.
- Dark One’s Blessing’s temporary Hit Point formula and enemy-defeat trigger remain
  encounter-assisted. The fixture demonstrates the resulting persisted temporary Hit Points.
- Fiend Spells are automatically always prepared. Later Fiend features are retained as structured
  content outside the level-6 automation boundary.
