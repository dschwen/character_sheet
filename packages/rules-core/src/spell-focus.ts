import type { ContentEntity } from "@dnd/content-schema";
import type { CharacterEvaluation, LoadedRulesPackage, SpellSummary } from "@dnd/rules-api";

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
  return [];
}

export function isSpellcastingImplement(entity: ContentEntity): boolean {
  return entity.id === componentPouch || focusClasses(entity).length > 0;
}

export function resolveMaterialComponent(
  spell: Pick<SpellSummary, "id" | "castingOptions">,
  inventory: CharacterEvaluation["inventory"],
  rulesPackage: LoadedRulesPackage,
  castingSourceId?: string,
):
  | { material: string; requiresSpecifiedComponent: boolean; equippedSubstitutes: string[] }
  | undefined {
  const entity = rulesPackage.entities.find(({ id }) => id === spell.id);
  const components = objectValue(objectValue(entity?.body)?.components);
  const material = components?.materialText;
  if (typeof material !== "string") return undefined;
  if (/\b(?:cp|sp|ep|gp|pp|consum(?:e[sd]?|ing|ption))\b/iu.test(material))
    return { material, requiresSpecifiedComponent: true, equippedSubstitutes: [] };
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
  return {
    material,
    requiresSpecifiedComponent: false,
    equippedSubstitutes: [...new Set(equipped.map((item) => item.name))],
  };
}
