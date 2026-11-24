import type { CharacterLoadout, InventoryItem } from "@dnd/character-model";

export function withoutInventoryItem(loadout: CharacterLoadout, itemId: string): CharacterLoadout {
  return {
    ...loadout,
    inventory: loadout.inventory.filter(({ id }) => id !== itemId),
    equippedItemIds: loadout.equippedItemIds.filter((id) => id !== itemId),
    attunedItemIds: loadout.attunedItemIds.filter((id) => id !== itemId),
  };
}

export function consumeInventoryUnit(
  loadout: CharacterLoadout,
  item: Pick<InventoryItem, "id" | "quantity">,
): CharacterLoadout {
  if (item.quantity === 1) return withoutInventoryItem(loadout, item.id);
  return {
    ...loadout,
    inventory: loadout.inventory.map((entry) =>
      entry.id === item.id ? { ...entry, quantity: entry.quantity - 1 } : entry,
    ),
  };
}
