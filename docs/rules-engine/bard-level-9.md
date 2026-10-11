# Bard level 9

Creation and same-class advancement now reach level 9 using generated builder metadata
and the existing shared Expertise and spell-selection controls. The pinned SRD Bard
table (page 31) grants Proficiency Bonus +4, three cantrips, fourteen regular prepared
spells, and 4/3/3/3/1 slots at spell levels 1–5. Bardic Inspiration and Cutting Words
still use d8, not the d10 granted at level 10.

Expertise (page 32) expands from two to four proficient skills. Origin proficiencies
are eligible as well as class selections. Existing selections are retained; advancement
adds two new ones. Missing, duplicate, unproficient, and premature selections are
rejected. A shared advancement guard rejects removal of earlier class-granted
Expertise directly, including Rogue and Ranger, before building a merged document.
Four expert skills receive +8 proficiency contributions; untrained skills receive
Jack of All Trades' +2, not doubled proficiency. Bare ability checks are not enhanced.

Repeated Expertise table rows now resolve to their original extracted source feature,
like repeated Ability Score Improvements. This also corrects Rogue's level-6 source
reference; its builder limit remains unchanged. Resolution does not invent features
without an extracted source or grant them before their initial level.

College of Lore retains two always-prepared Magical Discoveries outside the fourteen
ordinary selections. At level up, one Discovery can be replaced with an eligible spell
from newly available fifth-level slots. Ordinary preparations gain two selections and
allow at most one previous-spell replacement. Preparation remains level-up-only; level-10
Magical Secrets and its expanded ordinary spell lists are not granted early.

Advancement retains earlier levels, feats, ability allocations, inventory, currency, HP,
and spent slots/resources. Casting spends the fifth-level slot atomically; exhausted
or under-level casts fail without changing state. Long Rest restores standard slots.

External targets, component costs, unmodeled spell effects, and Inspiration timing still
need manual adjudication. This slice does not claim full fifth-level effect automation,
levels 10+, independent semantic review, or rendered browser verification.
