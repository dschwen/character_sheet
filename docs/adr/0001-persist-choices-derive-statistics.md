# ADR 0001: Persist choices and derive statistics

- Status: Accepted
- Date: 2026-07-29

## Decision

Persist character-building choices, loadout, mutable play state, and explicit overrides. Calculated
statistics are engine outputs and may be cached, but they are never authoritative stored inputs.

## Consequences

Characters can be deterministically rebuilt against their pinned rules package. Schema migrations
operate on user intent rather than stale calculated fields. Evaluation must remain fast enough for
full recomputation during editing.
