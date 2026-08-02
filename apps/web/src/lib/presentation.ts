import type { CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";

export const abilities = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

export type Ability = (typeof abilities)[number];

export function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

export function titleCase(value: string): string {
  return value
    .split(/[.-]/u)
    .map((part) => (part.length === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join(" ");
}

export function shortEntityName(entityId: string | undefined): string {
  if (entityId === undefined) return "—";
  return titleCase(entityId.split(".").at(-1) ?? entityId);
}

export function classSummary(character: CharacterDocument): string {
  const classLevels = new Map<string, number>();
  for (const level of character.build.levels) {
    classLevels.set(level.classId, (classLevels.get(level.classId) ?? 0) + 1);
  }
  return [...classLevels.entries()]
    .map(([classId, levels]) => `${shortEntityName(classId)} ${String(levels)}`)
    .join(" / ");
}

export function entityNames(rulesPackage: LoadedRulesPackage): ReadonlyMap<string, string> {
  return new Map(
    rulesPackage.entities.map((entity) => [
      entity.id,
      entity.name.en ?? Object.values(entity.name)[0] ?? shortEntityName(entity.id),
    ]),
  );
}

export function numericFact(evaluation: CharacterEvaluation, id: string): number {
  const value = evaluation.facts[id];
  return typeof value === "number" ? value : 0;
}

export function numericFactText(evaluation: CharacterEvaluation, id: string): string {
  const value = evaluation.facts[id];
  return typeof value === "number" ? String(value) : "—";
}

export function damageText(damage: CharacterEvaluation["attacks"][number]["damage"]): string {
  const dice =
    damage.diceCount !== undefined && damage.diceSize !== undefined
      ? `${String(damage.diceCount)}d${String(damage.diceSize)}`
      : "";
  const bonus = damage.bonus === 0 ? "" : signed(damage.bonus);
  const flat = damage.flat === undefined ? "" : String(damage.flat);
  return `${dice}${bonus}${flat} ${titleCase(damage.type)}`.trim();
}
