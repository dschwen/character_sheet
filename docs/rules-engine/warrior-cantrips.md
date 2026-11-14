# Source-driven warrior choices

At level 2, Paladins (SRD 5.2.1 p54) and Rangers (p59) choose any of the four SRD Fighting
Style feats, or Blessed Warrior / Druidic Warrior respectively. Existing and new defaults remain
Defense. The UI's existing shared migration records a legacy style feat as an explicit choice
without changing the feat, inventory or play state. Imports follow the same migration path.

The generators discover eligible styles from feat prerequisite metadata and cantrips from the
Cleric/Druid spell lists. A source-linked alternative option enables a conditional spell choice
using shared `requiredOption` metadata. The builder, advancement UI, and evaluator all consume
these choices without Paladin/Ranger-specific UI branches.

Blessed Warrior grants two Cleric cantrips as Paladin spells using Charisma; Druidic Warrior
grants two Druid cantrips as Ranger spells using Wisdom. They appear as always-prepared cantrips,
count in the sheet's cantrip summary, and do not consume ordinary preparation or learned-spell
allowances. They have no free-cast resource and use normal cantrip casting and assisted effects.

The initial feat-or-alternative choice is fixed: unlike Fighter's style feature, neither source
grants later replacement of that choice. Each later class level permits replacing at most one
of the two cantrips. Advancement preserves unrelated history, inventory and spent play state.
Choosing a style instead during creation clears the conditional cantrip selections and grants.

Tests cover each style for both classes, source/ability attribution, conditional selection,
invalid lists and counts, level gating, one-replacement enforcement, and atomic advancement.
The production browser gate checks alternative selection, reload and replacement at both
desktop and narrow widths. Human semantics/test approval remains a separate review gate.
