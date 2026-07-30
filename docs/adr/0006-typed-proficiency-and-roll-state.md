# ADR 0006: Model proficiency and roll state as typed domains

- Status: Accepted
- Date: 2026-07-29

## Decision

Proficiency is represented by the ordered states `none`, `half`, `proficient`, and `expertise`.
Multiple grants resolve to the strongest state before the proficiency contribution is calculated.
The states do not stack arithmetically.

Advantage and disadvantage are represented separately from a test's numeric modifier. Any number
of Advantage sources and any number of Disadvantage sources resolve as follows:

- only Advantage sources produce Advantage;
- only Disadvantage sources produce Disadvantage;
- opposing sources cancel to a normal roll;
- repeated sources do not create stronger roll states.

Persisted skill choices record both the skill and the entity that granted the choice. This makes
choice validation and calculation provenance possible without persisting derived proficiency
bonuses.

## Consequences

Saving throws, skills, Initiative, and future attacks share one d20-test result shape. A result
preserves its ability, proficiency state, numeric modifier, roll mode, contributing sources, and
trace. Content effects can later contribute proficiency or roll-state sources without replacing
the resolver.

Situational roll state is evaluation context, not permanent character state. Passive Perception is
currently `10 + Perception modifier`; no extra passive-score adjustment is inferred from
situational Advantage or Disadvantage.
