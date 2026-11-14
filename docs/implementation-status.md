# Implementation status and remaining gates

This tracks the original `dnd_srd_character_manager_implementation_plan.md`; it does not replace or
reduce its scope. The full goal is not yet complete. A milestone is not considered finished just
because some of its functionality exists or tests pass.

## Current evidence

- Savage Attacker now exposes a declared once-per-turn weapon-hit damage choice. Shared feat
  metadata drives attack summaries, source traces and the Combat UI; fullscreen dice roll two
  complete pools and let the player choose either. Critical dice and declared damage modes are
  supported; extra riders, target damage and turn-use tracking remain manual. Browser tests cover
  ordinary/critical physical rolls and unavailable-WebGL fallback at both viewports. See
  [Savage Attacker](rules-engine/savage-attacker.md).
- Paladin/Ranger level-2 Fighting Style choices now offer all four SRD feats and their respective
  Blessed Warrior / Druidic Warrior alternatives. Shared conditional-choice metadata grants two
  own-class cantrips without consuming ordinary preparations and supports one replacement per
  later class level. See [Warrior choices](rules-engine/warrior-cantrips.md).
- The local-first web builder, sheet, import/export, inventory, spell preparation, play-state,
  fullscreen dice, and guided same-class advancement are implemented in `apps/web`.
- The framework-independent evaluator and traced atomic action, spell-cast, and rest proposals
  are in `packages/rules-core` and have focused, property, and class integration tests.
- Source-linked class progression tables cover levels 1–20, but implemented builder limits are
  lower. The exact current limits and review counts are generated in [Rules coverage](coverage/README.md).
- All 339 spell descriptions are loaded, and every class spell-list reference resolves. Newly
  extracted spell effects are display-only and explicitly assisted, not complete rules automation.
- Evocation Savant has source-linked, level-gated spellbook additions, separate from preparation.
  Saved Evokers receive missing defaults with a review notice; historical choice editing still
  requires character export/import. All twelve class builders now reach level 6. Sculpt Spells
  validates declared protection counts and supplies conditional, source-linked casting guidance;
  target eligibility and target-sheet changes remain explicitly manual.
- Acquisition, layout extraction, normalization, repeated parsers, and reviewed-formula annotation
  commands are in `extraction/srd_extract`. Generation is incremental; end-to-end clean regeneration
  of every artifact still needs a single verified workflow.
- Human review of extracted records now runs through a durable ledger: `srd_extract.review
queue|inspect|record|apply` flags unreviewed and changed records, pins each approval to exact
  rules content and verified source spans, and promotes only fresh pinned approvals into the
  generated records. See [Review workflow](rules-authoring/review-workflow.md). The current queue
  flags all 63 extracted records as needing semantics and test review; no approvals have been
  recorded yet.
- A Playwright browser gate in `apps/web/e2e` drives the production static export in Chromium at
  desktop and narrow viewports: builder creation, reload persistence, a Fighter level up with its
  feature grant, a spellcaster level up with its prepared-spell growth and opened spell options,
  calculation-trace inspection, export/import round-trip, atomic play-state changes with undo and
  reload persistence, and axe scans that fail on critical or serious violations of the sheet or the
  builder. It runs as the CI `browser` job. See
  [Browser verification](testing/browser-verification.md) for what the suite does and does not cover.
- Automated tests do not constitute the separate human extraction, semantics, and test approvals
  specified by the plan. No claim of complete SRD coverage or independent verification is made.
- Fighter creation and advancement reach level 7 with distinct Fighting Style choices. Archery
  and Defense affect traced sheet values. Great Weapon Fighting and Two-Weapon Fighting use
  source-linked conditional damage modes and shared physical/fallback dice resolution. Eligibility
  declarations and turn/action tracking remain manual. Barbarian also reaches level 7: Feral Instinct
  grants traced Initiative advantage, and Enter Rage includes Instinctive Pounce movement guidance
  using final adjusted Speed. Monk reaches level 7 with condition-aware Evasion and a shared,
  opt-in saving-throw damage resolver in Play. Rogue reaches level 7 with the same Evasion resolver
  and traced Reliable Talent minima for proficient skills and fixed tool grants. Tool-choice
  persistence/catalog completeness and tool-use adjudication remain outstanding. Ranger reaches
  level 7 with source-linked Hunter Defensive Tactics choices. Play → Rest supports atomic
  replacement of both Defensive Tactics and Hunter’s Prey. Incoming attacks, creature hits, and
  turn boundaries remain manually adjudicated; no outgoing roll modes or AC are changed. Paladin
  reaches level 7 with source-driven Aura of Devotion: Charmed is suppressed while its Aura of
  Protection is active, with a separate recipient status for allies and source-linked immunity
  traces. Range and source-Paladin status on other sheets remain manually declared. Bard reaches
  level 7 with fourth-level slots and shared Countercharm Reaction controls: confirmed self-save
  rerolls use fullscreen/fallback dice, while other creatures receive explicit own-sheet guidance.
  Failure, range, and Reaction timing remain manually declared. Wizard and Warlock reach level 7
  with fourth-level spells, a separate Evocation Savant spellbook addition, six invocations, and
  fourth-level Fiend spells. Pact slot upgrades preserve spent slots; unchanged invocation
  selections retain acquisition history. Eldritch Mind's conditional Concentration advantage
  remains assisted. Sorcerer reaches level 7 with fourth-level Draconic spells and Sorcery
  Incarnate's exhausted-use alternate activation. Innate Sorcery now activates a source-linked
  status granting +1 Sorcerer spell DC and spell-attack Advantage, without enhancing other casting
  sources. Rests end the short-duration status; one-minute expiration and multiple Metamagic
  timing remain manual. Rendered interaction verification is pending without a connected browser.
  Cleric and Druid also reach level 7 with fourth-level slots, eleven selected prepared spells,
  and new Life Domain/Circle land spells. Blessed Strikes and Elemental Fury offer permanent,
  source-driven choices: Wisdom damage bonuses scoped to class cantrip casting sources, or
  guided attack riders with damage-type and critical-hit controls. Creature hits, Wild Shape
  eligibility, turn boundaries, and target HP remain manual. All twelve builders now reach 7.
- Fighter creation and advancement reach level 8 with a third repeatable Ability Score
  Improvement. All builders support both +2 and split +1/+1 allocations. New documents store
  feat selections and their ability allocations on the acquisition level; engine validation checks
  grant levels, feat prerequisites, counts, patterns, and consistency with aggregate bonuses.
  Advancement locks earlier choices and preserves legacy totals without inventing acquisition
  history. The full General/Epic Boon selection workflow remains outstanding.
- All twelve builders and same-class advancement workflows now reach level 8. Repeated ASI
  table entries resolve to their original source-linked feature. Bard and Rogue retain their
  existing Expertise counts. Full casters gain twelve selected prepared spells and 4/3/3/2
  slots; Wizard gains two ordinary spellbook additions but no new Savant grant. Warlock gains
  nine selected prepared spells while retaining six invocations and two fourth-level Pact slots.
  Half casters retain seven selected preparations and 4/3 slots. Monk Focus and Sorcerer Sorcery
  Points rise to eight; spent resources and slots are not restored by advancement. Druid's
  level-8 Beast form limits (eight known forms, CR 1, flying permitted) remain source-text-assisted,
  with form selection, stat replacement, equipment, duration, and temporary HP manually resolved.

## Remaining milestone gates

Fighter creation and advancement now reach level 9. Indomitable has a resource-backed failed-save
reroll workflow with a Fighter-level bonus, explicit failure declaration, no Reaction requirement,
atomic spending, and Long Rest recharge. Tactical Master exposes source-driven Push/Sap/Slow
replacement choices only for mastered weapons; declared attack receipts identify the choice.
Target effects remain assisted. Death Saving Throw rolls, deferred result resolution, and
Indomitable integration are now implemented alongside the six ability-based saves. Stable/dead
state, natural 1/20 results, declared first aid, damage at zero, massive damage, and healing resets
are covered. Zero HP derives Unconscious without erasing unrelated explicitly toggled conditions.
Barbarian creation and advancement also reach level 9. Shared, source-driven attack options
support declared Reckless Attack and Brutal Strike: all Advantage is forgone, any Disadvantage
blocks the tradeoff, and hit-confirmed extra damage has normal/critical fullscreen rolls.
Forceful Blow uses final adjusted Speed; Hamstring Blow includes non-stacking/expiry guidance.
Standard Unarmed Strike damage attacks are available beyond Monk. Turn timing and target effects
remain manually declared; see `docs/rules-engine/barbarian-level-9.md`.
Exhaustion now also penalizes weapon, Unarmed Strike, and all modeled spell attack sources.
Shared spellcasting traces are adjusted once, without changing damage, save DCs, slots, or
Advantage. See `docs/rules-engine/attack-condition-modifiers.md`.
Wizard and Sorcerer creation and advancement also reach level 9: both gain fifth-level
slots and fourteen regular preparations. Evoker gains its separate level-9 Savant addition;
Draconic Sorcery adds Legend Lore and Summon Dragon without consuming ordinary preparations.
Arcane Recovery supports the new fifth-level slot. See `docs/rules-engine/arcane-level-9.md`.
Cleric and Druid also reach level 9, with fifth-level slots, fourteen ordinary preparations,
Life Domain and terrain-specific Circle spells, and a five-level Natural Recovery budget.
See `docs/rules-engine/divine-primal-level-9.md`. Bard also reaches level 9 with four Expertise
selections, fifth-level slots, and fourteen regular preparations. Earlier Expertise is locked
by shared advancement validation; repeated Bard/Rogue Expertise table entries retain source
links. See `docs/rules-engine/bard-level-9.md`. Warlock also reaches level 9 with fifth-level
Pact slots, seven invocations, Contact Patron's Long Rest free casting and save guidance,
and Visions of Distant Realms' at-will Arcane Eye casting. Slot upgrades preserve spent
uses. See `docs/rules-engine/warlock-level-9.md`. Ranger also reaches level 9 with third-level
slots, nine ordinary preparations, and two additional Expertise selections. Shared builder
metadata now supports separate acquisition sources, preserving Deft Explorer's earlier selection
and rejecting duplicate skills across grants. Ranger's one-spell preparation replacement limit
per Long Rest remains unenforced. See `docs/rules-engine/ranger-level-9.md`.
Paladin also reaches level 9 with third-level slots, nine regular preparations, and Devotion's
Beacon of Hope/Dispel Magic. Abjure Foes checks a declared target count against current Charisma
(minimum one), requires range/sight confirmation, and atomically spends shared Channel Divinity.
The UI shows its current Wisdom-save DC and instructions for Frightened and its extra turn
restriction. External target resolution and preparation replacement timing remain manual or
unfinished. See `docs/rules-engine/paladin-level-9.md`.
The production-export smoke check passed creation, target declarations, spending/exhaustion,
reload persistence, and desktop/narrow layouts for this Paladin flow. It does not establish
the broader browser/accessibility or independent semantic review gates.
Monk also reaches level 9 with nine Focus Points and source-driven Acrobatic Movement.
Overview and Play show equipment/Speed eligibility, current adjusted Speed, and turn/stopping
limits. It grants no independent movement budget or permanent Climb/Swim/Fly Speeds.
Armor, shields, and zero Speed block use; Focus and Evasion remain independent.
The production-export smoke check passed builder creation, Overview/Play display, source
inspection, Grappled eligibility changes, reload persistence, and desktop/narrow layouts.
See `docs/rules-engine/monk-level-9.md`. Rogue also reaches level 9 with 5d6 Sneak Attack and
Thief's Supreme Sneak. Shared metadata-driven extra-damage controls subtract one Cunning Strike
cost before rolling and critical doubling, display source-linked save DCs/movement guidance,
and require hit, once-per-turn, and effect eligibility declarations. Stealth Attack requires
Hide-origin Invisible and sufficient end-turn cover; no Invisible condition is granted or removed
automatically. All twelve builders now reach level 9. Levels 10–20 remain unfinished. See
`docs/rules-engine/rogue-level-9.md`; independent rules review and full browser gates remain pending.
Fighter now reaches level 10 with four Second Wind uses, five Weapon Mastery choices, and
Champion's Heroic Warrior. Shared grant metadata powers a combat/turn-start declaration and
atomic, source-linked Heroic Inspiration transition; held Inspiration cannot stack or transfer.
No action or resource is spent. UI confirmations reset after use, while Inspiration persists and
supports Undo. Encounter timing and the Inspiration reroll remain assisted. Other classes still
stop at level 9 except Barbarian, which now reaches 10 with four masteries and Berserker's
Retaliation. Shared reaction-attack metadata validates damage, creature source, distance,
Reaction availability, and an equipped melee weapon/Unarmed Strike. UI permits one attack per
confirmed trigger with normal/critical damage controls; Reaction use and target identity/damage
remain manual. No Rage restriction or Extra Attack is added. See
`docs/rules-engine/fighter-level-10.md` and `docs/rules-engine/barbarian-level-10.md`.
Bard also reaches level 10: d10 Bardic Inspiration/Cutting Words, four Bard cantrips,
fifteen ordinary preparations, and two fifth-level slots. Source-driven Magical Secrets
expands level-1+ preparations to Cleric/Druid/Wizard lists, bounded by preparation growth and
one replacement per gained level. At level 10 this permits at most two ordinary off-list spells,
not an entire rewritten list or foreign cantrips. Lore Discoveries remain separate. Existing
advancement guards preserve prior selections and spent state; preparation stays level-up-only.
See `docs/rules-engine/bard-level-10.md`.
Bard also reaches level 11, the first class advanced past a feature grant: the level adds only
derived progression values — sixteen preparations and one sixth-level slot, with unchanged cantrips,
Inspiration die, and proficiency. The sixth level is derived from the progression row's slot keys:
at level 10 sixth-level spells are rejected in builder and core, and at 11 the same shared
derivation opens sixth-level Bard spells and sixth-level Magical Secrets choices, with the off-list
bound rising to four through the existing growth-plus-replacements resolver and no new
class-specific code. Advancement enforces exactly one new preparation and at most one replacement,
retains prior selections and spent state, and closes at 11; the rendered flow is verified in both
browser viewports. See `docs/rules-engine/bard-level-11.md`.

Grappler is now available through shared, catalog-driven creation/advancement controls alongside
ASI. Per-acquisition records store the feat and ability allocation. The engine enforces its
Strength-or-Dexterity prerequisite before its own increase, allowed +1 abilities, level, maximum,
non-repeatability, and aggregate consistency. Earlier selections remain locked; ambiguous legacy
qualification is not invented. Combat displays its three benefits as explicitly assisted guidance;
target tracking, grapple resolution, movement and conditional Advantage are not automated. Browser
interaction verification and independent semantic review remain outstanding.

Unrestricted advancement feat grants now offer Origin, General, and qualifying Fighting Style
categories through one shared acquisition metadata schema. Non-repeatability includes background,
species, class-feature, and earlier advancement grants; feature prerequisites are checked at the
acquisition level. Acquired Origin feats do not consume the species grant. Additional styles do
not replace the class's initial style or collide with Champion's later grant. Magic Initiate
reuses the spell-choice/casting path, with ability selection available for a newly acquired feat.
Repeatable Skilled records separate `skillIds` per acquisition while aggregate proficiencies
retain feat-source traces. Earlier nested choices and play state are preserved on advancement.
Tool choices, Epic Boons, and the existing assisted combat benefits remain unfinished; this
does not complete the full level-1–5 audit. See `docs/rules-engine/feat-acquisition.md`.

Ritual Caster's 2024 PHB variant — an out-of-SRD edition-reference record per ADR 0013, never
presented as SRD content — now has engine semantics in `packages/rules-core`: a recorded feat
selection plus a single `<featId>.choice.ritual-spells` record in `build.choices`; a spell count
bounded by the Proficiency Bonus at acquisition and the current Proficiency Bonus, never grown
automatically; level 1 Ritual-tagged spells only; the casting ability tied to the feat's single
recorded +1 (Intelligence, Wisdom, or Charisma); always-prepared grants; and a Quick Ritual free
cast recharged by a Long Rest through the shared free-cast resource. Feat traces cite the record's
edition-reference span without inventing a page, while granted spells keep their pinned SRD sources.
Feat prerequisite blocks may now state ability minimums only: an absent level floor means no level
gate. The 2014 variant now evaluates too: a chosen class spell list declared as class entity ids,
exactly two level 1 Ritual spells at acquisition, research capped at half the character's level
rounded up, the chosen class's casting ability, and slot-free always-ritual casting of unprepared
grants through the shared ritual casting request; a feat declaring no ability-increase patterns
occupies its feat slot with exactly one allocation of no increases so aggregate reconciliation
accepts it. Both variants' calculation traces are qualified by the full feat entity id, and a shared
test keeps both feats distinct on one sheet. The builder and level-up flows now present both
variants through the feat select at Ability Score Improvement grants, with explicit variant labels,
provenance notes, a bounds-checked spell editor (auto-filled to exactly the Proficiency Bonus at
acquisition for the 2024 variant; exactly two chosen class-list spells for the 2014 variant),
level-up rules that lock the 2014 book and open only Proficiency-Bonus-growth slots for the 2024
book, and sheet attribution of every grant to its variant record. `e2e/ritual-caster.spec.ts`
drives both variants through the production export. Researching 2014 book spells during play
remains outside the UI: the builder and level-up read the research record but never add to it. See
`docs/rules-engine/ritual-caster-2024.md` and `docs/rules-engine/ritual-caster-2014.md`.

| Milestone                        | Current evidence and required remaining work                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0: Decisions and skeleton        | Monorepo, schemas, CI, acquisition, and ADRs exist. Fresh-clone installation and every initial exit criterion still need a recorded completion audit.                                                                                                                                                                                           |
| 1: Extraction foundation         | Layout, normalization, document nodes, and overlays exist. The full section-spanning visual audit and source-span resolution gates still need verification.                                                                                                                                                                                     |
| 2: Schemas and parsers           | Class, origin, equipment, spell, and condition parsers exist. Complete character-relevant segmentation, glossary cross-references, magic-item parsing, and manifests remain to be completed/audited. The review queue with pinned source spans now exists as tooling; the full human review pass over the 63 extracted records has not started. |
| 3: Engine kernel                 | Expressions, predicates, calculations, proficiencies, resources, validations, and traces exist. All declared effect, conflict, and cycle/error guarantees require a gate-by-gate audit.                                                                                                                                                         |
| 4: Fighter vertical slice        | Builder, advancement, equipment, attacks, rests, persistence, and integration tests exist. The complete UI lifecycle, all numeric provenance, and all choices require browser and legality audit.                                                                                                                                               |
| 5: Spellcasting slice            | Wizard spellbook/preparation, slots, attacks, saves, concentration, spell descriptions, and tests exist. The full source-link/trace and representative-spell gates still need a recorded audit.                                                                                                                                                 |
| 6: All single classes through 5  | All twelve builders and class fixtures exist. Assisted features remain; review coverage, relevant feats/equipment completeness, and visible unsupported-mechanic labeling need verification.                                                                                                                                                    |
| 7: Levels 6–20                   | In progress. Bard reaches level 11; Fighter and Barbarian reach 10; the other nine builders reach 9. Finish remaining levels through 20, General feats, Epic Boons, higher-level features, interactions, and twelve reviewed level-20 fixtures.                                                                                                 |
| 8: Multiclassing                 | Prerequisites, proficiency rules, separate class preparation/casting, combined slots, Pact Magic interactions, builder flow, and the reviewed interaction matrix remain.                                                                                                                                                                        |
| 9: Items and complete play-state | Conditions, concentration, HP/death saves, rests, and reversible local changes exist. Magic-item ownership/equipment/attunement activation, charges/recharge, bonuses, and complete traced transitions remain.                                                                                                                                  |
| 10: Beta hardening               | A critical/serious axe gate over the initial sheet and the builder runs in the CI `browser` job. The complete accessibility/mobile/print audit, migrations, profiling, threat model/CSP, backup and diagnostic bundle, clean reproducible generation in CI, and the public-beta completion audit remain.                                        |

Optional cloud persistence and later homebrew/source-version upgrades retain their original plan
scope; they have not been silently substituted for the local-first implementation. Monsters remain
the plan's explicit deferred work, not a character-sheet completion gate.

## Working sequence

1. Complete single-class progression with source-linked data, shared engine semantics, UI controls,
   positive/negative/interaction tests, documentation, and checkpoint commits.
2. Implement multiclassing and magic items against the same data-driven architecture.
3. Close extraction, review, provenance, reproducibility, and hardening gaps.
4. Audit each requirement and exit criterion in the original plan against authoritative artifacts,
   commands, tests, and rendered behavior before marking the overall goal complete.

Broader browser verification remains outstanding for the earlier healing, aura, recovery,
post-roll bonus, spell-choice, rest-time feature-option, and damage-rider controls, which were
implemented without a browser connection. The Playwright suite now provides a repeatable rendered
gate, but its fixed smoke matrix does not reach those controls; recent manual Paladin, Monk, and
Rogue production-export smoke checks still cover their documented flows only. Engine/roll-helper
tests, type checks, and production builds do not substitute for a complete rendered interaction
audit, and the browser gate is scoped in [Browser verification](testing/browser-verification.md).
