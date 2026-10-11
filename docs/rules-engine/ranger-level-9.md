# Ranger level 9

Creation and same-class advancement now reach level 9 through generated builder metadata
and the shared Expertise and spell-selection controls. The pinned SRD Ranger table
(page 58) grants Proficiency Bonus +4, nine ordinary prepared spells, and 4/3/2 spell
slots at levels 1–3. Hunter's Mark stays always prepared outside those nine selections;
Favored Enemy still provides four free uses. Tireless is not granted before level 10.

Deft Explorer (page 59) retains its one level-2 Expertise selection. The separate
level-9 Expertise feature adds two more proficient skills without existing Expertise.
Shared metadata records the level, count, and source of each grant, while remaining
compatible with older single-source metadata. Builder previews and persisted choices
retain the correct source links. Origin proficiencies are eligible too. Missing,
duplicate, unproficient, and premature choices are rejected; cross-source duplication
is also rejected for persisted documents. Advancement cannot replace or relabel an
earlier selection. Expert skills receive a +8 proficiency contribution at level 9.

Advancement preserves earlier levels, feats, ability allocations, inventory, currency,
HP, temporary HP, and spent resources/slots. Existing Hunter choices remain unchanged.
Third-level casting spends slots atomically and supports modeled concentration;
exhausted or under-level casts fail without changing state. Short Rest does not
restore ordinary Ranger slots, while Long Rest does.

The preparation editor still does not enforce the Ranger rule allowing only one
prepared-spell replacement per Long Rest (page 58). That existing rest/preparation
workflow gap remains outstanding; nine valid selections alone do not establish legal
replacement timing. Spell targets, component costs, and unmodeled spell effects
still require manual adjudication. This slice does not claim levels 10+, full spell
effect automation, independent semantic review, or rendered browser verification.
