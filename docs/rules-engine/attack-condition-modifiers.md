# Condition penalties on attack rolls

The pinned SRD page 181 reduces every D20 Test by twice the character's Exhaustion
level. Attack rolls are D20 Tests. Previously the condition modifier reached checks
and saves, including Death Saving Throws, but not weapon or spell attacks.

The engine now applies the condition's authored `d20ModifierPerLevel` to every
evaluated weapon and Unarmed Strike attack and all spellcasting sources: class,
Magic Initiate, species, and free-cast options. No UI-specific penalty is needed;
existing fullscreen roll controls consume the corrected evaluated attack bonus.

Class and additional casting options can share a trace across many spells. The
engine adjusts each attack trace once and projects that result to all options.
The trace retains its original calculation and appends the condition modifier,
with Exhaustion level, numeric penalty, and source references. The corresponding
derived values, facts, casting summaries, and roll requests agree.

The penalty does not alter abilities, proficiency, weapon/spell damage, healing,
save DCs, slots, critical thresholds, species rerolls, bonus dice, or Advantage.
Zero Exhaustion adds no penalty trace. Duplicate condition toggles do not stack
the penalty. Re-evaluation is deterministic and never mutates the input sheet.
Removing one Exhaustion level through a Long Rest restores two attack points.

Tests cover all twelve classes, every modeled casting source, levels 0–5 of
Exhaustion, repeated shared traces, authored coefficient changes, and a Halfling
natural-20 replacement with a negative attack bonus. Exhaustion 6 still causes
death; the existing death-state workflow prevents ordinary attacks and revival.

This closes the numeric Exhaustion attack gap, not the broader attack audit.
Target-specific effects, range/visibility declarations, turn timing, independent
semantic review, and rendered browser verification remain separate work.
