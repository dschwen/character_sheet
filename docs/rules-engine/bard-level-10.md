# Bard level 10: Magical Secrets

Pinned SRD 5.2.1: Bard progression and Inspiration pages 31–32; Magical Secrets page 33.
Creation and same-class advancement now reach level 10 with proficiency +4, four Expertise
skills, four Bard cantrips, fifteen ordinary preparations, two Lore Discoveries, d10 Inspiration
and Cutting Words, and spell slots 4/3/3/3/2.

Magical Secrets allows new preparations and replacements from Bard, Cleric, Druid, and Wizard
lists. It does not grant extra preparation slots, always-prepared spells, foreign cantrips,
or permission to replace the whole list. At level 10, one new preparation plus one ordinary
replacement permits at most two off-list ordinary spells. Lore's always-prepared Discoveries
retain their own selection and replacement rules and do not use this budget.

Shared class metadata declares the source feature, minimum class level, leveled-spell restriction,
and source lists. A common resolver feeds builder, advancement, preparation view, and core
validation. It derives the cumulative off-list bound from preparation growth since the preceding
level plus allowed per-level replacements. The bound also constrains direct higher-level creation
and imported documents; it is not a fabricated per-spell acquisition history. The source-linked
`spellcasting.bard.expandedPreparations` trace shows the bound and selection count. Existing
advancement guards independently reject removing more than one earlier preparation per level.

Cross-list selections use Bard's Charisma, slots, casting rules, and ordinary preparation count.
Preparation remains level-up-only, including after rests. Previous build records, equipment,
conditions, HP, and expended state are retained. Cantrip replacements remain separately bounded.

External target effects, costly components, unmodeled spell semantics, and Inspiration timing
remain assisted. This slice does not claim levels 11–20 support, full spell-effect automation,
per-spell historical provenance, independent semantic review, or completion of the full plan.
