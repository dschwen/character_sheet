# Druid levels 1–6 vertical slice

The reviewed `druid-5.json` fixture is a Human Soldier Circle of the Land Druid. It selects the
Warden Primal Order and Polar land, equips medium armor and a Shield, learns three cantrips, and
prepares nine spells from the complete 124-entry Druid list.

The evaluator derives Wisdom spell attack and save values, level-5 spell slots, five additional
always-prepared spells (Speak with Animals plus the four available Polar spells), and two Wild
Shape uses. Wild Shape, Wild Companion, and Land’s Aid expose atomic actions that spend the shared
resource. Short Rest restores one use; Long Rest restores all uses and spell slots.

The generated content retains every Druid and Circle of the Land feature through level 20 as
source-linked structured text. The builder and advancement workflow support level 6, including
ten selected prepared spells, three third-level slots, and Natural Recovery.

Natural Recovery grants two independent once-per-Long-Rest resources. One free-casts a leveled
spell from the currently selected Circle land's available spells. Circle cantrips and unrelated
prepared spells are not eligible. All eligible spells share the same free-casting use, and the
normal concentration rules still apply.

The other benefit is an explicit slot selection within a Short Rest proposal. The combined levels
cannot exceed half Druid level rounded up (three at level 6), no slot can exceed level 5, and only
expended slots can be recovered. Partial recovery spends the entire use. Invalid selections leave
all rest effects unapplied, and ordinary Short Rests do not consume the benefit. Both resources
recharge on Long Rest. The same engine and UI support Wizard's Arcane Recovery.

These limits remain intentionally roll-assisted:

- Wild Shape form eligibility, stat-block replacement, duration, and temporary Hit Points are not
  applied to the character document.
- Wild Companion supports spending Wild Shape; its alternative spell-slot payment is not yet an
  action transition.
- Wild Resurgence’s conversion between a spell slot and Wild Shape remains descriptive.
- A Circle land can be changed by editing the persisted selection after a Long Rest; the rest
  transition does not choose a new land automatically.
