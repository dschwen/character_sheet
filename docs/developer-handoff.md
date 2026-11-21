# Developer handoff

Updated 2026-11-21. Implementation baseline: `92e5acf` (Scholar and land-rest repairs).
This is an existing local-first product with incomplete rules coverage, not a greenfield build.
The next priority is repairing the audited level-1–5 choices, not adding another frontend.

## Read first

1. [Implementation plan §0](../dnd_srd_character_manager_implementation_plan.md#0-current-execution-plan-and-handoff):
   current execution order; the rest of that document retains full product scope.
2. [Implementation status](implementation-status.md): evidence and remaining milestone gates.
3. [Level-1–5 audit](audits/level-1-5-feats-and-choices.md): source passages, reproductions and F1–F8.
4. [ADRs](adr/), especially 0001–0003 (persistence/engine/provenance), 0008–0009 (atomic proposals),
   0011 (content-driven progression), 0012 (preparation models) and 0013 (edition-reference content).
5. [Coverage](coverage/README.md), [browser verification](testing/browser-verification.md), and
   [human review workflow](rules-authoring/review-workflow.md).

When documents disagree, distinguish requirements from delivered evidence: the original plan is
the product scope; checked-in schemas and scripts are the actual interfaces; generated coverage
is a snapshot, not a correctness certificate. Update the affected docs when a slice lands.

## Current product and boundaries

The Next.js app in `apps/web` exports a static site to `apps/web/out`. It has a guided builder,
same-class advancement, sheet/Combat/Spells/Play/Diagnostics views, inventory, import/export,
source explanations, fullscreen physical dice and single-step Undo for persisted changes.
Ordinary clicks roll; Shift-click inspects derived values. Character JSON is canonical, stored
in browser local storage. Export before clearing browser data or moving machines; there is no
cloud backup, account service or multi-character campaign synchronization.

| Implemented creation/advancement limit | Classes                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| 11                                     | Bard                                                                   |
| 10                                     | Barbarian, Fighter                                                     |
| 9                                      | Cleric, Druid, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard |

These are workflow limits, not independent semantic approval. Nine species, four backgrounds,
twelve classes and their twelve SRD subclasses are loaded. All 339 spell descriptions are present;
displayed spells and feature options are not necessarily fully automated. Target sheets, many
effect outcomes, positions, turn timing and Reaction use remain assisted/manual. Multiclassing,
full levels 1–20, magic-item activation/attunement and the beta hardening gates remain unfinished.
Ranger/Paladin ordinary preparation replacement timing/limits also remain known work outside the
completed Scholar/land slice. Consult each `docs/rules-engine/` slice for exact boundaries.

F1/F2 are fixed in `92e5acf`: Scholar permits eligible proficiency from any source; shared core
validation checks counts/pools/grants; advancement does not invent missing historical Expertise.
Circle of the Land uses Play → Long Rest to change terrain, with atomic state/build updates,
Undo and reload. If a newly always-prepared spell conflicts with an ordinary preparation, the
rest is rejected without mutation; explicitly replace that ordinary spell in Spells first.
See [repair details and regeneration commands](rules-engine/scholar-and-land-rest.md).

## Setup and verification

Requirements: Node.js 22+, pnpm 10.6.5, Python 3.12+, Poppler for PDF acquisition/cross-checking,
and Playwright Chromium/system dependencies for rendered checks. Run commands from the repo root.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm web
# Open http://localhost:3000; stop the dev server before production browser verification.
```

Build all packages before using the web/CLI: the app consumes workspace package `dist` outputs.
Rebuild after engine/content changes before judging browser results. Never run `tsup --clean`
builds concurrently with lint/type checks or another build; run the following gates sequentially:

```sh
corepack pnpm build
corepack pnpm check
corepack pnpm --filter @dnd/web exec playwright install --with-deps chromium
corepack pnpm test:e2e
corepack pnpm character packages/test-fixtures/characters/wizard-5.json

python3.12 -m venv .venv
.venv/bin/pip install -e './extraction[dev]'
.venv/bin/ruff check extraction
.venv/bin/ruff format --check extraction
.venv/bin/mypy extraction
.venv/bin/pytest extraction
```

Playwright serves the production export itself on port 4173, at desktop and narrow widths.
Use `pnpm --filter @dnd/web test:e2e scholar-and-land.spec.ts` for a focused check.
Avoid overlapping full/focused Vitest or browser runs. `pnpm check` includes whole-repo
Prettier: local untracked review JSON can make formatting fail. Check the reported paths;
do not rewrite someone else's review ledger to make a gate green. Scope formatting to changed
files when necessary and report that scope explicitly. The CI jobs and exact commands are in
[ci.yml](../.github/workflows/ci.yml); a fresh-clone onboarding audit remains outstanding.

Last completed implementation-baseline checks (not rerun for this documentation handoff):
1,262 Vitest tests in 81 files; 183 extraction tests; 74 Playwright checks; production build,
lint, TypeScript, changed-file Prettier, Ruff and the standard `mypy extraction` command.
An earlier browser run exposed a Second Wind test depending on a low random roll. Its setup
now explicitly damages the character before a second use; full-HP unavailability was not relaxed.
Tests are engineering evidence, not proof of every source rule or human review approval.

## Architecture and change rules

| Location                                   | Responsibility / extension point                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `extraction/srd_extract/`                  | Source parsers, class generators and formula annotations. Fix source metadata here, then regenerate.       |
| `packages/content-srd-5.2.1/generated/`    | Committed generated entities, authoring IR, manifest, indexes and coverage. Never hand-edit as a shortcut. |
| `packages/content-schema/src/index.ts`     | Shared content, choice and builder metadata schemas.                                                       |
| `packages/character-model/src/`            | Persisted choices, per-level acquisition history, loadout and mutable state; compatibility matters.        |
| `packages/rules-api/src/index.ts`          | Public evaluation and transition contracts.                                                                |
| `packages/rules-core/src/`                 | Framework-independent evaluation, validation and atomic action/spell/rest proposals.                       |
| `apps/web/src/lib/character-builder.ts`    | Shared catalog, choice candidates and character construction.                                              |
| `apps/web/src/lib/character-level-up.ts`   | Shared advancement draft, legality checks and history preservation.                                        |
| `apps/web/src/lib/spell-preparation.ts`    | Ordinary versus always-prepared accounting and preparation edits.                                          |
| `apps/web/src/components/`                 | Metadata-driven controls; builder, advancement and sheet orchestration.                                    |
| `packages/webgl-dice/`                     | Vendored fullscreen WebGL roller; `apps/web/src/lib/fullscreen-dice.ts` integrates it.                     |
| `packages/test-fixtures/`, `apps/web/e2e/` | Canonical examples and production-export browser coverage.                                                 |

- Primary design constraint: content data declares grants, counts, eligibility, timing and sources;
  shared engine resolvers enforce them; shared UI renders them. Extend typed reusable semantics
  when necessary. Do not create class-specific React rule logic or introduce arbitrary executable
  package scripts. Existing class-specific engine checks are not a pattern to multiply.
- Persist user decisions and play state, not derived values. Keep spell sources distinct: ordinary
  class cantrips, warrior alternatives, species, Magic Initiate and invocation grants have separate
  permissions and counts. Do not let a replacement in one pool spend another pool's allowance.
- Preview/validate before committing. Invalid proposals must preserve input, resources and history;
  valid ones apply atomically, revise once, support Undo and survive reload. Discard stale dice
  results after switching characters. Preserve unrelated inventory/loadout/state during advancement.
- Do not infer missing old choices or rewrite acquisition history. Add explicit repair/migration
  paths for malformed or ambiguous saves, with diagnostics and regression tests.
- Unsupported effects stay visibly assisted with source-linked instructions, not invented automation.
  Keep fullscreen dice dark green with light cream labels and retain numerical fallback behavior.

## Next work and acceptance criteria

Use this order; F5a/F5b are separate, commit-sized deliveries under audit finding F5.

### 1. F5a — Cleric/Druid/Sorcerer cantrip replacement on advancement (P1)

Source passages: pinned SRD pages 36, 42 and 64. Start with `extraction/srd_extract/cleric.py`,
`druid.py`, `sorcerer.py`; compare Bard/Warlock's emitted `cantripChange` metadata and the shared
checks in `apps/web/src/lib/character-level-up.ts` and controls in
`apps/web/src/components/character-level-up.tsx`.

Acceptance: each gained class level permits zero or one ordinary class-cantrip replacement;
newly granted cantrips are counted separately when the allowance grows; two replacements,
illegal pools and other-source substitutions are rejected by the relevant shared validation.
Preserve prior choices, preparation, spellbook and play state. Cover no-op, replacement-only,
count-growth, invalid import/draft and legacy records. Add desktop/narrow rendered selection,
review, save, reload and subsequent advancement cases; regenerate from source and document limits.

### 2. F5b — Wizard Long Rest cantrip replacement (P1; after F5a)

Source: page 77. Design a typed, shared rest-time cantrip policy rather than giving Wizard a
level-up permission. Entry points: content schemas, `packages/rules-api/src/index.ts`,
`packages/rules-core/src/rest.ts`, builder spell-source helpers and the Play Rest editor in
`apps/web/src/components/character-manager.tsx`. Existing land-rest handling is a lifecycle
reference, not a reason to encode cantrips as terrain options.

Acceptance: an explicitly selected zero/one ordinary Wizard cantrip replacement applies only on
a valid Long Rest. Short Rest, duplicate, over-budget, unavailable and other-source requests fail
without mutation. Count, source attribution and unrelated build/loadout/state remain intact.
Test draft-only changes, Cancel, rest recovery parity, Undo, reload and later advancement in both
viewports. Decide/document how replaced selections coexist with immutable acquisition history;
do not silently add defaults to older saves. Close F5 only when both slices pass.

### 3. F3 — Nested invocation grants (P1)

Sources: pages 73–74; audit reproductions for Lessons of the First Ones, Pact of the Chain and
Pact of the Tome. Extend shared conditional/nested grant metadata and source-instance acquisition
records. Lessons needs a real Origin-feat choice including nested Magic Initiate/Skilled selections;
Chain must grant Find Familiar/casting; Tome needs its additional cantrip/ritual selections and
rest policy. Validate ownership collisions, counts, lists, abilities and recharge semantics.
Provide core, builder, advancement, negative and desktop/narrow browser tests. Familiar stat-block
automation can remain explicitly deferred, but the granted spell cannot disappear with it.

### 4. F4 — Repeatable invocations and target prerequisites (P1; after F3 model)

Sources: pages 72–74. Record distinct acquisitions with their spell/feat targets instead of a set
of invocation IDs. Enforce repeatability, target reuse, damage/attack/range prerequisites and
class-specific cantrip ownership before materializing benefits. Test invalid non-damaging
cantrips, ineligible attack/range, duplicate targets, replacements and legacy unique-ID saves.
Expose nested targets in shared UI and retain per-source traces/history through reload/advancement.

### 5. F6 — Structured languages (P2)

Sources: pages 20, 59 and 62. Add a source-linked catalog and fixed/selected language grants for
ordinary languages, Ranger additions and Rogue/Thieves' Cant. Validate counts, distinctness and
eligibility; render creation, advancement and sheet display. Preserve unknown legacy choices as
unknown until explicitly recorded. Test grants, missing/duplicate choices, reload and advancement.

### 6. F7 — Rolled/fixed HP controls (P2)

Source: page 23. Reuse per-level HP records and class Hit Die metadata; expose an explicit
fixed-versus-recorded-roll workflow with legal bounds. Cover first-level maximum, minimum-one
gain, Constitution changes and immutable earlier rolls; include browser persistence/advancement
tests. Do not reroll automatically when a draft re-renders or when loading an old character.

### 7. F8 — Long Rest weapon-mastery reselection (P2)

Source example: Rogue page 62; check each mastery class's policy. Use shared rest metadata and
loadout proposals with class count/proficiency gates. Require explicit confirmation and reject
Short Rest/ineligible/over-count choices without mutation. Verify Undo, reload, later advancement
and preservation of class/feat history and unrelated rest recovery in core and browser tests.

After F3–F8, re-run the audit matrix rather than declaring all of levels 1–5 done. Independently
review the source semantics and tests, then return to the original progression, multiclass,
magic-item and beta gates. Do not extend caps merely to make the roadmap appear complete.

## Source, review and transfer checklist

- The pinned PDF SHA-256 is
  `8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87`.
  Acquisition and extraction commands are in the [README](../README.md#acquire-the-pinned-srd).
  `sources/**/source.pdf` and root `generated/` extraction runs are ignored, so a Git clone does
  not carry those working artifacts. Transfer them with verified hashes or regenerate from the
  pinned input. A complete clean regeneration command/gate for all content is still pending;
  do not claim fresh-clone reproducibility has been established.
- Committed content outputs can run the app without PDF re-extraction. For new source metadata,
  use the owning generator and its documented inputs/order, regenerate coverage, inspect the diff
  and check repeated generation for byte identity. Do not acquire a different SRD version silently.
- At handoff, `extraction/reviews/` and `webgl-dice-0.3.0.zip` are untracked, user-owned files.
  Back them up and coordinate transfer separately; do not delete, format, stage or apply them as
  part of routine implementation. The committed vendored dice package runs without the ZIP.
- The generated snapshot has 63 authoring IR records and zero applied semantics/test approvals.
  Local decisions are separate evidence. Read-only inspection:

  ```sh
  PYTHONPATH=extraction .venv/bin/python -m srd_extract.review queue \
    --generated packages/content-srd-5.2.1/generated \
    --extraction generated/extraction --reviews extraction/reviews
  ```

  `record` and `apply` are review writes, not ordinary test commands. Coordinate with the human
  reviewer before reconciling decisions; pin/source drift must invalidate stale approvals.
  Never manufacture human approval flags from automated tests.

- Two Ritual Caster variants are out-of-SRD `AUTHORED` edition references, not SRD coverage.
  Preserve their labels and provenance under ADR 0013. Their distribution and the original beta's
  content/license gate still require explicit review; no new book text is authorized by this handoff.
- Before acceptance, the incoming team should reproduce setup from a fresh clone, arrange the
  ignored/local artifact transfer, run the gates, inspect the live review queue, select F5a and
  record an owner. No remote access, branch protection, CI credentials or deployment ownership
  transfer has been verified by this documentation update.

For every implementation slice: commit code, generators and regenerated outputs together with
positive/negative tests, relevant rendered checks and updated status/audit notes. Keep the audit's
original baseline findings as historical evidence; add remediation links instead of erasing them.
