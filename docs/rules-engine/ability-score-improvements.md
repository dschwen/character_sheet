# Repeated Ability Score Improvements and level 8

The pinned SRD's Ability Score Improvement feat (page 87) is repeatable and allows either +2 to
one ability or +1 to two distinct abilities, without exceeding 20. Both creation and advancement
offer all 21 allocations through shared controls. The granting levels come from each class's
source-linked progression table, including Fighter's extra level-6 grant and third grant at 8.
All twelve class builders and same-class advancement workflows reach level 8. Repeated ASI
entries in the source progression tables resolve to the original class feature rather than a
missing reference. General feats beyond ASI remain an explicit unfinished workflow.

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

## Other level-8 progression

The five full casters have twelve selected preparations and 4/3/3/2 slots. Wizard adds two
ordinary spellbook spells, not another Evocation Savant choice (Savant granted at 7 and next
grants at 9). Warlock has nine selected preparations, six invocations, and two fourth-level Pact
slots. Ranger and Paladin keep seven selected preparations and 4/3 slots. Always-prepared
subclass/feature spells remain outside these limits. Monk Focus and Sorcerer Sorcery Points
increase to eight; unchanged resources retain their spent counts. Bard and Rogue retain two
and four Expertise choices respectively. No class receives a level-8 subclass grant.

Druid's source table on page 42 permits eight known Beast forms, CR up to 1, and flying forms at
level 8. These are assisted limits, not a Beast catalog or stat-block transformation. Wild Shape
continues to spend its resource atomically, while form eligibility, temporary HP, equipment,
duration, and transformed statistics remain manual. This slice does not add a fifth-level spell
tier, grant later class features, or restore expended resources as part of advancement.
