# Fighter levels 2–5 engine vertical slice

The reviewed `fixture-fighter-5` advances the Human Soldier Fighter through five contiguous Fighter
levels and selects Champion at level 3 and Ability Score Improvement at level 4.

## Golden outputs

| Value                         |    Result |
| ----------------------------- | --------: |
| Strength                      |        18 |
| Proficiency Bonus             |        +3 |
| Maximum Hit Points            |        44 |
| Armor Class                   |        17 |
| Attacks per Attack action     |         2 |
| Weapon critical-hit threshold |        19 |
| Second Wind uses              |         3 |
| Action Surge uses             |         1 |
| Greatsword attack and damage  | +7, 2d6+4 |
| Longbow attack and damage     | +5, 1d8+2 |

Ability Score Improvement supplies +2 Strength and retains the pre-background, background, and
feat contributions as separate persisted choices. Four selected Weapon Masteries match the
level-5 Fighter progression.

## Level-gated features

- Action Surge grants one additional non-Magic action and spends its own Short/Long Rest resource.
- Tactical Mind exposes a d10 bonus after a failed ability check. It remains roll-assisted until
  the final check result determines whether Second Wind is expended.
- Champion's Improved Critical sets weapon critical hits to 19–20.
- Remarkable Athlete grants Advantage on Initiative and Athletics and exposes its post-critical
  half-Speed movement.
- Extra Attack sets the Attack action's attack count to two.
- Tactical Shift exposes up to 15 feet of movement with the fixture's 30-foot Speed when Second
  Wind is activated.

Action Surge has an atomic resource-spend proposal. Supplying a die roll to that action is rejected
without changes. Short and Long Rest proposals recharge Action Surge and Second Wind according to
their separate rules.

## Validation

Focused tests reject:

- a Fighter subclass before level 3 or no subclass at level 3+;
- a General feat count that does not match Fighter progression;
- a feat selected before its character-level prerequisite;
- an invalid Ability Score Improvement pattern or score above its cap;
- too few or too many Weapon Mastery selections;
- repeated non-repeatable feats and ungranted proficiency sources.

## Current boundary

The engine does not resolve Tactical Mind's final check success, roll weapon damage, apply Savage
Attacker, model Unarmed Strikes, or move a combat token. Improved Critical is therefore attached to
modeled weapon attacks; the source text for Unarmed Strikes is retained but awaits that attack
model. Features above Fighter or Champion level 5 remain structured rather than executable.
