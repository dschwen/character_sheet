# Repeated Ability Score Improvements and Fighter level 8

The pinned SRD's Ability Score Improvement feat (page 87) is repeatable and allows either +2 to
one ability or +1 to two distinct abilities, without exceeding 20. Both creation and advancement
offer all 21 allocations through shared controls. The granting levels come from each class's
source-linked progression table, including Fighter's extra level-6 grant and third grant at 8.
Fighter's supported builder maximum is 8; the other eleven classes remain at 7 for this slice.

The draft stores allocations as two ability points. Saved documents retain the existing
`build.featIds` and `build.featAbilityScoreIncreases` fields and additionally record each new
General feat selection in `build.levels[].featSelections`. Each entry contains its `featId` and
`abilityScoreIncreases`, allowing later General feat options without a class-specific UI branch.
The evaluator validates acquisition levels against the class progression, feat category and
level prerequisite, selected feat counts, per-feat increase patterns, aggregate consistency, and
maximum scores. Existing source-linked ability traces still use the selected feat's source.

New choices never reorder or replace earlier saved ASI records. Level-up validation rejects edits
to previous allocations, even when the new total would otherwise be legal. Current HP, inventory,
currency, conditions, and expended resources are retained. A Constitution modifier increase
recalculates maximum HP for all levels; it does not heal the character during this workflow.

Legacy sheets without acquisition records remain loadable. Advancement reconstructs a legal
draft representation of their aggregate points, preserves the exact old totals and level records,
and records only the newly acquired choice. The UI explicitly says that historical allocation
order is unknown; no reconstructed order is written into old levels. Incompatible legacy totals
produce an explanatory error rather than silently granting default bonuses.

Defaults retain existing choices and choose a legal new allocation where available. Users may
choose another allocation, and the complete rules evaluation must pass before confirmation.
Grappler and other General/Epic Boon choices remain outside this workflow until their metadata,
prerequisites, mechanics, and selection controls are implemented and tested. Optional combat
timing and the other documented assisted Fighter mechanics remain unchanged.
