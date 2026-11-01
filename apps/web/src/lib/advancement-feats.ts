import { z } from "zod";
import type { CharacterDocument } from "@dnd/character-model";
import { abilities, titleCase, type Ability } from "./presentation";
import {
  abilityScoreImprovementId,
  asiIncreases,
  savedAsiAllocations,
  type AsiAllocation,
} from "./ability-score-improvements";

export const advancementFeatMetadataSchema = z.object({
  category: z.literal("general"),
  repeatable: z.boolean().default(false),
  // Ability-only prerequisites are a real feat shape (see the 2014-style edition reference
  // record); an absent level floor means no level gate, handled as 0 at the gate below.
  prerequisite: z
    .object({
      minimumCharacterLevel: z.number().int().positive().optional(),
      anyAbilityScoreMinimums: z
        .array(z.object({ ability: z.enum(abilities), minimum: z.number().int().positive() }))
        .optional(),
    })
    .optional(),
  abilityScoreIncreasePatterns: z.array(z.array(z.number().int().positive())),
  abilityScoreIncreaseAbilities: z.array(z.enum(abilities)).default([...abilities]),
  maximumAbilityScore: z.number().int().positive(),
  combatGuidance: z.array(z.string()).default([]),
});
export type AdvancementFeatMetadata = z.infer<typeof advancementFeatMetadataSchema>;
export type AdvancementFeatSelection = NonNullable<
  CharacterDocument["build"]["levels"][number]["featSelections"]
>[number];
export function asiFeatSelection(allocation: AsiAllocation): AdvancementFeatSelection {
  return { featId: abilityScoreImprovementId, abilityScoreIncreases: asiIncreases([allocation]) };
}
export function featIncreases(
  selections: readonly AdvancementFeatSelection[],
): Partial<Record<Ability, number>> {
  const result: Partial<Record<Ability, number>> = {};
  for (const selection of selections)
    for (const ability of abilities) {
      const increase = selection.abilityScoreIncreases[ability];
      if (increase !== undefined) result[ability] = (result[ability] ?? 0) + increase;
    }
  return result;
}
export function featSelectionKey(selection: AdvancementFeatSelection): string {
  return `${selection.featId}:${abilities.map((ability) => selection.abilityScoreIncreases[ability] ?? 0).join(",")}`;
}
export function featIncreaseLabel(selection: AdvancementFeatSelection): string {
  return abilities
    .filter((ability) => selection.abilityScoreIncreases[ability])
    .map((ability) => `+${String(selection.abilityScoreIncreases[ability])} ${titleCase(ability)}`)
    .join(", ");
}
export function featAllocationOptions(feat: {
  id: string;
  name: string;
  advancement?: AdvancementFeatMetadata;
}) {
  const metadata = feat.advancement;
  if (metadata === undefined) return [];
  const options = new Map<
    string,
    { value: string; label: string; selection: AdvancementFeatSelection }
  >();
  const visit = (
    pattern: number[],
    index: number,
    increases: Partial<Record<Ability, number>>,
  ): void => {
    if (index === pattern.length) {
      const selection = { featId: feat.id, abilityScoreIncreases: increases };
      const value = featSelectionKey(selection);
      options.set(value, {
        value,
        label: `${feat.name}: ${featIncreaseLabel(selection)}`,
        selection,
      });
      return;
    }
    for (const ability of metadata.abilityScoreIncreaseAbilities) {
      if (increases[ability] !== undefined) continue;
      visit(pattern, index + 1, { ...increases, [ability]: pattern[index] });
    }
  };
  for (const pattern of metadata.abilityScoreIncreasePatterns) visit(pattern, 0, {});
  if (metadata.abilityScoreIncreasePatterns.length === 0) {
    // A feat record that declares no increase patterns at all (the 2014-variant Ritual Caster
    // record) occupies its feat slot with exactly one legal allocation: no increases at all.
    // The rules engine reconciles the same shape in allocationsByFeat.
    const selection: AdvancementFeatSelection = { featId: feat.id, abilityScoreIncreases: {} };
    options.set(featSelectionKey(selection), {
      value: featSelectionKey(selection),
      label: `${feat.name}: no ability score increase`,
      selection,
    });
  }
  return [...options.values()];
}

/** Preserve recorded choices exactly; reconstruct only legacy ASIs, never feat prerequisites. */
export function savedAdvancementFeats(
  character: CharacterDocument,
  grantLevels: readonly number[],
): AdvancementFeatSelection[] {
  const residual = structuredClone(character);
  const saved = grantLevels.map((level) => {
    const records = character.build.levels[level - 1]?.featSelections;
    if (records === undefined) return undefined;
    if (records.length !== 1 || records[0] === undefined)
      throw new Error("Saved feat acquisition is invalid.");
    const record = records[0];
    for (const ability of abilities) {
      const remainder =
        (residual.build.featAbilityScoreIncreases[ability] ?? 0) -
        (record.abilityScoreIncreases[ability] ?? 0);
      if (remainder < 0)
        throw new Error("Saved feat allocations disagree with ability increase totals.");
      if (remainder === 0)
        residual.build.featAbilityScoreIncreases = Object.fromEntries(
          Object.entries(residual.build.featAbilityScoreIncreases).filter(
            ([key]) => key !== ability,
          ),
        );
      else residual.build.featAbilityScoreIncreases[ability] = remainder;
    }
    return structuredClone(record);
  });
  const missingLevels = grantLevels.filter((_, index) => saved[index] === undefined);
  const recordedIds = saved.flatMap((selection) =>
    selection === undefined ? [] : [selection.featId],
  );
  const remainingIds = [...character.build.featIds];
  for (const id of recordedIds) {
    const index = remainingIds.indexOf(id);
    if (index < 0) throw new Error("Saved feat is missing from the selected feat list.");
    remainingIds.splice(index, 1);
  }
  if (remainingIds.filter((id) => id === abilityScoreImprovementId).length !== missingLevels.length)
    throw new Error(
      "Existing feat acquisitions need explicit history; only legacy ASIs can be reconstructed.",
    );
  const legacy = savedAsiAllocations(residual, missingLevels).map(asiFeatSelection);
  return saved.map((selection) => {
    const result = selection ?? legacy.shift();
    if (result === undefined) throw new Error("Missing saved feat.");
    return result;
  });
}
