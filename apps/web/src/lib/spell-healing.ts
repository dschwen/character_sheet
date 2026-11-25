import { spellHealingRolls } from "@dnd/rules-core";
import type { DicePoolRollRequest } from "./dice-roll";

export function spellHealingRequests(
  ...args: Parameters<typeof spellHealingRolls>
): DicePoolRollRequest[] {
  const [spell, , slotLevel] = args;
  return spellHealingRolls(...args).map(({ spellHealingBonus, ...dice }) => ({
    ...dice,
    label: `${spell.name} · Healing${slotLevel === undefined ? " (base/free casting)" : ` (level ${String(slotLevel)} slot)`}${spellHealingBonus > 0 ? " · includes spell healing bonus" : ""}`,
  }));
}
