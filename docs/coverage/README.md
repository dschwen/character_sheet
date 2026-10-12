# Rules coverage

Generated from the current package by `python -m srd_extract.coverage`.

Counts describe loaded entities, not completeness of SRD extraction. Builder limits describe implemented workflows, not semantic review approval. Proposed rules remain unverified until separately reviewed.

| Status | Loaded entities |
| --- | ---: |
| UNCLASSIFIED | 0 |
| TEXT_ONLY | 0 |
| STRUCTURED | 871 |
| EXECUTABLE | 0 |
| TESTED | 0 |
| VERIFIED | 0 |

## Implemented single-class builder and advancement limits

| Class | Minimum level | Maximum level |
| --- | ---: | ---: |
| Barbarian | 1 | 9 |
| Bard | 1 | 9 |
| Cleric | 1 | 9 |
| Druid | 1 | 9 |
| Fighter | 1 | 9 |
| Monk | 1 | 9 |
| Paladin | 1 | 9 |
| Ranger | 1 | 9 |
| Rogue | 1 | 9 |
| Sorcerer | 1 | 9 |
| Warlock | 1 | 9 |
| Wizard | 1 | 9 |

## Review evidence

- Authoring IR records: 61.
- Semantics approved: 0.
- Tests approved: 0.

Passing automated tests is not independent semantic or test-review approval.
Level-20 progression tables do not imply automated level-20 support.
See `docs/rules-engine` for class-specific assisted mechanics and limits.

## Loaded entity families

| Kind | Count |
| --- | ---: |
| background | 4 |
| class | 12 |
| class-feature | 174 |
| class-option | 55 |
| condition | 15 |
| equipment-ammunition | 5 |
| equipment-armor | 12 |
| equipment-gear | 83 |
| equipment-shield | 1 |
| equipment-weapon | 38 |
| feat | 12 |
| rule-table | 14 |
| species | 9 |
| spell | 339 |
| status | 17 |
| subclass | 12 |
| subclass-feature | 58 |
| subclass-option | 8 |
| weapon-property | 3 |

Regenerate after content changes:

```bash
PYTHONPATH=extraction .venv/bin/python -m srd_extract.coverage \
  --output packages/content-srd-5.2.1/generated \
  --markdown docs/coverage/README.md
```
