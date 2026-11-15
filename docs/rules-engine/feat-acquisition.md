# Shared feat acquisition

The pinned SRD 5.2.1 feat rules (pages 87–88) permit any qualifying category when the granting
feature does not restrict the category. Ability Score Improvement grants therefore offer Origin,
General, and qualifying Fighting Style feats, rather than filtering to General feats only.
Epic Boon content/progression remains a later slice; those feats require level 19.

`featAcquisitionMetadataSchema` in content-schema is shared by the builder and engine. It reads
category, repeatability, ability/level prerequisites, required feature IDs, allocation patterns,
and score caps from the feat body. A feat without increases gets one empty allocation; acquiring
it does not add ASI points. The builder's granting levels and available prerequisite features
come from class/subclass progression data, without class-specific UI conditionals.

Eligibility includes earlier acquisitions and feats already granted by background, species, or
class features. Fighting Style prerequisites must exist at the acquisition level, not merely at
the final level. Non-repeatable styles cannot be selected twice across different grant sources.
An additional acquired style is independent of the class's initial style and is excluded from
the default choices for a later additional-style feature.

Each advancement feat remains in `build.levels[].featSelections` and `build.featIds`. Source grant
accounting removes those acquisitions before validating a species' additional Origin feat count;
a single aggregate feat cannot satisfy both an acquisition and a background/class choice.
Legacy ASI reconstruction still does not invent a non-ASI acquisition history.

Magic Initiate's existing class-list variant entities supply ability and spell pickers, independent
of whether the feat came from an origin or advancement. The acquired list cannot repeat; choosing
a different list is a different eligible variant. Spells use the existing casting sources,
always-prepared/free-cast rules, and one-spell replacement allowance on later advancement.
Newly acquired feats can choose their casting ability; older abilities stay locked.

Skilled supports any combination of three skills or tools. Each acquisition stores its own
`skillIds` and optional `toolIds`; original grants use source-specific tool-choice records.
Multiple acquisitions aggregate their grants under the feat's proficiency source, without losing
the per-acquisition selections. The old origin skill field remains separate; loading and advancing
a character reconstructs those two sources without reallocating earlier skills. Earlier feat IDs,
allocations, and nested proficiency choices are locked. Current HP, equipment, conditions, and spent
resources are not reset. The optional field is backward-compatible with older documents.

The UI exposes these choices in creation and level up, including the no-increase allocations and
new feat spell/skill choices. Unit tests cover all twelve classes taking an Origin feat, mixed
grant sources, repeatability, prerequisite gating, additional styles, round trips, and history
preservation. The production-export browser gate covers these new paths at desktop/narrow widths.

Later slices add [Paladin/Ranger's level-2 alternatives](warrior-cantrips.md) and
[Savage Attacker's declared damage-pool choice](savage-attacker.md) and
[source-driven tool choices](tool-proficiencies.md). Grappler's
target-specific combat effects, encounter budgets, and full semantic review of levels 1–5 remain
unfinished; these are not implicit grants.
