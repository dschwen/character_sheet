import type { AttackSummary } from "@dnd/rules-api";

export function selectedAttackMastery(
  attack: AttackSummary,
  replacement?: string,
): string | undefined {
  if (!attack.mastery?.enabled) return undefined;
  return replacement && attack.mastery.replacements?.includes(replacement)
    ? replacement
    : attack.mastery.property;
}
