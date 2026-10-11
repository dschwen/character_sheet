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
derived value, and import or export the canonical character JSON. Click an ability, skill,
Initiative, attack, or spell-attack value to roll it; Shift-click a derived value to inspect its
calculation instead. The Play view tracks damage,
healing, Temporary Hit Points, Heroic Inspiration, Exhaustion, Concentration, rests, modeled feature
uses, and spell-slot expenditure. Weapon rows provide attack, damage, and critical-damage rolls.
Spells expose structured attack, damage, and saving-throw details, while cast confirmations report
the slot or free casting spent, remaining slots, and Concentration changes. The Combat view’s
Equipment panel edits coin denominations, adds loot, purchases source-priced gear, adjusts stack
quantities, and equips or removes inventory instances. Every saved character change advances the
document revision, persists locally, and can be undone once. Imported characters stay in the
browser's local storage; the app has no account, server, or database dependency. A production build
is emitted as a static site in `apps/web/out` by `corepack pnpm build`.

Choose **New character** to open the guided Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin,
Ranger, Rogue, Sorcerer, Warlock, and Wizard builder. It
creates rules-valid characters through each class's reviewed limit with Human or Dwarf and all four SRD backgrounds,
class-specific abilities and skills, reviewed subclasses, and complete choice validation.
Barbarians gain Primal
Knowledge, choose only eligible melee Weapon Masteries, and follow the Path of the Berserker.
Bards choose any three skills, gain Expertise and Jack of All Trades, prepare Bard spells, use
scaling Bardic Inspiration, and join the College of Lore.
Clerics choose Protector or Thaumaturge, prepare divine magic, and follow the Life Domain. Druids
choose Magician or Warden, prepare primal magic, and select a Circle of the Land environment.
Fighters choose Weapon Masteries and receive a ready-to-play equipment package. Monks gain Martial
Arts, Unarmored Defense, Focus Points, and the Warrior of the Open Hand. Paladins prepare sacred
magic, choose Weapon Masteries and a Fighting Style, and swear the Oath of Devotion. Rangers gain
Deft Explorer Expertise, prepare wilderness magic, and choose a Hunter’s Prey tactic. Rogues choose
two Expertise skills and eligible Weapon Masteries, then gain Sneak Attack, the Thief subclass, and
Cunning Strike. Sorcerers prepare arcane magic, choose two Metamagic options, use Innate Sorcery
and Sorcery Points, and manifest Draconic Sorcery. Sorcerers reach level 7 with fourth-level slots
and Sorcery Incarnate. Innate Sorcery activates a visible status with traced +1 Sorcerer spell DC
and spell-attack Advantage, leaving other casting sources unchanged. When its normal uses are
exhausted, Sorcery Incarnate spends two Sorcery Points instead. End the status after one minute;
rests clear it. The level-7 permission to use two Metamagic options remains guided and manually
adjudicated. Warlocks prepare Pact Magic, choose
level-eligible Eldritch Invocations, recover slots with Magical Cunning, and serve a Fiend Patron.
Wizards build a level-appropriate spellbook,
choose prepared spells, and select Scholar Expertise. The review step
evaluates the complete draft before enabling creation, then opens the new character directly in the
sheet.

The Origin step offers Acolyte, Criminal, Sage, and Soldier. Changing the background immediately
reconciles its ability-score options, granted feat, fixed skill proficiencies, and any conflicting
class, Human, Skilled, or Expertise choices. Alert adds Proficiency Bonus to Initiative. Magic
Initiate presents its data-driven spellcasting-ability, two-cantrip, and level 1 spell choices. Its
spells appear on the sheet with their own attack bonus and save DC; the level 1 spell can use an
available class spell slot or its tracked free casting, which returns on a Long Rest.
Dwarves gain their source-defined 120-foot Darkvision, Poison resistance, situational saving-throw
Advantage, one additional Hit Point per character level, and Proficiency Bonus uses of
Stonecunning. Stonecunning is spent from the Play UI and recharges on a Long Rest.

The Play tab also provides persistent toggles for the fourteen non-Exhaustion SRD conditions;
Exhaustion retains its level control, and active effects such as Rage can be ended from the same
Status panel. Condition names and descriptions come from source-linked Rules Glossary entities.
Stateful feature actions roll their declared transition dice automatically: using Second Wind, for
example, rolls its content-defined d10, adds Fighter level, shows the dice result, heals, and spends
the resource as one interaction. Every UI roll now uses the vendored WebGL Poly Dice fullscreen
overlay. The settled physical dice supply the actual results for normal rolls, Advantage,
Disadvantage, rerolls, damage pools, and state-changing feature rolls; an instant fallback remains
available when WebGL cannot initialize.

For a supported character below its class's reviewed maximum, choose **Level up** to add the next
level in its existing class. The advancement flow presents only newly introduced decisions, including class skills,
Expertise, spell and preparation additions, the reviewed level-3 subclass, and the level-4 Ability
Score Improvement. It previews the complete rules evaluation before saving and preserves identity,
inventory, currency, current Hit Points, conditions, and expended resources. This phase supports
same-class advancement for all twelve SRD classes through level 8.
Fighter additionally reaches level 9: Indomitable spends a Long Rest use to reroll a declared
failed save with a Fighter-level bonus, and Tactical Master offers per-attack mastery replacement
guidance. Save results and target effects remain manually adjudicated.
Ability Score Improvement offers +2 to one ability or +1 to two abilities, with the 20-point cap
validated before saving. New sheets record each allocation at its acquisition level. Advancement
locks earlier allocations and preserves legacy aggregate-only bonuses without inventing history.
Grappler is also offered from source-linked feat metadata, with a +1 Strength or Dexterity choice,
non-repeatability, and a level-4 plus Strength-or-Dexterity-13 prerequisite checked before its own
increase. Combat displays its Punch and Grab, Attack Advantage, and Fast Wrestler guidance;
targets, grapple saves, movement, and conditional Advantage remain manually adjudicated. Other
feat categories and Epic Boons are not yet offered by this workflow. Champion Fighters gain
distinct Fighting Style choices. Barbarians gain Initiative
advantage and an optional half-Speed movement reminder when entering Rage. Archery and Defense are calculated; Great Weapon
Fighting and Two-Weapon Fighting use explicit conditional weapon-damage modes. Turn eligibility
and action usage remain manually adjudicated. Evokers select separate
Evocation Savant spellbook additions and can declare Sculpt Spells protection while casting,
with conditional save/damage guidance for manually adjudicated targets.
Wizard and Warlock creation and advancement reach level 7. Wizards gain fourth-level slots,
eleven prepared spells, and one additional Evocation Savant spellbook choice. Warlocks gain six
invocations, eight selected prepared spells, fourth-level Pact slots, and always-prepared Fire
Shield and Wall of Fire. Pact slot upgrades retain their spent count, rather than refilling the
pool. Eldritch Mind's conditional Concentration-save advantage remains manually adjudicated.
Clerics and Druids gain fourth-level slots, eleven selected prepared spells, and new subclass
spells. Blessed Strikes and Elemental Fury offer a permanent choice of class-scoped Wisdom
cantrip damage bonuses or a guided 1d8 attack rider. In Play → Damage riders, confirm the creature
hit, attack kind, own turn, and unused rider; choose its damage type and whether the hit was
critical, then roll. Turn tracking, Wild Shape eligibility, and target HP remain manual.
Lore Bards select two Magical Discoveries from the Cleric,
Druid, and Wizard lists, including cantrips, up to their available slot level. These use Charisma
and remain always prepared outside the normal Bard limit. The builder and advancement flow offer
searchable, level-filtered choices. The shared advancement model permits one later replacement;
Lore Bards now reach level 7, gaining fourth-level slots and Countercharm. In Play → Feature
actions, confirm a failed save against Charmed or Frightened and an available Reaction, then
reroll your latest save or instruct a creature within 30 feet to reroll on its own sheet.
Countercharm grants Advantage (canceled by Disadvantage), spends no Inspiration, and does not
automatically remove conditions. Range, DC, and Reaction timing remain manual.
The package now loads all 339 source-linked spell descriptions. Previously annotated spells keep
their automation; new descriptive entries show **Effects assisted** and require source-text
adjudication for damage and conditional effects.
Fiend Warlocks gain Dark One's Own Luck: after rolling a
check or saving throw, use the button beside the result to roll and add 1d10, once per roll.
Uses equal Charisma modifier (minimum one) and recharge on Long Rest. Saving throws are now
clickable on the Overview tab; Shift-click still opens the calculation explanation.
Circle of the Land Druids gain Natural Recovery:
one free leveled Circle spell casting per Long Rest, plus a separate once-per-Long-Rest spell-slot
recovery during a Short Rest. The Rest panel lets you select slots within the recovery budget;
ordinary Short Rests do not spend this benefit. Wizards use the same controls for Arcane Recovery.
Paladins gain Aura of Protection:
it adds Charisma (minimum +1) to saves and is inactive while Incapacitated. Allies can toggle
the chosen Paladin's aura on their sheets and select its bonus; overlapping auras never stack.
Life Domain Clerics gain Blessed Healer:
confirm that a healing spell restores HP to another creature to heal the caster by 2 + the slot level.
Healing-roll buttons support Cure Wounds, Healing Word, Mass Healing Word, and Prayer of Healing,
including upcast dice and Disciple of Life on slotted casts; apply the rolled healing to the target's sheet.
Free casts do not trigger either Life Domain bonus. At Monk level 6,
Wholeness of Body rolls the Martial Arts die, heals with Wisdom (minimum 1 HP), and tracks
Long Rest uses; Empowered Strikes offers Force-damage and critical-damage buttons for Unarmed Strikes.
At Monk level 7, Evasion reduces eligible Dexterity-save damage unless Incapacitated. In Play →
Hit Points, enable the optional saving-throw resolver, declare the outcome and normal save damage,
inspect the preview, then apply it. Leave this off for damage already resolved by the DM; other
damage modifiers remain manual.
Rogues reach level 7 with Evasion and Reliable Talent. Proficient skill and fixed-tool checks
automatically treat d20 results below 10 as 10, preserving the animated faces and explaining the
adjustment. Fixed tool grants appear with ability-specific roll buttons; unresolved tool choices
and tool-use requirements remain manual.
Paladins reach level 7 with Aura of Devotion: Charmed is suppressed while their Aura of Protection
is active. Allies can set “Aura of Devotion (other Paladin)” in Play → Beneficial statuses;
remove it when leaving range or when the source Paladin becomes Incapacitated. Charmed stays
recorded, with a “suppressed” label and Shift-click explanation, until explicitly removed.
Rangers reach level 7 and choose Escape the Horde or Multiattack Defense. Play → Rest lets
Hunters change Defensive Tactics and Hunter’s Prey when completing a Short or Long Rest.
Incoming enemy attacks and turn boundaries are adjudicated manually; the selected option’s
guidance explains when the attacker should apply Disadvantage.
At Ranger level 6,
Roving automatically increases walking Speed when eligible and grants matching Climb and Swim
Speeds. Bard advancement permits one cantrip and one prepared-spell
replacement; Sorcerer advancement permits its one prepared-spell and Metamagic
replacement; Warlock advancement supports growing and replacing Eldritch Invocations plus its
one prepared-spell and cantrip replacement when gaining a level. Magic Initiate permits one
same-level feat spell replacement while preserving its original casting ability. Multiclassing,
levels 8–20 for Fighter, Barbarian, Monk, Rogue, Ranger, Paladin, and Bard, and levels 7–20 for the other
classes remain future work.

The CLI remains useful for automation and does not require the web interface. Build once, then pass
a character JSON document to it:

```bash
corepack pnpm build
corepack pnpm character packages/test-fixtures/characters/bard-5.json
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
reports rules-invalid choices without changing the input. The builder currently covers the complete
level 1–8 builder and advancement slices for all twelve SRD classes, with
every standard SRD background and species. Higher levels and multiclassing are the next builder increments.
Direct JSON import remains available in the meantime.

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
table, progression table, feature text, and Path of the Berserker subclass.

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

This command parses both class tables, reconciles the progression against feature headings,
extracts Path of the Berserker, and generates source-linked draft mechanics for Rage, Unarmored
Defense, and Extra Attack. The reviewed level-6 Mindless Rage data ends Charmed and Frightened
when Rage begins and prevents those conditions while Rage remains active.

Generate Bard content from pages 31–35 using the shared spell-description extraction:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-bard \
  --pages 31-35 \
  --overlays

.venv/bin/python -m srd_extract.bard \
  --class-extraction generated/extraction/srd-5.2.1-bard \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
```

The Bard parser validates all 20 progression rows, the 129-entry class spell list, every Bard and
College of Lore feature, and the level-5 Inspiration die and recharge changes. It generates seven
source-linked representative spells plus authoring IR for Bardic Inspiration, Jack of All Trades,
Cutting Words, and Countercharm.

Generate the typed Fighter-through-level-8 content from class pages 47–49, Ability Score
Improvement and Fighting Styles on pages 87–88:

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
Champion subclass and all four SRD Fighting Styles, and generates draft authoring IR for the
supported Fighter features. Fighter choices and progression currently reach level 8.

Generate the source-linked Light, Two-Handed, and Versatile damage modes:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-weapon-properties --pages 89-90
.venv/bin/python -m srd_extract.weapon_properties \
  --extraction generated/extraction/srd-5.2.1-weapon-properties \
  --output packages/content-srd-5.2.1/generated
```

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
extracts the Evoker subclass, and generates 27 source-linked representative spell entities with
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

# Run after class/spell generation to annotate reviewed healing formulas.
.venv/bin/python -m srd_extract.spell_healing \
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
Circle of the Land and all four selectable land-spell tables, Wild Shape scaling, 12
representative primal spells, and 4 additional source-linked Circle-granted spells.

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
authoring IR for the supported level-1–6 resource, defense, attack, and action mechanics.

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
Quickened Spell, Subtle Spell, and Draconic Resilience. Elemental Affinity's level-6 damage-type
choice drives its resistance and one-roll spell-damage bonus.

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

Generate all four SRD backgrounds, Human, Dwarf, Dragonborn, Elf, Gnome, Goliath, Halfling, Orc,
Tiefling, and the Origin feat slice from pages 83–87:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-origins \
  --pages 83-87 \
  --overlays

.venv/bin/python -m srd_extract.origins \
  --extraction generated/extraction/srd-5.2.1-origins \
  --output packages/content-srd-5.2.1/generated
```

This parser generates typed Acolyte, Criminal, Sage, Soldier, Human, Dwarf, Dragonborn, Elf, Gnome,
Goliath, Halfling, Orc, Tiefling, Alert, Savage Attacker, Skilled, and Cleric/Druid/Wizard Magic
Initiate entities. Dragonborn includes a data-driven Draconic Ancestry selection, its matching resistance
and Breath Weapon, Darkvision, and level-5 Draconic Flight. Elf includes lineage and
spellcasting-ability choices, Keen Senses, lineage movement and Darkvision, and level-gated innate
spells with Long Rest free casts. Gnome includes Forest and Rock lineages, Gnomish Cunning, innate
spells, proficiency-bonus free casts of Speak with Animals, and the Rock Gnome clockwork-device
activity. Goliath includes all six Giant Ancestry boons and their shared uses, Powerful Build, and
level-5 Large Form. Halfling includes Brave, movement and hiding permissions, and automatic Luck
rerolls with visible dice feedback. Orc includes 120-foot Darkvision, proficiency-scaled Adrenaline
Rush with Short or Long Rest recovery, and once-per-Long-Rest Relentless Endurance. The parser also
generates all three Tiefling Fiendish Legacies with their resistance, innate spells, casting ability,
and level-gated Long Rest free casts. It also generates sheet-automated Alert Initiative and
roll-assisted Savage Attacker authoring IR.

Generate structured weapon, armor, adventuring-gear, and ammunition entities from SRD pages 91–92
and 95–96:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-equipment \
  --pages 91-92,95-96

.venv/bin/python -m srd_extract.equipment \
  --extraction generated/extraction/srd-5.2.1-equipment \
  --output packages/content-srd-5.2.1/generated
```

Generate the fifteen source-linked standard conditions from Rules Glossary pages 176–191:

```bash
.venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-conditions \
  --pages 176-191

.venv/bin/python -m srd_extract.conditions \
  --extraction generated/extraction/srd-5.2.1-conditions \
  --output packages/content-srd-5.2.1/generated

.venv/bin/python -m srd_extract.spell_statuses \
  --output packages/content-srd-5.2.1/generated
```

The rules kernel evaluates reviewed level-1 Barbarian and level-5 Bard, Fighter, Cleric, Druid,
Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard fixtures in its integration suite; the
web integration suite also covers creation and advancement through level 8 for all twelve classes. Results
include origin and feat ability increases, subclass features, species size, speed, senses, traits,
typed skill and saving-throw proficiencies, d20-test roll states, Initiative, Passive Perception,
inventory, armor and Shield
candidates, weapon and Martial Arts attacks and damage, spellbook, full-list, and Pact Magic
models, class- and subclass-granted always-prepared spells, selectable Circle of the Land spells,
spell slots, spell attacks and save DC, Weapon Mastery metadata, attacks per Attack action, critical-hit
thresholds, Hit Points, feature resources, variable resource spending and restoration, conditional
actions, resistances, validations, coverage warnings, and calculation traces.

The rules kernel also exposes atomic Short Rest, Long Rest, action-use, and spell-cast proposals.
Transition processing validates rules-driven or explicitly supplied dice results and available
spell slots, previews field-level state changes and resource recharge or spending, restores Pact
Magic on Short Rests,
manages Concentration including resource-backed free spell actions, activates Rage through its
resource-backed action, applies Human Resourceful, and preserves a trace without mutating the input
character.
