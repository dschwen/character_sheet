# ADR 0008: Rest processing produces atomic transition proposals

- Status: Accepted
- Date: 2026-07-29

## Decision

Short Rest and Long Rest processing returns a state-transition proposal. It never mutates the input
character and never silently persists the proposed state.

A proposal contains:

- whether the rest is applicable;
- field-level before and after values;
- a complete proposed `CharacterState`;
- validation messages;
- a calculation trace for every changed field.

Invalid requests are atomic. If the rest cannot start or a requested Hit Die spend is invalid, the
proposal contains no changes and its next state equals the original state.

Hit Die rolls are explicit request inputs. The engine validates each roll against its class Hit
Point Die and the character's remaining dice; it does not generate random results.

## Consequences

The UI can preview, confirm, reject, or audit a rest before saving it. State persistence remains a
separate concern and can use ordinary character revision control.

Feature resources use their evaluated recharge rules. A Short Rest and Long Rest do not reset all
resources generically; each resource changes only when its rule names that event.
