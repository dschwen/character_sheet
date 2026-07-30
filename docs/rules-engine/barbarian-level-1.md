# Level-1 Barbarian engine vertical slice

The reviewed fixture `fixture-barbarian-1` exercises persisted choices, mutable state, generated
content, draft authoring IR, and calculation traces in one deterministic evaluation.

## Critical outputs

| Value                 | Result |
| --------------------- | -----: |
| Strength modifier     |     +3 |
| Dexterity modifier    |     +2 |
| Constitution modifier |     +3 |
| Proficiency Bonus     |     +2 |
| Strength save         |     +5 |
| Constitution save     |     +5 |
| Athletics             |     +5 |
| Perception            |     +3 |
| Initiative            |     +2 |
| Passive Perception    |     13 |
| Greataxe attack       |     +5 |
| Greataxe damage       | 1d12+5 |
| Handaxe attack        |     +5 |
| Handaxe damage        |  1d6+5 |
| Maximum Hit Points    |     15 |
| Armor Class           |     15 |
| Rage maximum          |      2 |
| Rage remaining        |      1 |
| Rage Damage           |     +2 |

Unarmored Defense wins over the ordinary `10 + Dexterity modifier` candidate. Its trace cites page
29 and retains the rejected/alternative candidate details.

With Rage active, the evaluation exposes Bludgeoning, Piercing, and Slashing resistance. Enter Rage
is an available Bonus Action when a use remains and Heavy armor is not equipped.

## Validation cases

Focused interaction tests verify:

- Heavy armor rejects Unarmored Defense and makes Enter Rage unavailable;
- active Rage with Heavy armor produces a consistency error;
- active Rage with Concentration produces a rules error;
- expended Rage uses cannot exceed the calculated maximum;
- an unavailable resource makes Enter Rage unavailable;
- repeated evaluation returns deeply equal output.

## Current boundary

This slice intentionally does not resolve Weapon Mastery combat effects, Rage duration transitions,
rests, ammunition, target range, or damage application. Rage and Unarmored Defense still carry
semantic-review warnings because their authoring IR has not been approved.
