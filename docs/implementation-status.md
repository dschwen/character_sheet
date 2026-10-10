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
  persistence/catalog completeness and tool-use adjudication remain outstanding. Other class
  builders remain capped at 6.

## Remaining milestone gates

| Milestone                        | Current evidence and required remaining work                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0: Decisions and skeleton        | Monorepo, schemas, CI, acquisition, and ADRs exist. Fresh-clone installation and every initial exit criterion still need a recorded completion audit.                                                                          |
| 1: Extraction foundation         | Layout, normalization, document nodes, and overlays exist. The full section-spanning visual audit and source-span resolution gates still need verification.                                                                    |
| 2: Schemas and parsers           | Class, origin, equipment, spell, and condition parsers exist. Complete character-relevant segmentation, glossary cross-references, magic-item parsing, manifests, and the full review queue remain to be completed/audited.    |
| 3: Engine kernel                 | Expressions, predicates, calculations, proficiencies, resources, validations, and traces exist. All declared effect, conflict, and cycle/error guarantees require a gate-by-gate audit.                                        |
| 4: Fighter vertical slice        | Builder, advancement, equipment, attacks, rests, persistence, and integration tests exist. The complete UI lifecycle, all numeric provenance, and all choices require browser and legality audit.                              |
| 5: Spellcasting slice            | Wizard spellbook/preparation, slots, attacks, saves, concentration, spell descriptions, and tests exist. The full source-link/trace and representative-spell gates still need a recorded audit.                                |
| 6: All single classes through 5  | All twelve builders and class fixtures exist. Assisted features remain; review coverage, relevant feats/equipment completeness, and visible unsupported-mechanic labeling need verification.                                   |
| 7: Levels 6–20                   | In progress. All twelve builders reach level 6; Fighter, Barbarian, Monk, and Rogue reach 7. Finish higher-level features, repeat choices, Epic Boons, spell progression, interactions, and twelve reviewed level-20 fixtures. |
| 8: Multiclassing                 | Prerequisites, proficiency rules, separate class preparation/casting, combined slots, Pact Magic interactions, builder flow, and the reviewed interaction matrix remain.                                                       |
| 9: Items and complete play-state | Conditions, concentration, HP/death saves, rests, and reversible local changes exist. Magic-item ownership/equipment/attunement activation, charges/recharge, bonuses, and complete traced transitions remain.                 |
| 10: Beta hardening               | Complete accessibility/mobile/print audit, migrations, profiling, threat model/CSP, backup and diagnostic bundle, clean reproducible generation in CI, and the public-beta completion audit.                                   |

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

Browser verification is currently outstanding for the latest healing, aura, recovery, post-roll bonus, and spell-choice controls: no browser connection
was available in the session. Engine/roll-helper tests, type checks, and a production build passed;
these are not a substitute for rendered interaction verification.
