import type { CharacterEvaluation, SpellSummary } from "@dnd/rules-api";

import type { DicePoolRollRequest } from "./dice-roll";

export function spellHealingRequests(
  spell: SpellSummary,
  evaluation: CharacterEvaluation,
  slotLevel?: number,
  castingSourceId?: string,
): DicePoolRollRequest[] {
  const option =
    castingSourceId === undefined
      ? spell.castingOptions?.[0]
      : spell.castingOptions?.find(({ sourceId }) => sourceId === castingSourceId);
  const ability = option?.ability ?? evaluation.spellcasting?.ability;
  const modifier = ability === undefined ? 0 : evaluation.facts[`ability.${ability}.modifier`];
  const extra =
    slotLevel === undefined
      ? 0
      : (evaluation.spellHealingEffects ?? [])
          .filter(({ target }) => target === "healed-creature")
          .reduce((sum, effect) => sum + effect.base + slotLevel * effect.perSlotLevel, 0);
  return (spell.healing ?? []).map((healing) => {
    if (healing.addSpellcastingModifier && typeof modifier !== "number")
      throw new TypeError("Healing spell is missing its spellcasting modifier.");
    return {
      label: `${spell.name} · Healing${slotLevel === undefined ? " (base/free casting)" : ` (level ${String(slotLevel)} slot)`}${extra > 0 ? " · includes spell healing bonus" : ""}`,
      diceCount:
        healing.diceCount +
        Math.max(0, (slotLevel ?? spell.level) - spell.level) * healing.dicePerSlotLevel,
      diceSize: healing.diceSize,
      modifier:
        (healing.addSpellcastingModifier && typeof modifier === "number" ? modifier : 0) + extra,
    };
  });
}
