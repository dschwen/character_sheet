# Barbarian pages 28–30 extraction audit

This proof of concept exercises the pinned SRD 5.2.1 PDF's two-column class layout.

## Implemented layers

1. Raw page JSON containing page geometry, blocks, lines, spans, words, drawings, images, and links.
2. Geometry-derived column gutters, recurring footer classification, and table-region detection.
3. Conservative normalization with recorded, reversible transformations.
4. Typed heading, paragraph, list, table, and metadata nodes.
5. Explicit links for paragraph/list continuation across columns and pages.
6. PNG overlays showing every classified source block and the inferred gutter.

## Audited result

| Item                             | Count |
| -------------------------------- | ----: |
| Pages                            |     3 |
| Heading nodes                    |    32 |
| List nodes                       |     4 |
| Paragraph nodes                  |    31 |
| Table nodes                      |     2 |
| Metadata nodes                   |     3 |
| Continuation links               |     4 |
| Line-end hyphen joins            |    21 |
| Nonbreaking-space normalizations |     1 |

The core Barbarian traits table is detected as one left-column table. The Barbarian progression
table is detected as one full-width table with 27 contributing source blocks. Body text does not
merge across the column gutter.

## Known limitations

- Table cells remain source-ordered text; typed class-trait and progression records belong to the
  next repeated-parser stage.
- Continuation links are geometry and node-type heuristics and still require review.
- Inline bold labels remain within paragraph nodes rather than becoming nested semantic spans.
- Line-end ASCII hyphen joins use block geometry and lowercase continuation signals. Each join is
  retained in the transformation ledger for reversal and review.
