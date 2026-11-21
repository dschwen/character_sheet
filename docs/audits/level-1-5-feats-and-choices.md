# SRD level 1-5 feats and progression-choice audit

Date: 2026-11-20. Code baseline: `f76606d250e59a7efaebae0c8a0b8c300dde1891`.

## Verdict

**Not complete.** All ten distinct SRD feats available to a qualifying level-1-5 character are
represented and selectable through the appropriate ordinary grant paths. That is not equivalent
to complete progression support: the audit found eight groups of missing or incorrect choices,
including a separate feat-grant path that currently does not grant its feat at all.

The architecture is predominantly data-driven: shared catalogs, acquisition metadata, option
pickers and advancement guards drive the web flows. Some engine validation still enumerates
particular class features. The findings below should be fixed in source generators, shared
choice schemas and shared resolvers, not through new per-class React branches.

This is an engineering audit, not independent human extraction/semantics/test approval. No
review decisions, generated rules, application code or existing character documents were changed.

## Scope and evidence

- Pinned [SRD 5.2.1 PDF](../../sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf).
  Its file SHA-256 was recomputed and matches the package manifest:
  `8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`.
- Feat descriptions and rules, pages 87-88, were visually read from rendered PDF pages and
  compared with generated entities. Relevant class text was checked through the pinned PDF and
  normalized extraction. Scholar (78), Circle of the Land (46), invocation descriptions (73-74)
  and level advancement (23) were also visually cross-checked.
- Generated class/subclass choice metadata was enumerated for all twelve classes. A temporary
  diagnostic built and evaluated each class at levels 1, 2, 3, 4 and 5: **60 default builds**
  passed builder validation and produced no engine errors. This tests defaults, not every legal
  combination, and does not establish source correctness by itself.
- Additional diagnostic probes reproduced the Scholar, land-rest and invocation findings below.
  These probes asserted/printed current behavior, not desired behavior; their passing execution
  does not mean the defects are fixed.
- Eight existing builder/advancement/feat/tool test files passed **253 tests**. A fresh workspace
  production build succeeded. Existing browser evidence is scoped separately below.
- The live review queue reported **8 clean records and 55 records missing semantics and test
  decisions**, with no displayed stale/source-drift flags. Local human decisions already exist
  in the untracked review ledger. The checked-in generated coverage snapshot still reports zero
  applied semantics/test approvals. Neither snapshot was rewritten or reconciled by this audit.

Excluded from a completeness verdict: multiclassing, levels 6+, Epic Boons, non-SRD PHB content,
all spell outcomes, every class/subclass feature's combat semantics, beast/familiar stat blocks,
and a complete origin/equipment audit. A few cross-cutting omissions that directly affect
level-1-5 choice recording are explicitly included below.

## Feat matrix

"Implemented" here means the inspected grant/choice path exists and has focused tests. It is
not a formal verification designation. Manual encounter declarations are identified explicitly.

| SRD feat                  | Source | Acquisition and effect evidence                                                                                                                                                                                                                                  | Remaining boundary                                                                                                                                                   |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert                     | 87     | Origin/level-4 acquisition; Initiative adds PB; `feat-acquisition.test.ts`, `origin-backgrounds.test.ts`, browser Origin-feat scenario.                                                                                                                          | Initiative Swap is coordinated manually; no encounter/ally Initiative model.                                                                                         |
| Magic Initiate            | 87     | Three list-specific entities; two cantrips, one always-prepared level-1 spell, Int/Wis/Cha selection, free cast/Long Rest recharge, slotted casting and one same-level replacement per gained level. Creation/advancement pickers and browser acquisition exist. | List variants intentionally prevent repeating the same list. Casting effects retain their own assisted/manual limits. Invocation-granted acquisition is missing: F3. |
| Savage Attacker           | 87     | Once-per-turn weapon-hit declarations, two complete damage pools and either-pool selection; ordinary/critical/fallback browser cases.                                                                                                                            | Target damage, extra riders and turn-use tracking are manual. Not an Unarmed Strike benefit.                                                                         |
| Skilled                   | 87     | Repeatable mixed allowance of three skills/tools; original and per-acquisition records; shared source pools, validation, UI, persistence and legacy editor.                                                                                                      | Invocation-granted Skilled is not available through Lessons: F3. Tool ownership/crafting and skill/tool overlap adjudication are manual.                             |
| Ability Score Improvement | 87     | All twelve classes have a level-4 grant; +2 or +1/+1 allocation, cap 20, repeatability, prior-history guards; `ability-score-improvements.test.ts`, `advancement-feats.test.ts`.                                                                                 | Unrestricted grants must continue offering qualifying non-ASI categories; legacy unknown history is not invented.                                                    |
| Grappler                  | 87     | Level 4 and Str-or-Dex 13 prerequisite checked before its +1; Str/Dex allocation, cap 20, non-repeatability. Combat controls cover all three benefits; positive/negative browser cases.                                                                          | Target saves/conditions, turn declarations, positions and movement budgets are manual.                                                                               |
| Archery                   | 87     | Fighting Style prerequisite, selection through Fighter/Paladin/Ranger and qualifying unrestricted grants; +2 Ranged-weapon attack modifier.                                                                                                                      | Not a blanket bonus to every attack made at range.                                                                                                                   |
| Defense                   | 88     | Fighting Style prerequisite; traced +1 AC while armor is worn, via the source-linked Defense rule.                                                                                                                                                               | Armor/equipment state must be accurate; no benefit from a shield alone.                                                                                              |
| Great Weapon Fighting     | 88     | Shared conditional damage metadata/UI treats eligible weapon-damage 1s/2s as 3; two-handed declaration and weapon-property gates.                                                                                                                                | Hand usage is declared; unrelated extra damage is not automatically folded into the weapon pool.                                                                     |
| Two-Weapon Fighting       | 88     | Shared Light extra-attack damage mode retains the ability modifier once; acquisition through ordinary style and unrestricted grants.                                                                                                                             | Attack/Bonus Action budgets, distinct weapons and attack eligibility require declarations.                                                                           |

There are **12 SRD feat entities for these ten feats**, because Magic Initiate has three spell-list
variants. The two Ritual Caster entities are explicitly labeled PHB edition-reference variants,
not additional SRD feats. The seven Epic Boons on page 88 require level 19; their current absence
is outside this level-1-5 audit, not a missing level-4 selection.

## Class progression-choice matrix

Every class's catalog has one unrestricted feat grant at level 4. Spellcasting classes expose
their current spell/cantrip counts and level-appropriate pools through shared pickers. All twelve
SRD subclasses are present, one per class; more PHB subclasses are not an SRD requirement.

| Class     | Principal inspected choices through level 5                                                                                          | Result / qualification                                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barbarian | Class skills, two masteries growing to three at 4, feat at 4; Berserker at 3.                                                        | Initial/growth choices exist. Long Rest mastery reselection is missing: F8.                                                                                                                                                                  |
| Bard      | Three class skills, three instruments, two Expertise skills at 2; Lore bonus proficiencies at 3; spells and feat.                    | Catalog/count paths exist. Bard's one-cantrip/one-preparation level-up replacement metadata exists. No exhaustive browser pass over every skill combination.                                                                                 |
| Cleric    | Protector/Thaumaturge at 1, additional Thaumaturge cantrip, Life Domain spells, preparations and feat.                               | Both orders are offered. Class-level cantrip replacement is missing: F5.                                                                                                                                                                     |
| Druid     | Magician/Warden at 1, additional Magician cantrip, four land pools at 3, preparations and feat.                                      | Initial options exist. Terrain Long Rest change fails: F2; cantrip replacement is missing: F5. Wild Shape forms remain an assisted feature outside this choice audit's full semantics scope.                                                 |
| Fighter   | Four Fighting Styles at 1, style replacement on level-up, mastery growth, feat at 4; Champion at 3.                                  | Style and feat paths exist. Long Rest mastery reselection is missing: F8.                                                                                                                                                                    |
| Monk      | Skills, one artisan tool/instrument, Open Hand at 3, feat at 4.                                                                      | Initial catalog choices exist; active feature/combat semantics are not comprehensively re-audited here.                                                                                                                                      |
| Paladin   | Four styles or Blessed Warrior at 2; two Cleric cantrips and one replacement per later class level; Devotion and spell/feat choices. | Both grant paths exist, with source/ability attribution and browser coverage.                                                                                                                                                                |
| Ranger    | Masteries, one Deft Explorer Expertise at 2; four styles or Druidic Warrior and two Druid cantrips; two Hunter's Prey options at 3.  | Expertise/style/cantrip paths exist; Hunter's Prey is rest-replaceable. Extra languages are missing: F6; mastery reselection: F8.                                                                                                            |
| Rogue     | Two Expertise skills at 1, masteries, Thief at 3, feat at 4.                                                                         | Skill/count paths exist. Thieves' Cant language choice is missing: F6; mastery reselection: F8. Cunning Strike outcomes remain assisted.                                                                                                     |
| Sorcerer  | Two choices from all ten Metamagic options at 2, one option replacement per class level, Draconic spells, feat.                      | All ten names are available. Class-level cantrip replacement is missing: F5. Metamagic casting association and most option effects are assisted/text-only; Quickened/Subtle have point-spending actions.                                     |
| Warlock   | 28 invocation records, 22 with level floors at or below 5; select 1/3/3/3/5 at levels 1-5; Fiend and spell/feat choices.             | Counts, level floors and invocation-ID dependencies exist. Nested grants, repeatable targets and spell prerequisites are incomplete: F3-F4. Five records have no level-2+ floor; dependency/spell requirements still apply to other options. |
| Wizard    | Scholar at 2, Evoker at 3, two additional Savant spells at 3 and one at 5, spellbook/preparation growth, feat.                       | Spellbook choice paths exist. Scholar eligibility/engine validation is incorrect: F1. Long Rest cantrip replacement is missing: F5. Memorize Spell's Short Rest timing is not independently modeled/tested by this audit.                    |

Across all classes, the guided builder/advancement flow always records fixed HP: F7.

## Findings and reproductions

P1 = incorrect grants/validation or a legal progression choice blocked. P2 = missing recording or
rest workflow that prevents a claim of complete support. These are engineering priorities, not
formal review states. An engine result with no errors is explicitly not proof of legality.

### F1 - P1: Scholar hides legal skills and accepts illegal/missing selections in the engine

Source: page 78, Scholar; normalized `p0078-n008` in the Wizard extraction. The source permits
one of six named skills in which the character is proficient, regardless of proficiency source.

`expertiseSkillCandidates` in `apps/web/src/lib/character-builder.ts` follows Wizard metadata
`requireClassProficiency: true` and only offers `draft.classSkillIds`. The default level-2 Human
Wizard is proficient in History through Skilled, but the picker offers only Arcana/Investigation.
Setting Scholar Expertise to History in the document produces no engine errors, confirming a
builder/core discrepancy. Worse, probes with **no Scholar Expertise**, or with **Athletics as
Scholar Expertise**, also produce no engine errors; Athletics is outside Scholar's six-skill pool.

Fix acceptance: shared metadata must offer any proficient eligible skill, and shared validation
must require exactly one valid selection from level 2, reject out-of-pool/early selections, and
retain acquisition history. Add background/species/feat-derived positive cases and negative
import cases. Do not simply add a Wizard-only UI exception.

### F2 - P1: Circle of the Land cannot change its land after a Long Rest

Source: page 46, Circle of the Land Spells; normalized `p0046-n006`.

The generated `landChoice` has four options but no `changeOn: ["long-rest"]`. The Play Rest
editor discovers only rest-replaceable metadata. A level-3 Druid requesting a Long Rest change
to Tropical receives `applicable: false`, code `REST_FEATURE_CHOICE_INVALID`. Advancement also
locks earlier options without a level-up replacement policy; waiting for another level is not
a correct substitute for the source's rest choice.

Fix acceptance: emit the Long Rest policy and the source feature's `optionSelection` metadata
from the Druid generator, then use the shared rest replacement resolver. That resolver currently
discovers only choices with `optionSelection`, which the land choice also lacks. Switch all four
pools, update their always-prepared spells atomically,
preserve unrelated state/history and verify Undo/reload. Short Rest replacement must remain invalid.

### F3 - P1: selectable invocations do not materialize required grants

Sources: Lessons of the First Ones on page 73 (`p0073-n021`-`n023`); Pact of the Chain and Pact
of the Tome on page 74 (`p0074-n012`-`n016`).

- A valid level-2 Warlock with Lessons selected retains only Soldier's Savage Attacker and the
  Human's Skilled in `build.featIds`; there is no additional Origin-feat picker or grant. Engine
  errors are empty. Thus ordinary level-4 Origin-feat acquisition being implemented does not
  cover this separate level-2 grant path.
- A Warlock selecting Pact of the Chain does not receive Find Familiar in the evaluated spell
  list or a free-casting action. Familiar stat blocks may be deferred, but the granted spell is
  a separate missing character benefit.
- A level-1 Pact of the Tome Warlock has only its normal two cantrips and two prepared spells;
  there are no three additional cantrip/two ritual selections or rest-time book choices.

Fix acceptance: shared conditional/nested grant metadata, persisted per-source selections,
spell/feat acquisition accounting, correct list/ability/recharge behavior and rest replacement
where appropriate. Include Magic Initiate/Skilled nested choices and existing-feat collisions.
Pact weapons and other invocation effects remain additional known work, not silently verified.

### F4 - P1: repeatable invocation targets and spell prerequisites are not modeled

Sources: Agonizing Blast (72), Eldritch Spear and Lessons (73), Repelling Blast (74).

Catalog records retain `repeatable` and prerequisite prose, but feature selection is a set of
option IDs. Clicking a selected repeatable invocation removes it; it cannot add a second
acquisition with a different target. Engine validation requires every invocation ID to be
distinct (`WARLOCK_ELDRITCH_INVOCATION_CHOICE_COUNT`). It checks numeric Warlock levels and
invocation-ID dependencies, not the complete spell prerequisite.

Reproduced: a level-2 Warlock with only Mage Hand and Minor Illusion as its Warlock cantrips can
select Agonizing Blast. Builder issues and engine errors are both empty even though neither
cantrip deals damage. No eligible target cantrip is recorded. The Warlock rules document already
acknowledges this target-model limitation; making the selection available does not implement it.

Fix acceptance: acquisition records with distinct spell/feat target IDs; repeatability rules
and source-dependent prerequisites validated before grants. Include non-damaging cantrips,
attack-roll/range restrictions and target reuse in negative tests.

### F5 - P1: ordinary cantrip replacement paths are missing for four classes

Sources: Cleric cantrips (36), Druid (42), Sorcerer (64), Wizard (77).

Cleric, Druid and Sorcerer allow replacing one ordinary class cantrip when gaining a class level.
Their generated metadata lacks `cantripChange`. `CharacterLevelUp` consequently sets the
replacement maximum to zero and disables existing cantrip buttons. Bard and Warlock metadata
already exercises the shared one-replacement flow; adding a new cantrip when the count grows
does not cover replacing an old one.

Wizard has a different source rule: one ordinary class cantrip may be replaced after a Long
Rest. Its metadata has no rest-time policy, and the daily preparation editor handles only
leveled spells, so it is not a workaround. Magic Initiate and warrior-alternative cantrips have
separate sources and must not consume or bypass this allowance.

Fix acceptance: metadata-driven level-up replacement for the three classes, a shared rest-time
cantrip policy/editor for Wizard, exact one-replacement bounds and source/history preservation.

### F6 - P2: language choices cannot be recorded as structured grants

Sources: ordinary languages (20), Ranger Deft Explorer (59), Rogue Thieves' Cant (62).

There is no language field in the character schema or a language picker in the guided builder.
Common plus two ordinary language choices are not represented. The Ranger's two additional
languages and the Rogue's one additional language alongside Thieves' Cant also lack a recording
path. Prose/notes are not validated, source-linked progression selections.

Fix acceptance: a source-linked language catalog and shared fixed/selected grant records,
eligibility/count validation, sheet display and backward-compatible legacy handling. Do not
guess choices for existing saves.

### F7 - P2: guided advancement offers fixed HP only

Source: page 23, Gaining a Level, step 2, permits rolling the class Hit Die or using the fixed
value, adding Constitution with a minimum gain of one.

`buildCharacter` writes `hitPointChoice: "fixed"` for every level. The level-up review explicitly
describes using fixed HP and has no roll/manual-value control. The document schema and evaluator
already understand rolled values, so importing a rolled document is not the same as offering
the source's choice in the UI.

Fix acceptance: per-level recorded roll/fixed choices and shared die metadata; validate bounds,
minimum gain, first-level maximum and retroactive Constitution changes without rewriting rolls.

### F8 - P2: Long Rest weapon-mastery reselection lacks a Play workflow

Source example: Rogue Weapon Mastery, page 62, explicitly permits changing the weapon kinds
after a Long Rest; the other mastery classes have corresponding policies.

Initial choices and growth are represented by `loadout.selectedWeaponMasteryIds`, and Combat
controls operate the selected weapons' mastery effects. Those controls are not a persistent
mastery-selection editor. Play's rest replacement mechanism handles feature-option choices,
not this loadout field, and exposes no mastery reselection control.

Fix acceptance: shared metadata-driven Long Rest reselection with class count/proficiency gates,
persisted loadout changes, Undo/reload and no accidental class/feat-history changes.

## Test evidence and its limits

Commands executed for this audit:

```sh
sha256sum sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf
PYTHONPATH=extraction .venv/bin/python -m srd_extract.review queue \
  --generated packages/content-srd-5.2.1/generated --extraction generated/extraction \
  --reviews extraction/reviews
pnpm build
pnpm exec vitest run apps/web/src/lib/advancement-feats.test.ts \
  apps/web/src/lib/feat-acquisition.test.ts apps/web/src/lib/ability-score-improvements.test.ts \
  apps/web/src/lib/tool-proficiencies.test.ts apps/web/src/lib/legacy-tool-choices.test.ts \
  apps/web/src/lib/warrior-cantrips.test.ts apps/web/src/lib/character-builder.test.ts \
  apps/web/src/lib/character-level-up.test.ts
pnpm --filter @dnd/web test:e2e feat-acquisition.spec.ts warrior-cantrips.spec.ts \
  tool-proficiencies.spec.ts grappler.spec.ts weapon-damage-choice.spec.ts \
  legacy-tool-choices.spec.ts
# Repeat that browser command with --project=narrow and --project=desktop for the split reruns.
```

The 253 unit/integration tests and 60 default-build probes passed. The first combined browser run
was externally terminated with signal 15 after 26 successful cases; that is not a completed
38-case pass and not an observed assertion failure. Separate completed reruns then passed all
**19 narrow and 19 desktop cases (38 total)**. Browser coverage verifies the named
feat/tool/grapple paths, not every class choice in the matrix. F1-F8 were not fixed or converted
into regression tests in this audit.

## Recommended implementation order

1. **Small source/validation slice:** Scholar's eligible-source/count/pool rules and the Druid
   land Long Rest policy, with direct negative tests and desktop/narrow browser cases.
2. **Cantrip replacement slice:** use existing level-up metadata for Cleric/Druid/Sorcerer;
   add Wizard's shared Long Rest policy without merging unrelated spell sources.
3. **Invocation grant model:** nested feats/spells and per-acquisition target records, followed
   by repeatability and complete prerequisites. This is larger than simply adding more options.
4. **Remaining choice recording:** languages, rolled HP and Long Rest mastery selections.
5. Re-audit class/subclass effects, including the documented assisted Metamagic/invocation
   effects, then obtain independent human review. Passing tests alone must not advance review
   flags or mark the overall level-1-5 milestone complete.
