import type { ContentEntity } from "@dnd/content-schema";
import type { CharacterEvaluation, LoadedRulesPackage, SpellSummary } from "@dnd/rules-api";

const classFocuses: Readonly<Record<string, readonly string[]>> = {
  "srd521.equipment.gear.arcane-focus": ["sorcerer", "warlock", "wizard"],
  "srd521.equipment.gear.druidic-focus": ["druid", "ranger"],
  "srd521.equipment.gear.holy-symbol": ["cleric", "paladin"],
};
const componentPouch = "srd521.equipment.gear.component-pouch";

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function focusClasses(entity: ContentEntity): readonly string[] {
  const body = objectValue(entity.body);
  if (Array.isArray(body?.spellcastingFocusFor))
    return body.spellcastingFocusFor.filter((id): id is string => typeof id === "string");
  if (entity.kind === "tool" && body?.category === "musical-instrument")
    return ["srd521.class.bard"];
  return (classFocuses[entity.id] ?? []).map((name) => `srd521.class.${name}`);
}

export function isSpellcastingImplement(entity: ContentEntity): boolean {
  return entity.id === componentPouch || focusClasses(entity).length > 0;
}

export function materialComponentMessage(
  spell: Pick<SpellSummary, "id" | "castingOptions">,
  inventory: CharacterEvaluation["inventory"],
  rulesPackage: LoadedRulesPackage,
  castingSourceId?: string,
): string | undefined {
  const entity = rulesPackage.entities.find(({ id }) => id === spell.id);
  const components = objectValue(objectValue(entity?.body)?.components);
  const material = components?.materialText;
  if (typeof material !== "string") return undefined;
  if (/\b(?:cp|sp|ep|gp|pp|consum(?:e[sd]?|ing|ption))\b/iu.test(material))
    return `Material: ${material}. Provide the specified component.`;
  const sources =
    castingSourceId === undefined
      ? (spell.castingOptions ?? []).map((option) => option.sourceId)
      : [castingSourceId];
  const focusSourceIds = new Set(
    sources.map((id) => {
      if (id.startsWith("srd521.class.")) return id;
      const source = rulesPackage.entities.find((entity) => entity.id === id);
      const classId = objectValue(objectValue(source?.body)?.freeSpellCasting)?.classId;
      return typeof classId === "string" ? classId : id;
    }),
  );
  const equipped = inventory.filter((item) => {
    if (!item.equipped) return false;
    if (item.entityId === componentPouch) return true;
    const implement = rulesPackage.entities.find((entity) => entity.id === item.entityId);
    return implement !== undefined && focusClasses(implement).some((id) => focusSourceIds.has(id));
  });
  const ready = [...new Set(equipped.map((item) => item.name))];
  return ready.length > 0
    ? `Material: ${material}. Equipped substitute: ${ready.join(", ")}.`
    : `Material: ${material}. You can provide it or equip a compatible focus or Component Pouch.`;
}
