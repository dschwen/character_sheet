# Bard level 11: preparation growth and sixth-level casting

Pinned SRD 5.2.1: Bard progression page 31; Magical Secrets page 33. Level 11 grants no class
feature. Bard creation and same-class advancement now reach level 11, so the level adds only the
progression row's values: sixteen preparations (up from fifteen), one sixth-level spell slot
(4/3/3/3/2/1), unchanged four cantrips, d10 Bardic Inspiration and Cutting Words, and proficiency +4.
Expertise and skill counts do not grow; the Ability Score Improvement arrives at 12.

The sixth level is derived, not declared. Every spell-level bound comes from the progression row's
slot keys: at level 10 the maximum castable and preparable spell level is 5, and a sixth-level spell
is rejected by builder draft validation and by core (`BARD_SPELL_LEVEL_UNAVAILABLE`). At 11 the row
adds a sixth-level slot, so the same shared derivation opens sixth-level Bard spells and, through
Magical Secrets, sixth-level spells from the Cleric, Druid, and Wizard lists. The single sixth-level
slot is spent atomically through the shared expended-slot state and refilled only by a Long Rest.

The cumulative off-list bound follows the same shared resolver as level 10: preparation growth since
the pre-expansion level plus one permitted replacement per gained level yields at most four off-list
preparations at 11, five at 12, and so on without per-level code. Off-list spells use Charisma, the
shared slots, and the ordinary preparation count. Lore Discoveries keep their own separate rules.

Advancement from 10 to 11 requires exactly the new preparation and permits at most one replacement of
an earlier preparation; two replacements are rejected. Previous build records, proficiency choices,
equipment, HP, conditions, and expended slots and resources are retained unchanged. Preparation stays
level-up-only outside level-up.

The supported maximum is a single extracted value; the builder's level options, per-level counts,
level-up eligibility, and the closed gate at 11 all read it from the generated data, and the rendered
flow is verified in browser at both viewports. Spell effects, targets, components, concentration,
rest scheduling, and the 11–20 progression beyond these derived values remain assisted or unfinished;
this slice claims no independent semantic review.
