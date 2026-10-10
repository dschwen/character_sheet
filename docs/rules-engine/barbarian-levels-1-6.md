# Barbarian levels 1–7 engine vertical slice

The reviewed fixture `fixture-barbarian-1` exercises persisted choices, mutable state, generated
content, draft authoring IR, and calculation traces in one deterministic evaluation.

The guided builder and level-up flow extend that foundation through level 7. They add Primal
Knowledge, the Path of the Berserker, the level-4 Ability Score Improvement, Extra Attack, Fast
Movement, a fourth Rage use, Mindless Rage, Feral Instinct, and Instinctive Pounce while preserving
mutable play state.

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

At level 6, Mindless Rage derives its Charmed and Frightened immunities from the granted subclass
feature. Entering Rage removes either condition from persistent state atomically. If imported state
still contains one while Rage is active, evaluation suppresses it and reports the immunity source.

At level 7, Feral Instinct grants Initiative advantage without requiring Rage. It follows ordinary
advantage/disadvantage cancellation and cites page 29 in the Initiative trace. It does not grant
advantage on unrelated Dexterity checks.

Instinctive Pounce enhances Enter Rage rather than offering an independently repeatable action.
The Play view and action summary show optional movement up to half final walking Speed; successful
Rage use repeats this guidance. The maximum incorporates movement statuses and conditions, rounds
down (the general rule on page 5), and has a trace linking the feature and Speed sources. For example,
40 Speed permits 20 feet; Exhaustion 1 reduces that to 17 feet; Grappled permits 0 feet. Ordinary
Opportunity Attack rules still apply. The action's explanation includes the movement trace.

The enhancement preserves Mindless Rage's condition removal and does not spend a second Rage use,
request dice, alter normal Speed, or apply battlefield movement. The player chooses whether and
where to move as part of the same Bonus Action. Other movement modes, distances, obstacles, and
Opportunity Attack adjudication remain manual. Movement features on other classes also use final
adjusted walking Speed and round down.

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
ammunition, target range, or damage application. Rage and Unarmored Defense still carry
semantic-review warnings because their authoring IR has not been approved. Rest processing is
available as a separate atomic state-transition proposal.
