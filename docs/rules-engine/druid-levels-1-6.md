# Druid levels 1–7 vertical slice

The reviewed `druid-5.json` fixture is a Human Soldier Circle of the Land Druid. It selects the
Warden Primal Order and Polar land, equips medium armor and a Shield, learns three cantrips, and
prepares nine spells from the complete 124-entry Druid list.

The evaluator derives Wisdom spell attack and save values, level-5 spell slots, five additional
always-prepared spells (Speak with Animals plus the four available Polar spells), and two Wild
Shape uses. Wild Shape, Wild Companion, and Land’s Aid expose atomic actions that spend the shared
resource. Short Rest restores one use; Long Rest restores all uses and spell slots.

The generated content retains every Druid and Circle of the Land feature through level 20 as
source-linked structured text. At level 6, the builder and advancement workflow include
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

Level 7 increases preparation to eleven selected spells and slots to 4/3/3/1. Each land adds one
always-prepared spell: Arid → Blight, Polar → Ice Storm, Temperate → Freedom of Movement, and
Tropical → Polymorph. Natural Recovery's slot budget becomes four; its free-casting source also
offers the newly available land spell.

Elemental Fury requires one permanent choice: Potent Spellcasting or Primal Strike. Potent
Spellcasting adds the Wisdom modifier (including negative values) to structured Druid cantrip
damage using the selected Druid casting source, not a separate feat or species source.
Shift-click the damage button to explain the bonus.

Primal Strike appears in Play → Damage riders as a separate fullscreen/fallback 1d8 Cold, Fire,
Lightning, or Thunder roll. Confirm a creature hit with a weapon or a Beast form's attack in Wild
Shape, your own turn, and that the rider is unused this turn. Declared critical hits double the
rider dice; successful rolls clear the unused checkbox. Wild Shape eligibility, turn boundaries,
hit adjudication, and applying damage to the target remain manual.

These limits remain intentionally roll-assisted:

- Wild Shape form eligibility, stat-block replacement, duration, and temporary Hit Points are not
  applied to the character document.
- Wild Companion supports spending Wild Shape; its alternative spell-slot payment is not yet an
  action transition.
- Wild Resurgence’s conversion between a spell slot and Wild Shape remains descriptive.
- Circle land changes now use the shared Play → Rest editor and commit only on a Long Rest.
  An ordinary-preparation collision requires an explicit replacement first; no spell is chosen
  automatically. See [Scholar and land-rest repairs](scholar-and-land-rest.md).
