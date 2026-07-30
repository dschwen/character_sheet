# D&D SRD Character Manager

A deterministic, versioned D&D SRD 5.2.1 rules engine and character manager. The repository
currently provides strict schemas, reproducible source extraction, a validated content package,
reviewable authoring IR, and a traced declarative rules evaluator with atomic state-transition
proposals.

## Requirements

- Node.js 22 or newer
- pnpm 10.6.5 (Corepack can provide it)
- Python 3.12
- Poppler (`pdfinfo` and `pdftotext`) for source acquisition

## Development

```bash
corepack pnpm install
corepack pnpm check
corepack pnpm build

python -m venv .venv
.venv/bin/pip install -e './extraction[dev]'
.venv/bin/ruff check extraction
.venv/bin/mypy extraction
.venv/bin/pytest extraction
```

## Acquire the pinned SRD

The source PDF is deliberately not committed. Acquisition is immutable and verifies both its page
count and known SHA-256:

```bash
cd extraction
python -m srd_extract.acquire \
  --url https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf \
  --expected-pages 364 \
  --expected-sha256 8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87 \
  --output ../sources/wotc-srd-5.2.1-en
```

The command extracts page 1 for attribution review. It intentionally does not invent or guess the
required notice language.

## Run the layout extraction proof of concept

The first extraction slice covers PDF pages 28–30: the Barbarian class introduction, core-traits
table, progression table, and feature text.

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1 \
  --pages 28-30 \
  --overlays
```

The pipeline writes independent raw, classified-layout, normalized-page, document-tree, and visual
overlay artifacts. Generated extraction output is ignored because it is reproducible from the
pinned source.

Generate the typed Barbarian proof-of-concept content and draft authoring IR:

```bash
.venv/bin/python -m srd_extract.barbarian \
  --extraction generated/extraction/srd-5.2.1 \
  --output packages/content-srd-5.2.1/generated
```

This command parses both class tables, reconciles the progression against feature headings, and
generates source-linked draft mechanics for Rage and Unarmored Defense.

Generate the typed Fighter content from class pages 47–48 and the Defense Fighting Style on page
88:

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

This parser validates all 20 progression rows, reconciles every feature reference, and generates
draft authoring IR for Second Wind and the Defense Fighting Style.

Generate the structured weapon and armor entities from SRD pages 91–92:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-equipment \
  --pages 91-92

.venv/bin/python -m srd_extract.equipment \
  --extraction generated/extraction/srd-5.2.1-equipment \
  --output packages/content-srd-5.2.1/generated
```

The rules kernel evaluates reviewed level-1 Barbarian and Fighter fixtures in its integration
suite. Results include ability modifiers, typed skill and saving-throw proficiencies, d20-test roll
states, Initiative, Passive Perception, inventory, armor and Shield candidates, weapon attacks and
damage, Weapon Mastery metadata, Hit Points, feature resources, conditional actions, resistances,
validations, coverage warnings, and calculation traces.

The rules kernel also exposes atomic Short Rest, Long Rest, and action-use proposals. Transition
processing validates explicit dice results, previews field-level state changes and resource
recharge or spending, and preserves a trace without mutating the input character.
