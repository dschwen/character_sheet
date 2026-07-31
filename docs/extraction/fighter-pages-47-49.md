# Fighter and Champion extraction audit

The Fighter extraction combines the class layout on pages 47–48, Champion on page 49, Ability Score
Improvement on page 87, and the Defense Fighting Style definition on page 88.

## Reproduction

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-fighter \
  --pages 47-49,87-88 \
  --overlays

.venv/bin/python -m srd_extract.fighter \
  --extraction generated/extraction/srd-5.2.1-fighter \
  --output packages/content-srd-5.2.1/generated
```

The layout output is ignored because it is reproducible from the pinned PDF. Typed entities,
authoring IR, reconciliation indexes, and the parser report are checked in.

## Audited result

| Item                          | Count |
| ----------------------------- | ----: |
| Progression rows              |    20 |
| Extracted feature sections    |    15 |
| Generated Fighter entities    |    26 |
| Extracted Champion features   |     6 |
| Resolved feature references   |    15 |
| Repeated feature references   |     8 |
| Subclass placeholders         |     4 |
| Unresolved feature references |     0 |

The parser validates the level sequence, Proficiency Bonus progression, Second Wind progression,
Weapon Mastery progression, core class traits, and progression-to-heading reconciliation.

## Generated mechanics

Second Wind and Action Surge are represented as resources with their distinct recharge rules.
Action Surge, Tactical Mind, Extra Attack, Tactical Shift, Improved Critical, Remarkable Athlete,
Ability Score Improvement, and Defense have source-linked authoring IR.

Fighter and Champion features above level 5 remain structured source text. Their presence in the
content package does not imply executable coverage.
