import type { CharacterDocument } from "@dnd/character-model";

export const attunementLimit = 3;

export function resolveAttunement(
  loadout: CharacterDocument["loadout"],
  attunableItems: ReadonlyMap<string, string>,
) {
  const inventory = new Map(loadout.inventory.map((item) => [item.id, item]));
  const itemIds = new Set<string>();
  const entityIds = new Set<string>();
  const rejected = new Map<string, string>();

  for (const id of new Set(loadout.attunedItemIds)) {
    const item = inventory.get(id);
    const name = item === undefined ? undefined : attunableItems.get(item.entityId);
    if (item === undefined) {
      rejected.set(id, `Attuned item ${id} is missing from inventory.`);
    } else if (name === undefined) {
      rejected.set(id, `Item ${id} does not require attunement.`);
    } else if (entityIds.has(item.entityId)) {
      rejected.set(id, `You can attune to only one copy of ${name}.`);
    } else if (itemIds.size >= attunementLimit) {
      rejected.set(id, `You can attune to at most ${String(attunementLimit)} items.`);
    } else {
      itemIds.add(id);
      entityIds.add(item.entityId);
    }
  }

  return { itemIds, rejected };
}
