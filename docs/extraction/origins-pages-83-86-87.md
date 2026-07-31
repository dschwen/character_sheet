# Human and Soldier origin extraction audit

The first origin slice combines the Soldier background on page 83, Human species on page 86, and
the Savage Attacker and Skilled Origin feats on page 87.

## Reproduction

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-origins \
  --pages 83,86-87 \
  --overlays

.venv/bin/python -m srd_extract.origins \
  --extraction generated/extraction/srd-5.2.1-origins \
  --output packages/content-srd-5.2.1/generated
```

## Generated entities

| Entity                               | Page |
| ------------------------------------ | ---: |
| `srd521.background.soldier`          |   83 |
| `srd521.species.human`               |   86 |
| `srd521.feat.origin.savage-attacker` |   87 |
| `srd521.feat.origin.skilled`         |   87 |

Soldier retains its three allowed ability scores, both increase patterns, fixed feat and skill
grants, Gaming Set choice, and equipment text. Human retains creature type, size options, walking
speed, Resourceful, Skillful, Versatile, and the recommended Skilled selection.

Savage Attacker has roll-assisted authoring IR. Skilled remains structured content whose selected
skill proficiencies are interpreted by the origin-choice evaluator.

## Known boundary

The parser intentionally extracts only the entities needed by the first Fighter vertical slice.
Other backgrounds, species, and Origin feats remain outside this audit. Gaming Set and Skilled tool
choices are preserved as structured options but are not yet represented by the character model.
