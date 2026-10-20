# Implementation status and remaining gates

This tracks the original `dnd_srd_character_manager_implementation_plan.md`; it does not replace or
reduce its scope. The full goal is not yet complete. A milestone is not considered finished just
because some of its functionality exists or tests pass.

## Current evidence

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

Grappler is now available through shared, catalog-driven creation/advancement controls alongside
ASI. Per-acquisition records store the feat and ability allocation. The engine enforces its
Strength-or-Dexterity prerequisite before its own increase, allowed +1 abilities, level, maximum,
non-repeatability, and aggregate consistency. Earlier selections remain locked; ambiguous legacy
qualification is not invented. Combat displays its three benefits as explicitly assisted guidance;
target tracking, grapple resolution, movement and conditional Advantage are not automated. Browser
interaction verification and independent semantic review remain outstanding.

| Milestone                        | Current evidence and required remaining work                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0: Decisions and skeleton        | Monorepo, schemas, CI, acquisition, and ADRs exist. Fresh-clone installation and every initial exit criterion still need a recorded completion audit.                                                                                 |
| 1: Extraction foundation         | Layout, normalization, document nodes, and overlays exist. The full section-spanning visual audit and source-span resolution gates still need verification.                                                                           |
| 2: Schemas and parsers           | Class, origin, equipment, spell, and condition parsers exist. Complete character-relevant segmentation, glossary cross-references, magic-item parsing, manifests, and the full review queue remain to be completed/audited.           |
| 3: Engine kernel                 | Expressions, predicates, calculations, proficiencies, resources, validations, and traces exist. All declared effect, conflict, and cycle/error guarantees require a gate-by-gate audit.                                               |
| 4: Fighter vertical slice        | Builder, advancement, equipment, attacks, rests, persistence, and integration tests exist. The complete UI lifecycle, all numeric provenance, and all choices require browser and legality audit.                                     |
| 5: Spellcasting slice            | Wizard spellbook/preparation, slots, attacks, saves, concentration, spell descriptions, and tests exist. The full source-link/trace and representative-spell gates still need a recorded audit.                                       |
| 6: All single classes through 5  | All twelve builders and class fixtures exist. Assisted features remain; review coverage, relevant feats/equipment completeness, and visible unsupported-mechanic labeling need verification.                                          |
| 7: Levels 6–20                   | In progress. Fighter, Barbarian, and Bard reach level 10; the other nine builders reach 9. Finish remaining levels through 20, General feats, Epic Boons, higher-level features, interactions, and twelve reviewed level-20 fixtures. |
| 8: Multiclassing                 | Prerequisites, proficiency rules, separate class preparation/casting, combined slots, Pact Magic interactions, builder flow, and the reviewed interaction matrix remain.                                                              |
| 9: Items and complete play-state | Conditions, concentration, HP/death saves, rests, and reversible local changes exist. Magic-item ownership/equipment/attunement activation, charges/recharge, bonuses, and complete traced transitions remain.                        |
| 10: Beta hardening               | Complete accessibility/mobile/print audit, migrations, profiling, threat model/CSP, backup and diagnostic bundle, clean reproducible generation in CI, and the public-beta completion audit.                                          |

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
implemented without a browser connection. Recent Paladin, Monk, and Rogue production-export
smoke checks cover their documented flows only. Engine/roll-helper tests, type checks, and
production builds do not substitute for a complete rendered interaction audit.
