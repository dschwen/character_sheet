# ADR 0004: Separate raw extraction from derived layout and normalization

- Status: Accepted
- Date: 2026-07-29

## Decision

Store exact PDF text spans, words, coordinates, typography, images, drawings, links, and page
geometry in an immutable raw-page representation. Region classifications, reading order,
normalization transformations, typed document nodes, and continuation links are separate derived
layers.

Every normalized node retains its source block IDs. Every text transformation records its input,
output, confidence, and signals.

## Consequences

Classification and normalization heuristics can improve without re-extracting or silently changing
the source record. Review tools can compare any derived result with the PDF geometry. Generated
artifacts are larger than a flattened text dump, but remain deterministic and auditable.
