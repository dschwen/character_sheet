import type { CharacterDocument } from "@dnd/character-model";
import { abilities, titleCase, type Ability } from "./presentation";

export const abilityScoreImprovementId = "srd521.feat.general.ability-score-improvement";
export type AsiAllocation = [Ability, Ability];

export function validAsiAllocation(allocation: readonly unknown[]): allocation is AsiAllocation {
  return (
    allocation.length === 2 &&
    allocation.every((ability) => abilities.some((candidate) => candidate === ability))
  );
}

export function asiIncreases(
  allocations: readonly AsiAllocation[],
): Partial<Record<Ability, number>> {
  const increases: Partial<Record<Ability, number>> = {};
  for (const allocation of allocations)
    for (const ability of allocation) increases[ability] = (increases[ability] ?? 0) + 1;
  return increases;
}

export function asiLabel(allocation: AsiAllocation): string {
  return allocation[0] === allocation[1]
    ? `+2 ${titleCase(allocation[0])}`
    : `+1 ${titleCase(allocation[0])}, +1 ${titleCase(allocation[1])}`;
}

export const asiOptions = abilities.flatMap((first, index) =>
  abilities.slice(index).map((second) => {
    const allocation: AsiAllocation = [first, second];
    return { value: allocation.join(","), label: asiLabel(allocation), allocation };
  }),
);

/** Older documents have only totals; recover a legal allocation, never claim historical order. */
export function savedAsiAllocations(
  character: CharacterDocument,
  grantLevels: readonly number[],
): AsiAllocation[] {
  const pending = { ...character.build.featAbilityScoreIncreases };
  const saved = grantLevels.map((level) => {
    const record = character.build.levels[level - 1]?.featSelections?.find(
      ({ featId }) => featId === abilityScoreImprovementId,
    );
    if (record === undefined) return undefined;
    const points = abilities.flatMap((ability) =>
      Array.from({ length: record.abilityScoreIncreases[ability] ?? 0 }, () => ability),
    );
    if (points.length !== 2) throw new Error("Saved Ability Score Improvement is invalid.");
    for (const ability of points) pending[ability] = (pending[ability] ?? 0) - 1;
    const first = points[0];
    const second = points[1];
    if (first === undefined || second === undefined) throw new Error("Missing saved ability.");
    return [first, second] satisfies AsiAllocation;
  });
  if (abilities.some((ability) => (pending[ability] ?? 0) < 0))
    throw new Error("Saved feat allocations disagree with ability increase totals.");
  const remaining = abilities.flatMap((ability) =>
    Array.from({ length: pending[ability] ?? 0 }, () => ability),
  );
  if (remaining.length !== saved.filter((allocation) => allocation === undefined).length * 2)
    throw new Error("Existing feat bonuses cannot be represented by the supported ASI choices.");
  let index = 0;
  return saved.map((allocation) => {
    if (allocation !== undefined) return allocation;
    const first = remaining[index++];
    const second = remaining[index++];
    if (first === undefined || second === undefined) throw new Error("Missing legacy ASI points.");
    return [first, second];
  });
}
