# Equipment and attack evaluation

The character loadout stores owned inventory instances separately from equipped-instance IDs.
Evaluation returns display-ready inventory and weapon attacks while keeping all calculated values
out of the persisted document.

## Armor

The Armor Class candidate phase supports:

- light armor: table base plus Dexterity modifier;
- medium armor: table base plus Dexterity modifier, capped at +2;
- heavy armor: fixed table value;
- a trained Shield: +2 to an applicable armor or unarmored candidate;
- Unarmored Defense as a competing class-feature candidate.

The engine validates multiple equipped armor suits or Shields. Untrained armor creates
Disadvantage sources for Strength- and Dexterity-based d20 tests, while a Shield without training
grants no AC. Armor table entries can also impose Stealth Disadvantage and a traced −10-foot armor
speed penalty when Strength is below the listed requirement.

## Weapons

Each owned weapon produces an attack summary containing:

- selected Strength or Dexterity ability;
- attack bonus and weapon-proficiency state;
- damage dice, type, ability bonus, and applicable Rage bonus;
- melee or ranged classification and range;
- weapon properties;
- mastery property and whether the character selected it.

The level-1 Barbarian fixture produces `+5` Greataxe and Handaxe attacks. While Rage is active,
their damage bonuses are `+5` from Strength `+3` and Rage `+2`. The selected Cleave and Vex
masteries are exposed as enabled metadata; resolving their combat effects remains a later
roll/state-automation phase.

## Current boundary

This phase does not process ammunition consumption, two-weapon extra attacks, reach, target range,
Heavy-weapon Disadvantage, mastery combat effects, or attack state transitions. It provides the
source-linked inventory and attack model those mechanics will consume.
