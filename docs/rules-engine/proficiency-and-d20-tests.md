# Proficiency and d20-test evaluation

The engine now emits a typed proficiency summary and individual d20-test summaries for:

- all six saving throws;
- all eighteen skills;
- Initiative;
- Passive Perception as a derived value.

The starting class grants saving-throw proficiencies from its source-linked content entity. Skill
choices are persisted as `{ skillId, sourceId }` pairs and checked against the starting class's
allowed options and required count.

For the level-1 Barbarian fixture, the critical results are:

| Test                  | Modifier | Proficiency |
| --------------------- | -------: | ----------- |
| Strength saving throw |       +5 | Proficient  |
| Constitution save     |       +5 | Proficient  |
| Athletics             |       +5 | Proficient  |
| Perception            |       +3 | Proficient  |
| Initiative            |       +2 | None        |
| Passive Perception    |       13 | Perception  |

Every numeric result has a calculation trace. Proficient saves and selected class skills cite the
Barbarian class source span.

Evaluation context can attach any number of Advantage and Disadvantage sources to a test ID. The
result retains both source lists and resolves them to `advantage`, `disadvantage`, or `normal`.
Opposing states cancel regardless of source count.

## Current boundary

This phase provides the kernel and its first character consumers. Content-authored proficiency,
Expertise, and roll-state effects will be added as more features and origins are parsed. Attack
rolls will reuse the same test semantics in the equipment and attacks phase.
