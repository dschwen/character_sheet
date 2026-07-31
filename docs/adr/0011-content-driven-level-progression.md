# ADR 0011: Resolve level progression from content entities

- Status: Accepted
- Date: 2026-07-30

## Decision

Class and subclass feature grants are resolved from their content progression tables using the
persisted per-character-level history. A selected subclass stores its parent class and its own
level-to-feature progression; the engine grants only features at or below the corresponding class
level.

Level-gated feat choices remain persisted feat IDs. Ability increases selected from a feat are
stored separately in `featAbilityScoreIncreases` and validated against that feat's patterns,
prerequisite, and maximum score.

Rules may set attacks per Attack action, weapon critical-hit thresholds, or D20-test Advantage
through typed authoring IR. These contributions produce ordinary calculation traces and may not
inject phase code.

## Consequences

Leveling and de-leveling reproduce feature grants without storing derived features on the
character. Illegal early subclass or feat selections remain loadable but produce stable validation
messages.

The current `subclassId` and feat-increase map are sufficient for the single-class level-5 slice.
Multiclassing and repeated ability-increase feats will require source-instance-aware selections
before those scopes are enabled.
