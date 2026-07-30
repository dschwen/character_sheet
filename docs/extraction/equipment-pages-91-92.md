# Equipment extraction: SRD pages 91–92

The equipment proof of concept runs the layout pipeline over the pinned SRD pages 91–92 and parses
the full-width Weapons and Armor tables.

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-equipment \
  --pages 91-92 \
  --overlays

.venv/bin/python -m srd_extract.equipment \
  --extraction generated/extraction/srd-5.2.1-equipment \
  --output packages/content-srd-5.2.1/generated
```

The parser generates:

- 38 weapon entities with category, attack type, damage, properties, range, mastery, weight, and
  cost;
- 12 armor entities with AC formulas, Dexterity caps, Strength requirements, Stealth effects,
  weight, and cost;
- one Shield entity with its trained AC benefit.

Every entity cites its page and exact table-row block and includes a quote hash. Count assertions
make missing or merged rows fail generation.
