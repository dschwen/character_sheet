# Repeated Ability Score Improvements and level 8

The pinned SRD's Ability Score Improvement feat (page 87) is repeatable and allows either +2 to
one ability or +1 to two distinct abilities, without exceeding 20. Both creation and advancement
offer all 21 allocations through shared controls. The granting levels come from each class's
source-linked progression table, including Fighter's extra level-6 grant and third grant at 8.
All twelve class builders and same-class advancement workflows reach level 8. Repeated ASI
entries in the source progression tables resolve to the original class feature rather than a
missing reference. Grappler is now available alongside ASI; additional feat categories and Epic
Boons remain an unfinished workflow.

The draft stores generic feat IDs and per-feat ability increases, not class-specific ASI tuples.
Shared controls generate the legal options from each supported feat's source-linked patterns,
allowed abilities, repeatability, prerequisite, and maximum score. Saved documents retain the existing
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

## Grappler

The pinned page-87 feat grants +1 Strength or Dexterity (maximum 20), requires character level 4
and Strength **or** Dexterity 13, and is not repeatable. Its prerequisite is evaluated at acquisition,
before its own increase and before later feat bonuses. Explicit earlier acquisition records may
qualify the character; ambiguous legacy aggregate bonuses are not assumed to have occurred earlier.
Sheets with an unrecorded ability-prerequisite feat need their history repaired explicitly before
advancement. Recorded Grappler plus unrecorded legacy ASIs is supported when qualification can
be established without guessing the ASIs' historical order.

Creation and advancement share one selector. Advancement cannot change a previous feat ID or
its allocation. Combat shows source-derived Punch and Grab, Attack Advantage, and Fast Wrestler
guidance. These benefits remain assisted: targets, the grapple save/condition, once-per-turn timing,
size, movement costs, and target-specific Advantage are manual. The attack buttons do not grant
global Advantage from Grappler. No character model migration or unrelated play-state rewrite is
needed. Source extraction and tests do not constitute independent semantic review.

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
