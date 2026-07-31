# Level-1 Fighter engine vertical slice

The reviewed fixture `fixture-fighter-1` exercises Human and Soldier origins, Fighter class traits,
selected feats, equipment, Weapon Mastery selections, mutable state, draft authoring IR, rest
recharge, action use, and calculation traces in one deterministic evaluation.

## Critical outputs

| Value                        |    Result |
| ---------------------------- | --------: |
| Strength modifier            |        +3 |
| Dexterity modifier           |        +2 |
| Constitution modifier        |        +2 |
| Proficiency Bonus            |        +2 |
| Strength save                |        +5 |
| Constitution save            |        +4 |
| Athletics                    |        +5 |
| Perception                   |        +3 |
| Initiative                   |        +2 |
| Passive Perception           |        13 |
| Walking Speed                |   30 feet |
| Maximum Hit Points           |        12 |
| Armor Class                  |        17 |
| Second Wind maximum          |         2 |
| Second Wind remaining        |         1 |
| Greatsword attack and damage | +5, 2d6+3 |
| Flail attack and damage      | +5, 1d8+3 |
| Javelin attack and damage    | +5, 1d6+3 |

Chain Mail supplies the selected Armor Class candidate of 16. Defense adds 1 because armor is worn,
producing Armor Class 17. Its trace cites both the armor entity on page 92 and the Fighting Style
on page 88.

The fixture selects Greatsword, Flail, and Javelin Weapon Masteries. Their Graze, Sap, and Slow
metadata is enabled on the corresponding attacks, but applying those combat effects remains
outside this slice.

Soldier supplies Athletics and Intimidation, Savage Attacker, and the selected +1 Strength, +1
Dexterity, and +1 Constitution increases. Human supplies Medium size, 30-foot Speed, Persuasion
from Skillful, and Skilled from Versatile. Skilled supplies Arcana, Insight, and Stealth in the
fixture; tool selections are not yet modeled.

## Second Wind

Second Wind is an available Bonus Action when the character is above 0 HP, below maximum HP, and
has a remaining use. At Fighter level 1 it has two uses. A Short Rest restores one expended use; a
Long Rest restores all uses.

`proposeAction` accepts the explicit d10 result and returns an atomic, immutable preview. For the
fixture, a roll of 2 heals from 7 to 10 HP and spends the second remaining use. An invalid roll
produces no changes and preserves the original state.

## Validation cases

Focused interaction tests verify:

- Defense applies only while the feat is selected and armor is worn;
- Second Wind is unavailable at full HP or with no remaining uses;
- Short Rest and Long Rest apply the feature's distinct recharge rules;
- Human Resourceful grants Heroic Inspiration on a Long Rest;
- illegal ability-increase patterns, species size, feat grants, and skill-choice counts are
  reported;
- an invalid explicit die result rejects the whole action proposal;
- evaluation is deterministic and every derived value has a trace.

## Current boundary

This fixture does not execute Graze, Sap, Slow, or Savage Attacker damage rolls, enforce attack
range or ammunition, apply damage, or represent tool proficiencies. Fighter levels 2–5 are covered
by the separate level-5 fixture. Second Wind, Defense, and Savage Attacker retain semantic-review
warnings because their authoring IR has not been approved.
