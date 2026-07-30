# ADR 0009: Action use produces atomic transition proposals

- Status: Accepted
- Date: 2026-07-29

## Decision

An action that changes character state is evaluated through `proposeAction`. The function returns
an immutable transition proposal and never persists or mutates the input character.

The evaluated action supplies typed transition parameters such as its resource cost and healing
formula. Nondeterministic results, including dice rolls, are explicit request inputs. The proposal
validates action availability, roll count, roll range, required facts, and resource configuration
before applying any change.

If any validation fails, the proposal is not applicable, contains no field changes, and returns a
next state equal to the original state.

## Consequences

The UI can preview, confirm, reject, replay, and audit an action before saving it. Rules evaluation
remains deterministic and persistence remains a separate concern.

Each field change includes a calculation trace linked to the action's source rule. The initial
implementation supports the healing-and-resource-spending shape needed by Second Wind; future
action shapes can extend the typed parameter union without adding action IDs to the transition
engine.
