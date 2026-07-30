# ADR 0005: Evaluate characters in explicit phases

- Status: Accepted
- Date: 2026-07-29

## Decision

The first character evaluator runs deterministic phases in this order:

1. validate package pins;
2. materialize choices and state as facts;
3. derive ability modifiers and the character-level Proficiency Bonus;
4. resolve proficiency states, saving throws, skills, Initiative, and passive scores;
5. calculate per-level Hit Points;
6. grant level-gated feature IDs;
7. instantiate resources;
8. evaluate competing Armor Class candidates;
9. evaluate conditional actions, resistances, modifiers, and validations;
10. report review-coverage warnings.

Rules remain declarative inputs. The evaluator does not dispatch arbitrary package code.

## Consequences

Resource availability exists before action predicates are evaluated, and derived ability modifiers
exist before HP or AC expressions reference them. Every displayed numeric result points to a
calculation trace. Later effect types must be assigned to a documented phase rather than relying on
object insertion order.
