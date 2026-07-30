import type { ProficiencyLevel, RollMode } from "@dnd/rules-api";

const proficiencyRanks: Readonly<Record<ProficiencyLevel, number>> = {
  none: 0,
  half: 1,
  proficient: 2,
  expertise: 3,
};

export function resolveProficiencyLevel(
  contributions: readonly ProficiencyLevel[],
): ProficiencyLevel {
  return contributions.reduce<ProficiencyLevel>(
    (highest, contribution) =>
      proficiencyRanks[contribution] > proficiencyRanks[highest] ? contribution : highest,
    "none",
  );
}

export function proficiencyContribution(level: ProficiencyLevel, proficiencyBonus: number): number {
  switch (level) {
    case "none":
      return 0;
    case "half":
      return Math.floor(proficiencyBonus / 2);
    case "proficient":
      return proficiencyBonus;
    case "expertise":
      return proficiencyBonus * 2;
  }
}

export function resolveRollMode(
  advantageSources: readonly string[],
  disadvantageSources: readonly string[],
): RollMode {
  const hasAdvantage = advantageSources.length > 0;
  const hasDisadvantage = disadvantageSources.length > 0;
  if (hasAdvantage === hasDisadvantage) {
    return "normal";
  }
  return hasAdvantage ? "advantage" : "disadvantage";
}
