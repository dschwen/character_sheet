# Druid level 5 vertical slice

The reviewed `druid-5.json` fixture is a Human Soldier Circle of the Land Druid. It selects the
Warden Primal Order and Polar land, equips medium armor and a Shield, learns three cantrips, and
prepares nine spells from the complete 124-entry Druid list.

The evaluator derives Wisdom spell attack and save values, level-5 spell slots, five additional
always-prepared spells (Speak with Animals plus the four available Polar spells), and two Wild
Shape uses. Wild Shape, Wild Companion, and Land’s Aid expose atomic actions that spend the shared
resource. Short Rest restores one use; Long Rest restores all uses and spell slots.

The generated content retains every Druid and Circle of the Land feature through level 20 as
source-linked structured text. Through level 5, these limits remain intentionally roll-assisted:

- Wild Shape form eligibility, stat-block replacement, duration, and temporary Hit Points are not
  applied to the character document.
- Wild Companion supports spending Wild Shape; its alternative spell-slot payment is not yet an
  action transition.
- Wild Resurgence’s conversion between a spell slot and Wild Shape remains descriptive.
- A Circle land can be changed by editing the persisted selection after a Long Rest; the rest
  transition does not choose a new land automatically.
