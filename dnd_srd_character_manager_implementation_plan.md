# D&D SRD Character Sheet Manager

## Concrete implementation and structured-rule extraction plan

**Target ruleset:** System Reference Document 5.2.1 (2024/“5.5e” rules)

**Plan version:** 0.1

**Prepared:** 2026-07-29

---

## 1. Executive summary

Build the project as two related products:

1. **A deterministic, versioned rules engine** that accepts a character's choices and current state and produces calculated statistics, available actions, resources, validations, and complete calculation traces.
2. **A web character manager** that edits the source choices, presents the derived sheet, tracks play-state, and explains every calculated value.

Do not treat the SRD PDF as if it can be converted directly into executable rules. Extraction should be a staged pipeline:

```text
Official PDF
  -> layout-aware document extraction
  -> normalized source document
  -> typed content entities
  -> rule-authoring intermediate representation
  -> reviewed executable rules
  -> generated package + tests
```

The first three transitions can be largely automated. The transition from prose to executable semantics must be reviewable and, for complex rules, explicitly authored and tested. An LLM may propose mappings, tests, and edge cases, but its output should never be accepted without schema validation, source-span traceability, and human review.

The recommended first release supports SRD 5.2.1 character creation and play-state for levels 1–5, then expands to all SRD classes through level 20, multiclassing, feats, equipment, spells, conditions, rests, and magic items. Monsters and encounter automation should be a separate later package.

---

## 2. Source, licensing, and reproducibility

### 2.1 Authoritative inputs

Use only official files as the source of truth:

- SRD landing page: <https://www.dndbeyond.com/srd>
- English SRD 5.2.1 PDF: <https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf>
- Conversion guide: <https://media.dndbeyond.com/compendium-images/srd/guide/converting-to-srd-5.2.1.pdf>
- CC-BY-4.0 legal code: <https://creativecommons.org/licenses/by/4.0/legalcode>

The official page identifies SRD 5.2.1 as the current English release and provides the publication date. The PDF itself contains the required attribution language. Copy that attribution exactly from page 1 into the distributed content package's `NOTICE.md`, rather than improvising alternate Wizards attribution.

This plan is engineering guidance, not legal advice.

### 2.2 Pin the exact source artifact

The ingestion command must save:

```yaml
source_id: wotc-srd-5.2.1-en
source_url: https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf
retrieved_at: 2026-07-30T02:10:00Z
sha256: 8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87
page_count: 364
license: CC-BY-4.0
```

Never overwrite an old source file. Store source PDFs under a content-addressed path:

```text
sources/
  wotc-srd-5.2.1-en/
    <sha256>/
      source.pdf
      source-metadata.json
      NOTICE.md
```

If Wizards releases SRD 5.2.2, create a new source version and produce a semantic diff. Existing characters continue to reference the package version they were created with until explicitly migrated.

### 2.3 Observed PDF characteristics

The current English PDF is:

- 364 pages;
- generated from Adobe InDesign;
- not a tagged PDF;
- supplied with a usable Unicode text layer;
- commonly laid out in two columns;
- rich in tables, small caps, bold and italic inline headings, sidebars, and continued entries across pages;
- susceptible to extraction artifacts such as discretionary hyphens, reading-order mistakes, and table-column mixing.

This means plain `pdftotext` output is useful for inspection but insufficient as the canonical extraction. Preserve bounding boxes, font information, page numbers, and column positions.

---

## 3. Product scope

### 3.1 Release 1 scope

Release 1 should support:

- one SRD 5.2.1 ruleset;
- accountless local characters plus optional authenticated cloud storage;
- ability scores and modifiers;
- level and proficiency bonus;
- SRD species, backgrounds, and origin feats;
- single-class characters through level 5 initially, then level 20;
- class and subclass features;
- skill and saving-throw proficiencies;
- hit points, hit dice, initiative, speed, senses, armor class, attacks, and damage;
- equipment, armor, shields, weapon mastery, currency, and inventory;
- spellcasting, spell lists, prepared/known spells, spell slots, spell attacks, and spell save DCs;
- resources and reset rules for Short Rest, Long Rest, and other explicit recharge events;
- active conditions, concentration, temporary hit points, death saves, and exhaustion;
- feats and magic-item effects relevant to a character sheet;
- multiclassing after single-class support is stable;
- rule-validation messages and source-linked calculation explanations;
- JSON import/export and printable sheet output.

### 3.2 Explicit non-goals for Release 1

Do not initially implement:

- automated tactical combat resolution;
- a virtual tabletop;
- monster AI;
- natural-language interpretation of arbitrary non-SRD books;
- unrestricted executable homebrew JavaScript;
- every situational ruling a GM may make;
- copyrighted non-SRD content distributed by the application.

A character sheet should represent situational modifiers and available actions without trying to decide every table ruling automatically.

### 3.3 Definition of “correctly implements all rules”

Use a measurable definition:

> For every supported character-building option and persistent play-state rule in the selected content package, the engine computes deterministic outputs, rejects or warns about illegal choices, preserves rule provenance, and passes reviewed examples and interaction tests.

Do not claim complete coverage merely because every SRD paragraph was imported. Maintain a rule-coverage ledger with statuses:

```text
UNCLASSIFIED -> TEXT_ONLY -> STRUCTURED -> EXECUTABLE -> TESTED -> VERIFIED
```

---

## 4. Repository and package architecture

Use a TypeScript monorepo with a framework-independent engine.

```text
dnd-character-manager/
  apps/
    web/                         # Next.js web application
    content-review/              # extraction/review UI
    cli/                         # validate, inspect, and migrate characters
  packages/
    character-model/             # persisted character schemas
    rules-core/                  # expression evaluator and effect engine
    rules-api/                   # public engine API and result types
    content-schema/              # Zod and JSON Schema definitions
    content-srd-5.2.1/           # reviewed generated/hand-authored package
    calculation-trace/           # provenance graph and rendering helpers
    test-fixtures/               # golden characters and interaction fixtures
    ui-components/               # reusable sheet/editor components
  extraction/
    acquire/
    layout/
    normalize/
    segment/
    parse/
    authoring-ir/
    review/
  sources/                       # ignored or Git LFS, depending on policy
  generated/                     # reproducible generated artifacts
  docs/
    adr/                         # architecture decision records
    coverage/
    rules-authoring/
```

Recommended tooling:

- Node.js current LTS;
- TypeScript with `strict` enabled;
- pnpm workspaces and Turborepo or Nx;
- Next.js for the web app;
- PostgreSQL with Drizzle or Prisma for cloud persistence;
- Zod as the runtime schema source, with generated JSON Schema;
- Vitest for unit and integration tests;
- fast-check for property-based tests;
- Playwright for browser workflows;
- Python 3.12 with PyMuPDF for extraction;
- Ruff, mypy, and pytest for the extraction code;
- GitHub Actions for reproducibility and validation.

---

## 5. Domain model

### 5.1 Persist choices, not calculated values

The persisted character document should contain user choices and mutable play-state. Derived statistics are cacheable outputs, never authoritative input.

```ts
export interface CharacterDocument {
  schemaVersion: string;
  id: string;
  name: string;
  ruleset: RulesetReference;
  build: CharacterBuild;
  loadout: CharacterLoadout;
  state: CharacterState;
  overrides: CharacterOverride[];
  metadata: CharacterMetadata;
}
```

```ts
export interface RulesetReference {
  system: "dnd5e";
  edition: "2024";
  packages: Array<{
    id: string;
    version: string;
    sha256: string;
  }>;
}
```

Separate the character into:

- **Build:** levels, classes, subclass, species, background, feats, ability choices, proficiencies, learned spells, permanent selections.
- **Loadout:** prepared spells, equipped items, attuned items, selected weapon masteries, active configurable feature choices.
- **State:** current HP, temporary HP, expended resources, spell slots, conditions, concentration, death saves, exhaustion, temporary effects.
- **Overrides:** explicit GM or user deviations, each labeled and auditable.

### 5.2 Preserve leveling history

Store class assignment by character level rather than only aggregate level counts:

```ts
export interface CharacterLevel {
  characterLevel: number;
  classId: EntityId;
  hitPointChoice: "rolled" | "fixed" | "manual";
  hitPointRoll?: number;
  selectedFeatureChoices: ChoiceSelection[];
}
```

This resolves starting-class proficiencies, per-level hit points, multiclass progression, and reproducible rebuilds.

### 5.3 Entity identifiers

Use stable, namespaced identifiers:

```text
srd521.class.barbarian
srd521.class-feature.barbarian.rage
srd521.spell.acid-arrow
srd521.equipment.weapon.longsword
srd521.rule.advantage
```

Never use display names as foreign keys. Entity aliases and renamed terms belong in separate metadata.

---

## 6. Rules-engine design

### 6.1 Engine input and output

```ts
export interface EvaluateCharacterInput {
  character: CharacterDocument;
  packages: LoadedRulesPackage[];
  context?: EvaluationContext;
}

export interface CharacterEvaluation {
  facts: FactStore;
  values: Record<StatId, DerivedValue>;
  proficiencies: ProficiencySummary;
  actions: ActionDefinition[];
  resources: ResourceInstance[];
  spells: SpellcastingSummary;
  inventory: InventorySummary;
  validations: ValidationMessage[];
  traces: Record<string, CalculationTrace>;
  coverageWarnings: CoverageWarning[];
}
```

### 6.2 Processing phases

Use explicit deterministic phases instead of an unconstrained event soup:

1. Load and validate content packages.
2. Normalize the character document.
3. Materialize base facts from choices and state.
4. Grant entities and features.
5. Resolve choice prerequisites and selected options.
6. Build candidate calculations.
7. Apply replacements and exceptions.
8. Apply additive modifiers.
9. Apply multipliers and die changes.
10. Apply floors, caps, and rounding.
11. Resolve advantage/disadvantage and proficiency states.
12. Generate actions, resources, and spellcasting models.
13. Run legality and consistency validators.
14. Produce traces and display-ready summaries.

The ordering must be documented and tested. A package may not inject arbitrary phase code.

### 6.3 Facts and expressions

Use a small declarative expression language:

```ts
export type Expr =
  | { kind: "literal"; value: JsonScalar }
  | { kind: "ref"; path: FactPath }
  | { kind: "add"; args: Expr[] }
  | { kind: "multiply"; args: Expr[] }
  | { kind: "floor"; value: Expr }
  | { kind: "min"; args: Expr[] }
  | { kind: "max"; args: Expr[] }
  | { kind: "if"; condition: Predicate; then: Expr; else: Expr }
  | { kind: "tableLookup"; table: EntityId; key: Expr };
```

```ts
export type Predicate =
  | { kind: "all"; args: Predicate[] }
  | { kind: "any"; args: Predicate[] }
  | { kind: "not"; arg: Predicate }
  | { kind: "equals"; left: Expr; right: Expr }
  | { kind: "compare"; op: "lt" | "lte" | "gt" | "gte"; left: Expr; right: Expr }
  | { kind: "hasEntity"; entityId: EntityId }
  | { kind: "hasTag"; subject: Expr; tag: string }
  | { kind: "isEquipped"; itemId: EntityId }
  | { kind: "resourceAvailable"; resourceId: EntityId };
```

The evaluator must be:

- deterministic;
- side-effect free;
- cycle detecting;
- bounded in complexity;
- safe to run in the browser;
- able to explain every reference and operation.

### 6.4 Effects

Do not force every rule into one universal modifier. Use typed effects:

```ts
export type RuleEffect =
  | GrantEntityEffect
  | GrantChoiceEffect
  | AddModifierEffect
  | AddCandidateCalculationEffect
  | ReplaceValueEffect
  | SetMinimumEffect
  | SetMaximumEffect
  | GrantProficiencyEffect
  | UpgradeProficiencyEffect
  | GrantAdvantageEffect
  | GrantDisadvantageEffect
  | GrantResistanceEffect
  | GrantImmunityEffect
  | GrantActionEffect
  | GrantResourceEffect
  | ModifyResourceEffect
  | ConfigureSpellcastingEffect
  | ModifyAttackEffect
  | AddValidationEffect;
```

Create dedicated semantics for:

- proficiency versus expertise;
- advantage/disadvantage cancellation;
- armor-class candidate formulas;
- attack ability substitution;
- resistance, vulnerability, and immunity;
- resource recharge;
- spell-slot progression;
- prepared-versus-known spell models;
- action economy;
- once-per-turn and limited-use effects.

### 6.5 General rules and exceptions

The SRD explicitly states that specific exceptions override general rules. Encode that principle through candidates and precedence rather than source-code conditionals.

Each operation should carry:

```ts
export interface RuleOperationMetadata {
  source: SourceReference;
  specificity: number;
  priority: number;
  stackingKey?: string;
  conflictPolicy: "combine" | "take-highest" | "take-lowest" | "replace" | "mutually-exclusive";
}
```

Use `priority` only as a documented tie-breaker. Prefer domain-specific conflict policies and explicit predicates.

### 6.6 Candidate calculations

Values such as Armor Class, attack ability, and movement mode may have multiple legal calculations.

```ts
export interface CalculationCandidate<T> {
  id: string;
  label: string;
  source: SourceReference;
  applicableWhen: Predicate;
  value: Expr;
  selection: "automatic-highest" | "automatic-lowest" | "user-choice";
}
```

The result should expose rejected candidates and reasons:

```ts
export interface DerivedValue<T = number> {
  value: T;
  selectedCandidate?: string;
  candidates?: Array<{
    id: string;
    applicable: boolean;
    value?: T;
    rejectionReasons: string[];
  }>;
  traceId: string;
}
```

### 6.7 Resources and recharge

```ts
export interface ResourceDefinition {
  id: EntityId;
  name: LocalizedText;
  maximum: Expr;
  recharge: RechargeRule[];
  spendActions?: ActionReference[];
}

export type RechargeRule =
  | { event: "short-rest"; amount: Expr | "all" }
  | { event: "long-rest"; amount: Expr | "all" }
  | { event: "initiative"; amount: Expr }
  | { event: "dawn"; amount: Expr | "all" }
  | { event: "manual" };
```

Rest processing should create a proposed state transition and a trace rather than mutating silently.

### 6.8 Validation

Validation is separate from calculation:

```ts
export interface ValidationMessage {
  id: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: LocalizedText;
  source?: SourceReference;
  paths: string[];
  suggestedFixes?: SuggestedFix[];
}
```

Permit invalid characters to be opened and edited. Errors prevent “rules-valid” status, not access to the character.

### 6.9 Calculation traces

Every displayed value should be inspectable:

```ts
export interface CalculationTrace {
  id: string;
  result: JsonValue;
  nodes: TraceNode[];
  sourceReferences: SourceReference[];
}
```

A trace node records:

- operation;
- inputs;
- output;
- rule source;
- candidate applicability;
- suppressed or conflicting contributions;
- rounding;
- user or GM overrides.

---

## 7. Content-package format

### 7.1 Package manifest

```yaml
id: srd-5.2.1
version: 0.1.0
ruleset: dnd5e-2024
source:
  id: wotc-srd-5.2.1-en
  sha256: 8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87
license: CC-BY-4.0
dependencies: []
engineCompatibility: ">=0.1.0 <0.2.0"
```

### 7.2 Content entity envelope

```ts
export interface ContentEntity<TBody> {
  id: EntityId;
  kind: EntityKind;
  name: LocalizedText;
  tags: string[];
  source: SourceSpan[];
  body: TBody;
  rules: RuleDefinition[];
  review: ReviewMetadata;
}
```

```ts
export interface SourceSpan {
  sourceId: string;
  page: number;
  blocks?: string[];
  quoteHash: string;
}
```

The source span must point to the extracted normalized text, not only a PDF page. `quoteHash` detects accidental source drift without redistributing the whole PDF inside every entity.

### 7.3 Separate text from mechanics

Each entity stores:

- display text licensed from the SRD;
- structured descriptive fields;
- executable effects;
- choices and prerequisites;
- validation rules;
- tests;
- review status.

A class feature may be `TEXT_ONLY` while extraction is complete but mechanics are not yet implemented. The application should expose this status during development and refuse to advertise complete support for it.

---

## 8. Structured SRD extraction pipeline

## 8.1 Extraction principles

1. **Preserve source fidelity before normalizing.**
2. **Retain page coordinates and typography.**
3. **Use deterministic parsers for repeated formats.**
4. **Store uncertain interpretations explicitly.**
5. **Require review for executable semantics.**
6. **Make the complete pipeline reproducible from the pinned PDF.**

### 8.2 Stage A: acquire and fingerprint

Implement:

```bash
python -m srd_extract.acquire \
  --url "$SRD_URL" \
  --expected-pages 364 \
  --output sources/wotc-srd-5.2.1-en/
```

The command should:

- download over HTTPS;
- calculate SHA-256;
- capture HTTP headers;
- run `pdfinfo`;
- verify the PDF is not encrypted;
- record page count and metadata;
- extract page 1 separately for licensing review;
- fail rather than silently replacing an existing artifact.

**Exit criterion:** a source manifest, immutable PDF, and verified hash exist.

### 8.3 Stage B: layout-aware extraction

Use PyMuPDF as the primary extractor and Poppler `pdftotext -bbox-layout` as an independent cross-check.

Extract each span with:

```python
@dataclass(frozen=True)
class TextSpan:
    page: int
    block_id: str
    bbox: tuple[float, float, float, float]
    text: str
    font: str
    size: float
    flags: int
    color: int
```

Also capture:

- images and vector regions;
- horizontal rules and table cell boundaries where available;
- page dimensions;
- links and bookmarks;
- crop and rotation;
- token-level bounding boxes for difficult tables.

Write one lossless JSON file per page:

```text
extraction/raw/pages/0001.json
...
extraction/raw/pages/0364.json
```

**Exit criterion:** all pages produce machine-readable spans, and a random 20-page visual audit matches the PDF.

### 8.4 Stage C: page-region classification

Classify recurring page regions:

- running header;
- running footer and page number;
- left column;
- right column;
- full-width heading;
- full-width table;
- sidebar/callout;
- illustration;
- footnote/legal content.

Start with deterministic geometry and typography:

- column midpoint derived from page width and content density;
- heading styles inferred from font, size, color, and vertical spacing;
- footers recognized by y-position and repeated text;
- full-width tables recognized by spans crossing the center gutter;
- sidebars recognized by bounding boxes, background regions, and font style.

Store confidence and reasons:

```json
{
  "regionType": "left-column",
  "confidence": 0.99,
  "signals": ["x-range", "body-font", "gutter-separation"]
}
```

**Exit criterion:** no body paragraphs are merged across columns in the audited sample.

### 8.5 Stage D: text normalization

Produce a normalized document while retaining links to raw spans.

Normalization rules:

- join words broken by discretionary line-end hyphenation only when dictionary and geometry checks support it;
- preserve actual compound hyphens such as “Short-Rest-like” constructions;
- normalize ligatures and smart punctuation to consistent Unicode;
- collapse line wraps inside paragraphs;
- preserve paragraph boundaries;
- preserve list item boundaries and numbering;
- preserve inline emphasis spans;
- remove running headers, footers, and page numbers;
- represent cross-page continuation explicitly;
- never normalize dice notation, plus signs, ranges, units, or capitalization without a typed rule;
- keep both `rawText` and `normalizedText`.

Do not use a general spellchecker. D&D terms, names, capitalization, and dice expressions are semantically important.

Add a normalization report:

```json
{
  "joinedHyphens": 812,
  "uncertainHyphens": 37,
  "removedHeaders": 360,
  "removedFooters": 364,
  "warnings": []
}
```

**Exit criterion:** every normalization can be traced to raw spans and reversed for inspection.

### 8.6 Stage E: document segmentation

Use the table of contents and heading-style hierarchy to divide the document into:

```text
legal-information
playing-the-game
character-creation
classes
character-origins
feats
equipment
spells
rules-glossary
gameplay-toolbox
magic-items
monsters
animals
```

Within sections, create typed nodes:

```ts
export type DocumentNode =
  SectionNode | HeadingNode | ParagraphNode | ListNode | TableNode | StatBlockNode | SidebarNode;
```

Each node contains page/source-span references and parent/child relationships.

**Exit criterion:** every non-header/footer text span belongs to exactly one document node or an explicit `UNCLASSIFIED` bucket.

### 8.7 Stage F: entity extraction

Write a dedicated parser for each repeated entity family. Avoid one giant grammar.

#### Classes

Extract:

- class name;
- core class traits table;
- multiclass traits;
- level-progression table;
- class features with level and name;
- subclass feature progression;
- spell list where applicable;
- choice lists and proficiency lists;
- source spans.

Use the level table as an independent consistency check against feature headings. A feature listed at level 5 in the table but parsed under another level should fail review.

#### Backgrounds

Extract:

- abilities;
- feat;
- skill proficiencies;
- tool proficiency;
- equipment choices;
- narrative text.

#### Species

Extract:

- creature type;
- size choices;
- speed;
- traits;
- embedded spell choices and level gates.

#### Feats

Extract:

- category;
- prerequisite;
- repeatability;
- benefit subsections;
- ability-score increases;
- granted proficiencies, actions, spells, and modifiers.

#### Equipment

Extract distinct entities for:

- coins;
- weapons;
- weapon properties;
- mastery properties;
- armor;
- tools;
- adventuring gear;
- packs;
- mounts and vehicles;
- services and expenses.

Tables should become typed records, not Markdown table strings.

#### Spells

Extract:

- name;
- level;
- school;
- class list annotation;
- casting time;
- ritual flag;
- range;
- components and material text;
- duration and concentration flag;
- body sections;
- higher-level scaling section;
- cantrip-upgrade section;
- source spans.

Keep the descriptive body as structured paragraphs before attempting semantic interpretation.

#### Rules glossary

Extract:

- term;
- tags in brackets;
- definition paragraphs;
- “See also” links;
- subentries;
- aliases and abbreviations.

Resolve cross-references to entity IDs and report broken links.

#### Magic items

Extract:

- item name;
- category;
- rarity;
- attunement requirement;
- charges and recharge;
- bonus and effect sections;
- variants;
- source spans.

#### Monsters

Defer monster stat blocks until the character rules are stable. They require a different schema and are not necessary for the first character-sheet release.

**Exit criterion:** all expected entities are accounted for in a section manifest, including entities marked `TEXT_ONLY`.

### 8.8 Stage G: authoring intermediate representation

The typed extraction is still not executable. Convert it into an authoring IR that keeps prose, structured fields, and proposed mechanics together:

```yaml
id: srd521.class-feature.barbarian.unarmored-defense
kind: class-feature
source:
  - page: 29
    blocks: [p29-b17, p29-b18]
text:
  title: Unarmored Defense
  paragraphs:
    - "..."
proposedRules:
  - type: add-candidate-calculation
    target: armor-class
    when:
      not:
        wearingArmor: true
    expression:
      add:
        - 10
        - ref: ability.dexterity.modifier
        - ref: ability.constitution.modifier
review:
  extraction: approved
  semantics: needs-review
  tests: missing
```

The IR is edited through pull requests or a review application. Generated package files are not manually edited.

### 8.9 Stage H: semantic rule authoring

Classify each paragraph or subsection into one or more semantic patterns:

- static grant;
- level-gated grant;
- choice grant;
- prerequisite;
- value formula;
- candidate replacement;
- modifier;
- advantage/disadvantage;
- proficiency or expertise;
- resistance/immunity/vulnerability;
- action definition;
- resource and recharge;
- state transition;
- roll modification;
- conditional substitution;
- validation only;
- descriptive/non-sheet rule;
- requires-GM-adjudication.

For repeated patterns, use templates. Examples:

```yaml
useTemplate: ability-score-improvement-feature
parameters:
  level: 4
  repeatsAt: [8, 12, 16]
```

```yaml
useTemplate: spellcasting-save-dc
parameters:
  ability: charisma
```

Complex feature prose should be represented as multiple effects and actions, not a single opaque script.

### 8.10 Role of LLM-assisted extraction

An LLM can safely assist with:

- proposing entity boundaries;
- converting reviewed prose into draft IR;
- suggesting semantic templates;
- generating candidate unit tests and edge cases;
- identifying cross-rule interactions;
- comparing the normalized source against a generated human-readable rendering.

Guardrails:

- input is limited to source spans and the current schema;
- output must validate against JSON Schema;
- no output is merged without source-linked review;
- confidence is not treated as correctness;
- drafts cannot modify source text;
- the reviewer sees a side-by-side source excerpt, proposed semantics, generated explanation, and tests;
- deterministic regression tests must fail when the underlying source-span hash changes.

Do not ask an LLM to produce one complete SRD JSON dump in a single pass.

### 8.11 Stage I: review application

Build a small internal review UI with:

- PDF page image on the left;
- normalized source and spans in the middle;
- structured entity and executable rule form on the right;
- schema errors inline;
- unresolved references;
- semantic diff from previous version;
- generated calculation examples;
- reviewer status and notes;
- “approve extraction,” “approve semantics,” and “approve tests” as separate actions.

Review queue filters:

```text
UNCLASSIFIED
LOW_EXTRACTION_CONFIDENCE
BROKEN_REFERENCE
SEMANTICS_MISSING
SEMANTICS_CHANGED
TESTS_MISSING
SOURCE_HASH_CHANGED
```

### 8.12 Stage J: package generation

A generator should produce:

```text
packages/content-srd-5.2.1/generated/
  manifest.json
  entities/
    classes.json
    class-features.json
    backgrounds.json
    species.json
    feats.json
    equipment.json
    spells.json
    glossary.json
    magic-items.json
  rules/
  indexes/
  coverage.json
  NOTICE.md
```

Generation must be deterministic. Running it twice from the same source and reviewed IR must produce byte-identical output.

---

## 9. Data schemas by domain

### 9.1 Class

```ts
export interface ClassDefinition {
  id: EntityId;
  primaryAbilities: AbilityId[];
  hitPointDie: Die;
  savingThrowProficiencies: AbilityId[];
  skillProficiencyChoice: ChoiceDefinition;
  weaponProficiencies: ProficiencyGrant[];
  armorTraining: ProficiencyGrant[];
  startingEquipment: EquipmentChoiceSet[];
  multiclass: MulticlassDefinition;
  progression: ClassLevelDefinition[];
  subclassChoice?: ChoiceDefinition;
  spellcasting?: ClassSpellcastingDefinition;
}
```

### 9.2 Feature and choice

```ts
export interface FeatureDefinition {
  id: EntityId;
  level?: number;
  parentId: EntityId;
  choices: ChoiceDefinition[];
  effects: RuleEffect[];
  actions: ActionDefinition[];
  resources: ResourceDefinition[];
  validations: ValidationRule[];
}
```

```ts
export interface ChoiceDefinition {
  id: string;
  prompt: LocalizedText;
  minimum: Expr;
  maximum: Expr;
  options: ChoiceOptionSource;
  prerequisites?: Predicate;
  distinctBy?: "entity" | "proficiency" | "tag";
  replacementPolicy?: "replace-on-level-up" | "fixed" | "configurable-on-rest";
}
```

### 9.3 Spell

```ts
export interface SpellDefinition {
  id: EntityId;
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  school: SpellSchool;
  classes: EntityId[];
  castingTime: CastingTime;
  range: RangeDefinition;
  components: SpellComponents;
  duration: DurationDefinition;
  concentration: boolean;
  ritual: boolean;
  targeting?: TargetingDefinition;
  attackOrSave?: SpellAttackOrSave;
  damage?: DamageExpression[];
  healing?: HealingExpression[];
  scaling?: ScalingRule[];
  effects: RuleEffect[];
  text: StructuredText;
}
```

Do not require every spell to have fully automated targeting or damage before it can be displayed. Maintain distinct `structured` and `automated` coverage flags.

### 9.4 Weapon

```ts
export interface WeaponDefinition {
  id: EntityId;
  category: "simple" | "martial";
  mode: "melee" | "ranged";
  cost: Money;
  damage: DiceExpression;
  damageType: DamageType;
  weight?: Weight;
  properties: WeaponPropertyInstance[];
  mastery: EntityId;
}
```

### 9.5 Armor

```ts
export interface ArmorDefinition {
  id: EntityId;
  category: "light" | "medium" | "heavy" | "shield";
  cost: Money;
  baseArmorClass?: number;
  dexterityContribution?: {
    allowed: boolean;
    maximum?: number;
  };
  strengthRequirement?: number;
  stealthDisadvantage: boolean;
  weight?: Weight;
  effects: RuleEffect[];
}
```

---

## 10. Calculation semantics to implement first

Implement these in this order because later systems depend on them:

1. Ability scores and modifiers.
2. Character level and class levels.
3. Proficiency bonus table.
4. Proficiency states: none, half, proficient, expertise.
5. D20-test bonus construction.
6. Advantage/disadvantage state and cancellation.
7. Saving throws and skills.
8. Speed and movement modes.
9. Armor Class candidates.
10. Hit-point maximum and per-level history.
11. Attacks: ability selection, proficiency, magic bonus, damage.
12. Inventory and equipment predicates.
13. Resources and rest transitions.
14. Spellcasting ability, attack bonus, save DC, slots, preparation.
15. Feats and feature choices.
16. Active conditions and concentration.
17. Multiclass spell-slot progression and class-specific preparation.
18. Magic items and attunement.
19. Situational actions and roll modifiers.

---

## 11. Web application plan

### 11.1 Core pages

```text
/characters
/characters/new
/characters/:id/build
/characters/:id/sheet
/characters/:id/spells
/characters/:id/inventory
/characters/:id/play
/characters/:id/audit
/content/:entityId
```

### 11.2 Builder workflow

The builder is a projection over unresolved choices:

1. Select ruleset/package versions.
2. Choose starting class.
3. Choose background and species.
4. Assign ability scores.
5. Resolve every granted choice in dependency order.
6. Show warnings and unmet prerequisites immediately.
7. Preview all changed derived values before committing a level-up.

Do not hard-code wizard pages for each class. Build UI controls from `ChoiceDefinition` and add specialized renderers only where generic controls are inadequate.

### 11.3 Sheet behavior

Every calculated field opens an explanation panel containing:

- selected calculation;
- all contributions;
- rejected alternatives;
- source entities;
- active conditions;
- warnings;
- manual overrides.

### 11.4 Play mode

Play mode should support atomic commands:

```ts
spendResource(resourceId, amount);
applyDamage(amount, damageType, metadata);
heal(amount);
setTemporaryHitPoints(amount);
startConcentration(spellId);
applyCondition(conditionId);
finishShortRest();
finishLongRest();
```

Commands return a proposed patch, validation messages, and a trace. Persist an append-only event log optionally so state changes can be undone and audited.

### 11.5 Offline and persistence

Start with IndexedDB/local storage through a repository abstraction. Add cloud sync later without changing the engine.

```ts
export interface CharacterRepository {
  get(id: string): Promise<CharacterDocument | null>;
  list(): Promise<CharacterSummary[]>;
  save(character: CharacterDocument, expectedRevision?: number): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Use optimistic concurrency for cloud edits.

---

## 12. API design

The web app can run most evaluation locally. Server APIs are for storage, sharing, migration, and rendering.

```text
POST /api/evaluate-character
POST /api/validate-character
POST /api/migrate-character
GET  /api/content/:package/:version/:entity
POST /api/characters
PUT  /api/characters/:id
GET  /api/characters/:id
POST /api/characters/:id/share
```

Do not make the server the only way to calculate a sheet. The engine package should run identically in browser, Node.js, and tests.

---

## 13. Testing and verification plan

### 13.1 Extraction tests

- page count and source hash checks;
- expected heading and section checks;
- page-region snapshot tests;
- table parser fixtures;
- hyphenation and paragraph reconstruction fixtures;
- entity-count manifests;
- no orphan text spans;
- no unresolved source references;
- visual overlays for sampled pages.

For visual overlays, render the PDF page and draw extracted region boxes. Store selected review images in test artifacts, not every page in Git.

### 13.2 Schema tests

- every generated entity validates;
- all entity IDs are unique;
- all references resolve;
- all source spans resolve;
- no dependency cycles;
- every choice has a resolvable option source;
- every rule target is registered;
- every expression is type-correct.

### 13.3 Focused rules tests

Examples:

- ability modifiers round down correctly;
- ordinary proficiency is not added twice;
- expertise doubles only the proficiency component;
- advantage and disadvantage cancel regardless of count;
- medium armor caps Dexterity contribution;
- heavy armor ignores Dexterity contribution;
- an alternative unarmored formula becomes an AC candidate rather than stacking;
- a shield applies only while equipped and as permitted by the feature;
- fixed and rolled HP histories reproduce maximum HP;
- a class resource has the correct maximum at each class level;
- Short Rest and Long Rest restore only the specified resources;
- a spellcasting feature uses the correct ability and progression;
- multiclass spell slots and per-class prepared spells remain separate.

### 13.4 Golden characters

Create reviewed character fixtures that cover:

```text
fighter-1-basic
fighter-5-champion-heavy-armor
rogue-5-thief-expertise
barbarian-5-berserker-unarmored
monk-5-open-hand
cleric-5-life-domain
wizard-5-evoker
bard-5-lore
paladin-5-devotion
ranger-5-hunter
sorcerer-5-draconic
warlock-5-fiend
multiclass-fighter-wizard
multiclass-paladin-warlock
```

Each fixture stores source choices and reviewed expected outputs. Avoid storing only a snapshot blob; assert critical values independently so a broad accidental snapshot update cannot hide errors.

### 13.5 Property-based tests

Use fast-check for invariants such as:

- adding two points to an ability never lowers its modifier;
- equipping an ordinary shield cannot reduce AC unless a conflicting rule explicitly disables a better candidate;
- current resources stay between zero and maximum after validated commands;
- a character's total class levels equal character level;
- derived outputs do not depend on object insertion order;
- evaluating the same input twice produces deep-equal output;
- serialization and deserialization preserve meaning;
- package order does not change results except where dependencies or explicit precedence specify it.

### 13.6 Differential and mutation testing

- Run the engine with rule operations reordered to ensure tests detect invalid phase changes.
- Mutation-test key formulas and predicates.
- Compare selected calculations against hand-worked reference sheets.
- Use another implementation only as a diagnostic cross-check, never as an authoritative source.

### 13.7 Coverage ledger

Generate a dashboard by entity and feature:

```yaml
entity: srd521.class-feature.barbarian.rage
extraction: approved
structure: approved
semantics: approved
tests:
  focused: 14
  interactions: 8
  goldenCharacters: 2
verifiedBy: [reviewer-id]
verifiedAt: 2026-08-15
```

A release report should state exact coverage rather than “all rules supported.”

---

## 14. Concrete implementation milestones

The estimates below are person-weeks for one experienced developer using coding assistance. They are ranges, not commitments.

### Milestone 0 — decisions and skeleton (1 week)

Deliverables:

- architecture decision records;
- monorepo and CI;
- strict TypeScript and Python projects;
- source acquisition command;
- initial schemas;
- license/notice handling;
- a one-page coverage dashboard.

Exit criteria:

- clean install and test from a fresh clone;
- source PDF can be acquired and fingerprinted;
- an empty content package loads and validates.

### Milestone 1 — extraction foundation (2–3 weeks)

Deliverables:

- page-span extraction;
- layout-region classifier;
- text normalization;
- document tree;
- visual overlay test tool;
- source-span viewer.

Exit criteria:

- audited pages from every major section reconstruct correctly;
- no cross-column paragraph merging in the audit set;
- every source span is traceable.

### Milestone 2 — content schemas and repeated parsers (3–4 weeks)

Deliverables:

- parsers for classes, origins, feats, equipment, spells, and glossary;
- authoring IR;
- entity manifests and reference resolver;
- review queue.

Exit criteria:

- every character-relevant section is segmented;
- all expected entities are present or explicitly `UNCLASSIFIED`;
- all parsed fields have source spans.

### Milestone 3 — engine kernel (3–4 weeks)

Deliverables:

- expression evaluator;
- predicate evaluator;
- effect phases;
- candidate calculations;
- proficiency and advantage semantics;
- resources;
- validations;
- calculation traces.

Exit criteria:

- engine evaluates a synthetic character package;
- deterministic and property tests pass;
- cycles and conflicting operations produce useful errors.

### Milestone 4 — first vertical slice (3 weeks)

Implement a Fighter through level 5 with Human, Soldier, a small equipment set, origin/general feats needed by the slice, and complete sheet calculations.

Deliverables:

- builder flow;
- inspectable sheet;
- inventory/equipment;
- HP and rests;
- attacks and Weapon Mastery;
- golden character tests.

Exit criteria:

- create, level, save, reload, export, and import a legal Fighter;
- every displayed numeric value has a trace;
- all supported choices are validated.

### Milestone 5 — spellcasting vertical slice (3–4 weeks)

Implement Wizard through level 5, spell preparation, spellbook choices, slots, attacks, save DC, concentration, and spell display.

Exit criteria:

- spell slots and preparation are reproducible;
- spell entries are source-linked;
- spellcasting calculation traces are complete;
- at least 20 representative spells have structured/automated fields and tests.

### Milestone 6 — all single classes through level 5 (5–7 weeks)

Add every SRD class and subclass through level 5 plus all origins, relevant feats, weapons, armor, and class spell lists.

Exit criteria:

- one reviewed golden character per class;
- feature coverage ledger has no unclassified class features through level 5;
- unsupported automation is clearly labeled without losing descriptive content.

### Milestone 7 — levels 6–20 (5–8 weeks)

Add progression, high-level resources, repeat choices, Epic Boons, higher-level spell slots, and high-level feature interactions.

Exit criteria:

- every SRD class level table reconciles with feature grants;
- one level-20 golden character for each class;
- all level-gated options validate.

### Milestone 8 — multiclassing (4–6 weeks)

Deliverables:

- prerequisites;
- first-class versus multiclass proficiency grants;
- class-level and character-level distinctions;
- multiclass spell slots;
- Pact Magic separation if required by the ruleset;
- per-class preparation and casting abilities;
- interaction tests.

Exit criteria:

- reviewed multiclass matrix covers every pair of casting models and representative martial combinations;
- leveling history remains reproducible.

### Milestone 9 — magic items and complete play-state (3–5 weeks)

Deliverables:

- attunement;
- charges and recharge;
- magic bonuses;
- conditions;
- concentration;
- death saves;
- temporary effects;
- Short Rest and Long Rest workflows.

Exit criteria:

- state transitions are atomic, reversible, and traced;
- item effects do not become active merely because an item is owned.

### Milestone 10 — beta hardening (3–5 weeks)

Deliverables:

- accessibility audit;
- mobile layout;
- printable sheet;
- migration framework;
- performance profiling;
- threat model;
- backup/export;
- public coverage report;
- bug-report bundle containing anonymized character JSON and traces.

Exit criteria:

- no critical rule-engine defects in the reviewed test matrix;
- package generation is reproducible in CI;
- beta users can diagnose calculations without developer intervention.

**Expected robust SRD character-manager effort:** roughly 30–45 person-weeks, depending on depth of spell automation, magic-item automation, review rigor, and UI polish. A useful levels-1–5 beta can emerge in roughly 12–18 person-weeks.

---

## 15. First 30 implementation tickets

1. Create monorepo and CI.
2. Define package boundaries and dependency rules.
3. Add `source-manifest.schema.json`.
4. Implement immutable PDF acquisition and SHA-256 verification.
5. Add license notice generation.
6. Extract per-page spans with PyMuPDF.
7. Extract independent bbox data with Poppler for comparison.
8. Build page overlay renderer.
9. Detect running headers and footers.
10. Detect page columns and full-width regions.
11. Implement paragraph reconstruction.
12. Implement reversible hyphen normalization.
13. Define document-node schema.
14. Segment top-level sections using TOC and heading styles.
15. Define content entity envelope and source spans.
16. Parse class core-trait tables.
17. Parse class level-progression tables.
18. Parse class feature headings and bodies.
19. Reconcile progression-table feature names with feature sections.
20. Parse weapon and armor tables.
21. Parse spell headers and field lines.
22. Parse glossary terms and cross-references.
23. Define authoring IR and review states.
24. Build minimal review UI.
25. Implement expression and predicate type checker.
26. Implement deterministic evaluator and cycle detection.
27. Implement calculation traces.
28. Implement proficiency and advantage/disadvantage semantics.
29. Implement Armor Class candidate system.
30. Complete and test the Fighter-level-1 vertical slice.

---

## 16. Rule-authoring workflow

For each extracted feature:

1. Reviewer approves the source boundary and normalized text.
2. Author assigns semantic pattern tags.
3. Author selects an existing template or creates typed effects.
4. Tool generates plain-language explanation from the effects.
5. Reviewer compares that explanation to the source.
6. Author adds at least one positive test and one inapplicability/edge test.
7. Interaction tests are added for every referenced subsystem.
8. Reviewer approves semantics and tests separately.
9. Package generator updates coverage and generated JSON.
10. CI validates reproducibility and runs the complete suite.

A feature is `VERIFIED` only after all ten steps.

---

## 17. Handling ambiguity and GM adjudication

Not every rule should become an automatic numeric effect. Support these implementation modes:

```ts
export type AutomationLevel =
  | "display-only"
  | "structured"
  | "sheet-automated"
  | "roll-assisted"
  | "state-automated"
  | "fully-automated";
```

Examples:

- A narrative utility feature may be `display-only`.
- A spell may have structured range/components but manually resolved effects.
- A passive AC feature can be `sheet-automated`.
- A feature that offers a once-per-turn optional die can be `roll-assisted`.
- A rest-recharged resource can be `state-automated`.

The app should never silently invent a GM ruling. It can present a choice or ask for a manual result and then apply the selected state change.

---

## 18. Homebrew and non-SRD content

Design packages now, but release homebrew authoring after the SRD engine stabilizes.

Homebrew packages should:

- declare dependencies and engine compatibility;
- use the same schemas and expression language;
- contain no arbitrary JavaScript;
- be versioned and pinned by characters;
- support private user-authored text;
- record provenance and authorship;
- distinguish compatible content from copied proprietary content;
- run in a sandboxed evaluator with complexity limits.

Campaign-specific rules such as War of the Burning Sky teleportation fire damage can then be implemented as an overlay package rather than a fork of the SRD engine.

---

## 19. Updating to future SRD versions

When a new SRD appears:

1. Acquire and fingerprint it as a new source.
2. Run layout extraction independently.
3. Align old and new document nodes using headings, entity IDs, and source similarity.
4. Produce text, field, and semantic diffs.
5. Mark every affected executable rule `SOURCE_CHANGED`.
6. Re-review affected semantics and tests.
7. Release a new content package version.
8. Provide a character migration preview.
9. Never mutate a pinned older package.

Migration output should state:

- changed entities;
- changed calculated values;
- invalidated choices;
- state conversions;
- rules that now require manual resolution.

---

## 20. Security and reliability

- Never evaluate rules through `eval`, `Function`, or dynamic module loading.
- Validate all package data at load time.
- Bound expression depth and collection sizes.
- Detect cycles with actionable traces.
- Treat imported characters and packages as untrusted input.
- Use content-security policy in the web app.
- Sanitize rendered SRD/homebrew rich text.
- Keep character calculations deterministic and independent of locale.
- Store units and money in typed canonical forms; localize only for display.
- Ensure user overrides are explicit and visually distinguishable.
- Provide export before destructive migrations.

---

## 21. Performance targets

Character datasets are small; optimize for correctness first.

Initial targets:

- cold rules package load under 500 ms on a typical laptop;
- full character evaluation under 50 ms;
- incremental UI response under 100 ms;
- content search under 100 ms after index load;
- deterministic package generation under 2 minutes in CI;
- no network dependency for local sheet calculation.

Start with full recomputation on every meaningful edit. Add dependency-based incremental recomputation only after profiling demonstrates a need.

---

## 22. Definition of done for the first public beta

The beta is ready when:

- SRD source and generated package are pinned and reproducible;
- all SRD classes are supported through level 5;
- origins, relevant feats, ordinary equipment, and spellcasting are usable;
- every calculated field has provenance;
- every unsupported mechanic is visibly labeled;
- legality errors and warnings are distinct;
- one golden character per class passes;
- all source references resolve;
- users can export/import their characters;
- no proprietary non-SRD content is bundled;
- the application includes the required SRD attribution;
- the published coverage report accurately describes limitations.

---

## 23. Immediate recommended next step

Implement one end-to-end proof of concept before extracting the entire PDF:

```text
SRD pages 28–30
  -> raw layout spans
  -> normalized Barbarian class document
  -> class traits and level table
  -> Rage and Unarmored Defense authoring IR
  -> executable effects
  -> level-1 Barbarian character JSON
  -> calculated HP, AC, Rage resource, resistances, and traces
  -> review UI showing source beside semantics
```

This slice exercises:

- two-column extraction;
- a full-width progression table;
- feature headings;
- level gates;
- resource maximum and recharge;
- conditional effects;
- an alternative Armor Class formula;
- resistance;
- action generation;
- explainability.

Do this before committing to a final schema. The proof of concept will reveal whether the extraction IR and rule DSL are expressive enough while changes are still inexpensive.

---

## Appendix A: Suggested architecture decisions

Create ADRs for:

1. Persist source choices, derive statistics.
2. TypeScript rules engine independent of React.
3. Declarative expressions instead of executable content code.
4. Explicit evaluation phases.
5. Candidate calculations for competing formulas.
6. Versioned content packages pinned by characters.
7. Source-span provenance for all extracted content.
8. Human-reviewed semantic extraction.
9. Invalid characters remain editable.
10. Full recomputation before incremental dependency optimization.
11. Separate character-sheet automation from encounter automation.
12. Official SRD PDF as source of truth.

## Appendix B: Example package-level CI pipeline

```yaml
jobs:
  verify-source:
    - acquire-or-load-pinned-source
    - verify-sha256
    - verify-page-count

  extract:
    - extract-layout
    - normalize-document
    - segment-document
    - parse-entities
    - compare-generated-artifacts

  validate-content:
    - validate-json-schema
    - resolve-references
    - validate-expressions
    - validate-source-spans
    - validate-coverage-ledger

  test-engine:
    - unit-tests
    - property-tests
    - golden-characters
    - interaction-tests
    - mutation-test-critical-modules

  test-web:
    - typecheck
    - component-tests
    - playwright-builder-flow
    - accessibility-checks

  package:
    - generate-content-package
    - generate-notice
    - generate-coverage-report
    - verify-reproducible-output
```

## Appendix C: Key risks and mitigations

| Risk                                         | Impact | Mitigation                                                                       |
| -------------------------------------------- | -----: | -------------------------------------------------------------------------------- |
| PDF reading order corrupts content           |   High | Bounding-box extraction, geometry-aware columns, visual overlays                 |
| Prose is mistaken for executable semantics   |   High | Separate typed extraction from reviewed rule authoring                           |
| Rule DSL becomes too generic and opaque      |   High | Typed domain effects and explicit phases                                         |
| Rule DSL is too narrow                       | Medium | Prove it on Barbarian, Wizard, multiclassing, and complex spells before freezing |
| Feature interactions explode combinatorially |   High | Property tests, pairwise matrices, golden characters, provenance traces          |
| Updates silently change old characters       |   High | Pin package versions and require explicit migrations                             |
| Non-SRD content creates licensing problems   |   High | Bundle only SRD; user/private package workflow for other content                 |
| LLM extraction introduces plausible errors   |   High | Schema-constrained drafts, source-span review, tests, no auto-merge              |
| UI becomes class-specific spaghetti          | Medium | Generic choice schema plus isolated specialized controls                         |
| “All rules” claim exceeds actual coverage    |   High | Generated coverage ledger and explicit automation levels                         |

## Appendix D: Useful commands for the extraction prototype

```bash
# Inspect metadata
pdfinfo sources/.../source.pdf

# Produce a quick layout-preserving text view
pdftotext -layout sources/.../source.pdf /tmp/srd-layout.txt

# Produce word/block bounding boxes for cross-checking
pdftotext -bbox-layout sources/.../source.pdf /tmp/srd-bbox.html

# Render selected pages for overlays
pdftoppm -f 28 -l 30 -png -r 144 sources/.../source.pdf /tmp/srd-page

# Run the proposed pipeline
python -m srd_extract.pipeline \
  --source sources/.../source.pdf \
  --out generated/extraction/srd-5.2.1

# Validate and generate the package
pnpm content:validate srd-5.2.1
pnpm content:generate srd-5.2.1

# Evaluate a fixture with traces
pnpm dnd-cli evaluate test-fixtures/barbarian-1.json --trace
```
