# ADR 0010: Record background ability increases separately

- Status: Accepted
- Date: 2026-07-30

## Decision

`CharacterBuild.abilityScores` stores the scores selected before background increases.
`backgroundAbilityScoreIncreases` stores the chosen increases as a sparse ability-to-amount map.
The evaluator adds the two to produce final ability score facts.

The selected background supplies the allowed abilities and increase patterns. Those constraints are
content data rather than background-ID conditionals in the character schema.

## Consequences

A rebuild can explain which part of a final score came from the assigned score and which came from
the background. Changing a background does not require reverse-engineering already-combined
numbers.

Older character documents parse with an empty increase map and retain their previous results.
Import migration can later distinguish legacy final scores from explicitly separated origin
choices when the schema version advances.
