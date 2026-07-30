# Barbarian authoring-IR proof of concept

The pages 28–30 parser generates 23 structured entities:

- `srd521.class.barbarian`
- all 20 class-feature sections through level 20;
- `srd521.table.barbarian.rages`
- `srd521.table.barbarian.rage-damage`

Only Rage and Unarmored Defense have proposed executable mechanics in this slice. The remaining
feature entities retain structured, source-linked text so every class progression reference
resolves without implying automation coverage.

## Table reconciliation

The class progression contains 26 feature grants:

| Result                           | Count |
| -------------------------------- | ----: |
| Direct feature-heading match     |    20 |
| Ability Score Improvement repeat |     3 |
| Subclass feature placeholder     |     3 |
| Unresolved                       |     0 |

The parser fails generation if the level sequence, proficiency bonus formula, expected core-trait
rows, or feature reconciliation is invalid.

## Rage draft

The draft authoring IR proposes typed rules for:

- the level-scaled Rage resource;
- Short Rest and Long Rest recharge;
- the Bonus Action used to enter Rage;
- the Heavy armor and available-resource predicates;
- Bludgeoning, Piercing, and Slashing resistance;
- level-scaled Strength attack damage;
- Strength check and saving-throw Advantage;
- spellcasting and Concentration restrictions.

Rage duration extension remains structured text pending the combat-turn state model.

## Unarmored Defense draft

Unarmored Defense is represented as an Armor Class candidate—not a stacking modifier—with the
formula `10 + Dexterity modifier + Constitution modifier`. Its predicate requires no worn armor,
and the candidate metadata explicitly permits a Shield.

Both drafts retain source blocks and quote hashes. Their review state is `needs-review`; passing
draft tests does not promote them to executable or verified coverage.
