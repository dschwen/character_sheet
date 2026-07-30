# Fighter pages 47–48 extraction audit

The Fighter extraction combines the class layout on pages 47–48 with the Defense Fighting Style
definition on page 88.

## Reproduction

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-fighter \
  --pages 47-48,88 \
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
| Generated Fighter entities    |    18 |
| Resolved feature references   |    15 |
| Repeated feature references   |     8 |
| Subclass placeholders         |     4 |
| Unresolved feature references |     0 |

The parser validates the level sequence, Proficiency Bonus progression, Second Wind progression,
Weapon Mastery progression, core class traits, and progression-to-heading reconciliation.

## Generated mechanics

Second Wind is represented as a level-scaled resource, Short Rest and Long Rest recharge rules, and
a Bonus Action with source-linked healing parameters. Defense is represented as a feat rule that
adds 1 to Armor Class only while armor is worn.

The other Fighter features remain structured source text. Their presence in the content package
does not imply executable coverage.
