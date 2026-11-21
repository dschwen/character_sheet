# Scholar and Circle of the Land choice repairs

This addresses F1 and F2 in the [level-1-5 audit](../audits/level-1-5-feats-and-choices.md).
It does not complete the remaining cantrip, invocation, language, HP or mastery work.

## Shared Expertise validation

The pinned SRD's Scholar rule (page 78) permits one of six named skills in which the Wizard
is proficient; it does not require that proficiency to come from the Wizard class. The Wizard
generator now emits `requireClassProficiency: false`. The existing builder and advancement
controls therefore include eligible background, species and feat proficiencies without a
Wizard-specific UI branch.

The evaluator consumes the same `classBuilderMetadataSchema` Expertise definitions. Source
feature grants and minimum levels determine eligibility; `countByLevel` thresholds or explicit
per-source `grants` determine counts; `eligibleSkillIds` and proficiency rules determine pools.
The final threshold continues to apply beyond the guided builder's supported maximum.
Existing Bard/Rogue/Ranger count error codes are retained as compatibility aliases, not as
hard-coded grant rules. Scholar uses `EXPERTISE_CHOICE_COUNT` and
`EXPERTISE_CHOICE_NOT_ALLOWED`. Existing generic proficiency and document-uniqueness checks
continue to reject unproficient and duplicate selections.

Older malformed documents are reported in Diagnostics; the app does not invent an Expertise
selection or replace an existing one. Advancement checks the old grant counts before applying
draft defaults, so missing or pre-grant records require explicit repair rather than being filled
in during a later level up. Earlier recorded Expertise remains locked on advancement.

## Circle of the Land on a Long Rest

The source (page 46) permits choosing Arid, Polar, Temperate or Tropical after each Long Rest.
The Druid generator now emits `changeOn: ["long-rest"]` and an `optionSelection` source feature.
The shared Play → Rest editor discovers this metadata and exposes the land selector. Merely
changing the selector saves nothing. A Short Rest does not apply the queued land choice.

A successful Long Rest records the new option at its original acquisition level and applies
normal rest recovery atomically. Always-prepared spells are derived from the new pool. Undo
restores the previous choice and state; reload and advancement retain the confirmed choice.
No ordinary preparation, inventory or unrelated feature history is silently replaced.

There is one explicit preparation interaction: an ordinary prepared spell can become always
prepared under the new terrain. Keeping it in the ordinary allowance would leave an invalid
loadout. Rest proposals now evaluate the proposed build and reject conflicting prepared-loadout
errors with `REST_PREPARED_SPELL_CONFLICT`, without spending resources or changing the document.
Use Spells → Change preparation to replace the conflicting ordinary selection, then return to
Play, select the desired land again, and complete the Long Rest. The app never chooses a
replacement spell for the player. Daily preparation/rest timing remains manually declared.

## Verification

Focused tests cover background/species/feat-derived Scholar proficiency; absent, extra,
out-of-pool, unproficient, duplicate and early selections; authored metadata changes; prior
history; and count thresholds. Terrain tests exercise all four pools at levels 3 and 5, ordinary
rest recovery parity, invalid timing/options, acquisition bounds, input immutability, and explicit
preparation-conflict repair. Parser tests check the emitted policies.

Production browser checks run at desktop and narrow widths: History from Skilled is selectable
for Scholar, source traces and advancement persist it, and an invalid import remains visible in
Diagnostics. Druid checks cover draft-only changes, Short Rest exclusion, Long Rest application,
Undo, always-prepared pool changes, reload/advancement and the preparation-conflict workflow.

Completed checks: production build, lint, TypeScript checks, changed-file formatting,
1,262 Vitest tests, 183 extraction tests, Ruff and the standard extraction mypy check.
The final full Playwright run passed all 74 desktop/narrow cases. An earlier run exposed
a pre-existing Second Wind test assumption: a high roll fills HP and disables a second use.
That test now explicitly applies damage before its second-use/Undo check; no gameplay rule
was relaxed to make it pass.

Regenerate from the existing pinned extraction, never by editing generated entities:

```sh
PYTHONPATH=extraction .venv/bin/python -m srd_extract.wizard \
  --class-extraction generated/extraction/srd-5.2.1-wizard \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
PYTHONPATH=extraction .venv/bin/python -m srd_extract.druid \
  --class-extraction generated/extraction/srd-5.2.1-druid \
  --spell-extraction generated/extraction/srd-5.2.1-spells \
  --output packages/content-srd-5.2.1/generated
PYTHONPATH=extraction .venv/bin/python -m srd_extract.coverage \
  --output packages/content-srd-5.2.1/generated --markdown docs/coverage/README.md
```

No human review decisions or approval flags are created by these changes.
