# D&D SRD Character Manager

A deterministic, versioned D&D SRD 5.2.1 rules engine and character manager. The repository
currently provides strict schemas, reproducible source extraction, a validated content package,
reviewable authoring IR, a traced declarative rules evaluator with atomic state-transition
proposals, and a local-first web character sheet.

## Use it now

Install the workspace and start the web interface:

```bash
corepack pnpm install
corepack pnpm web
```

Open `http://localhost:3000`. The app includes all reviewed character fixtures and lets you switch
between them, inspect overview/combat/spell/feature views, open the calculation trace behind a
derived value, and import or export the canonical character JSON. Imported characters stay in the
browser's local storage; the app has no account, server, or database dependency. A production build
is emitted as a static site in `apps/web/out` by `corepack pnpm build`.

The CLI remains useful for automation and does not require the web interface. Build once, then pass
a character JSON document to it:

```bash
corepack pnpm build
corepack pnpm character packages/test-fixtures/characters/fighter-5.json
corepack pnpm character packages/test-fixtures/characters/cleric-5.json
corepack pnpm character packages/test-fixtures/characters/druid-5.json
corepack pnpm character packages/test-fixtures/characters/monk-5.json
corepack pnpm character packages/test-fixtures/characters/paladin-5.json
corepack pnpm character packages/test-fixtures/characters/ranger-5.json
corepack pnpm character packages/test-fixtures/characters/rogue-5.json
corepack pnpm character packages/test-fixtures/characters/sorcerer-5.json
corepack pnpm character packages/test-fixtures/characters/warlock-5.json
corepack pnpm character packages/test-fixtures/characters/wizard-5.json
```

The command prints the calculated sheet essentials and exits unsuccessfully when the engine finds
an error. Add `--json` to receive the complete evaluation, including values, attacks, spells,
resources, validations, and calculation traces:

```bash
corepack pnpm character packages/test-fixtures/characters/wizard-5.json --json
```

Character JSON remains the source document: copy one of the reviewed fixtures, give it a new ID and
name, and edit its choices and play-state. The schemas reject malformed documents, and the engine
reports rules-invalid choices without changing the input. The web app is currently a read-only
sheet; the choice-by-choice character builder and play-state controls are the next frontend slices.

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

Generate the typed Fighter-through-level-5 content from class pages 47–49, Ability Score
Improvement on page 87, and the Defense Fighting Style on page 88:

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

This parser validates all 20 progression rows, reconciles every feature reference, extracts the
Champion subclass, and generates draft authoring IR for the supported Fighter level 1–5 features.

Generate Wizard content from pages 77–82 and representative spell descriptions from pages
107–175:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-wizard \
  --pages 77-82 \
  --overlays

.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-spells \
  --pages 107-175

.venv/bin/python -m srd_extract.wizard \
  --class-extraction generated/extraction/srd-5.2.1-wizard \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

This parser validates all 20 Wizard progression rows, captures the 217-entry Wizard spell list,
extracts the Evoker subclass, and generates 20 source-linked representative spell entities with
structured casting, component, duration, attack, save, damage, Concentration, and Ritual fields.

Generate Cleric content from pages 36–40 using the already extracted spell descriptions:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-cleric \
  --pages 36-40 \
  --overlays

.venv/bin/python -m srd_extract.cleric \
  --class-extraction generated/extraction/srd-5.2.1-cleric \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Cleric parser validates all 20 progression rows, the 109-entry class spell list, Divine Order,
Life Domain and its always-prepared spell table, Channel Divinity scaling, and 17 source-linked
representative divine spells.

Generate Druid content from pages 41–46 using the already extracted spell descriptions:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-druid \
  --pages 41-46 \
  --overlays

.venv/bin/python -m srd_extract.druid \
  --class-extraction generated/extraction/srd-5.2.1-druid \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Druid parser validates all 20 progression rows, the 124-entry class spell list, Primal Order,
Circle of the Land and all four selectable land-spell tables, Wild Shape scaling, and 12
source-linked representative primal spells.

Generate Monk content from pages 49–53:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-monk \
  --pages 49-53 \
  --overlays

.venv/bin/python -m srd_extract.monk \
  --extraction generated/extraction/srd-5.2.1-monk \
  --output packages/content-srd-5.2.1/generated
```

The Monk parser validates all 20 progression rows, captures Martial Arts, Focus Point, and
Unarmored Movement scaling, extracts the Warrior of the Open Hand, and generates source-linked
authoring IR for the supported level-1–5 resource, defense, attack, and action mechanics.

Generate Paladin content from pages 53–57 using the shared spell-description extraction:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-paladin \
  --pages 53-57 \
  --overlays

.venv/bin/python -m srd_extract.paladin \
  --class-extraction generated/extraction/srd-5.2.1-paladin \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Paladin parser validates all 20 progression rows, the 38-entry class spell list, Lay On Hands
and Channel Divinity scaling, the Oath of Devotion and its always-prepared spells, and five
source-linked representative sacred spells.

Generate Ranger content from pages 57–61 using the shared spell-description extraction:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-ranger \
  --pages 57-61 \
  --overlays

.venv/bin/python -m srd_extract.ranger \
  --class-extraction generated/extraction/srd-5.2.1-ranger \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Ranger parser validates all 20 progression rows, the 48-entry class spell list, Favored Enemy
scaling, the Hunter and its rest-changeable Hunter’s Prey choice, and five source-linked
representative wilderness spells.

Generate Rogue content from pages 61–64:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-rogue \
  --pages 61-64 \
  --overlays

.venv/bin/python -m srd_extract.rogue \
  --extraction generated/extraction/srd-5.2.1-rogue \
  --output packages/content-srd-5.2.1/generated
```

The Rogue parser validates all 20 progression rows and Sneak Attack scaling, extracts every Rogue
and Thief feature, structures all three level-5 Cunning Strike options, and generates source-linked
authoring IR for the supported attack, action, defense, and movement mechanics.

Generate Sorcerer content from pages 64–70 using the shared spell-description extraction:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-sorcerer \
  --pages 64-70 \
  --overlays

.venv/bin/python -m srd_extract.sorcerer \
  --class-extraction generated/extraction/srd-5.2.1-sorcerer \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Sorcerer parser validates all 20 progression rows, the 138-entry class spell list, all ten
Metamagic options, and all five Draconic Sorcery features. It generates seven source-linked
representative spells plus authoring IR for Sorcery Points, Innate Sorcery, Sorcerous Restoration,
Quickened Spell, Subtle Spell, and Draconic Resilience.

Generate Warlock content from pages 70–76 using the shared spell-description extraction:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-warlock \
  --pages 70-76 \
  --overlays

.venv/bin/python -m srd_extract.warlock \
  --class-extraction generated/extraction/srd-5.2.1-warlock \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Warlock parser validates all 20 progression rows, the 72-entry class spell list, all 28
Eldritch Invocations and their prerequisites, and all five Fiend Patron features. It generates six
source-linked representative spells and authoring IR for Magical Cunning’s limited Pact-slot
recovery.

Generate the Human and Soldier origin slice from pages 83, 86, and 87:

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

This parser generates typed Human, Soldier, Savage Attacker, and Skilled entities plus
roll-assisted Savage Attacker authoring IR.

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

The rules kernel evaluates reviewed level-1 Barbarian and level-5 Fighter, Cleric, Druid, Monk,
Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard fixtures in its integration suite. Results
include origin and feat ability increases, subclass features, species size and speed, typed skill and saving-throw
proficiencies, d20-test roll states, Initiative, Passive Perception, inventory, armor and Shield
candidates, weapon and Martial Arts attacks and damage, spellbook, full-list, and Pact Magic
models, class- and subclass-granted always-prepared spells, selectable Circle of the Land spells,
spell slots, spell attacks and save DC, Weapon Mastery metadata, attacks per Attack action, critical-hit
thresholds, Hit Points, feature resources, variable resource spending and restoration, conditional
actions, resistances, validations, coverage warnings, and calculation traces.

The rules kernel also exposes atomic Short Rest, Long Rest, action-use, and spell-cast proposals.
Transition processing validates explicit dice results and available spell slots, previews
field-level state changes and resource recharge or spending, restores Pact Magic on Short Rests,
manages Concentration including resource-backed free spell actions, applies Human Resourceful, and
preserves a trace without mutating the input character.
