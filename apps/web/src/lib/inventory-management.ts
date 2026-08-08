import {
  characterDocumentSchema,
  type CharacterCurrency,
  type CharacterDocument,
  type CurrencyDenomination,
} from "@dnd/character-model";
import type { LoadedRulesPackage } from "@dnd/rules-api";

const copperValues: Readonly<Record<CurrencyDenomination, number>> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};
const denominationsDescending = ["pp", "gp", "ep", "sp", "cp"] as const;
const changeDenominations = ["pp", "gp", "sp", "cp"] as const;

export interface InventoryCatalogItem {
  id: string;
  name: string;
  kind: string;
  equippable: boolean;
  purchaseQuantity: number;
  cost?: {
    amount: number;
    denomination: CurrencyDenomination;
  };
}

export interface InventoryChangeProposal {
  applicable: boolean;
  issues: string[];
  nextCharacter?: CharacterDocument;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function localizedName(entity: LoadedRulesPackage["entities"][number]): string {
  return entity.name.en ?? Object.values(entity.name)[0] ?? entity.id;
}

function denomination(value: unknown): CurrencyDenomination | undefined {
  return denominationsDescending.find((candidate) => candidate === value);
}

export function inventoryCatalog(rulesPackage: LoadedRulesPackage): InventoryCatalogItem[] {
  return rulesPackage.entities
    .filter((entity) => entity.kind.startsWith("equipment-"))
    .map((entity) => {
      const body = objectValue(entity.body);
      const costBody = objectValue(body?.cost);
      const costDenomination = denomination(costBody?.denomination);
      const costAmount = costBody?.amount;
      const purchaseQuantity = body?.purchaseQuantity;
      return {
        id: entity.id,
        name: localizedName(entity),
        kind: entity.kind,
        equippable: ["equipment-weapon", "equipment-armor", "equipment-shield"].includes(
          entity.kind,
        ),
        purchaseQuantity:
          typeof purchaseQuantity === "number" && Number.isInteger(purchaseQuantity)
            ? purchaseQuantity
            : 1,
        ...(typeof costAmount === "number" &&
        Number.isInteger(costAmount) &&
        costDenomination !== undefined
          ? { cost: { amount: costAmount, denomination: costDenomination } }
          : {}),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function currencyInCopper(currency: CharacterCurrency): number {
  return denominationsDescending.reduce(
    (total, denomination) => total + currency[denomination] * copperValues[denomination],
    0,
  );
}

export function currencyFromCopper(totalCopper: number): CharacterCurrency {
  let remaining = Math.max(0, Math.floor(totalCopper));
  const currency: CharacterCurrency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  for (const denomination of changeDenominations) {
    const value = copperValues[denomination];
    currency[denomination] = Math.floor(remaining / value);
    remaining %= value;
  }
  return currency;
}

export function formatEquipmentCost(item: InventoryCatalogItem): string {
  if (item.cost === undefined) return "Price varies";
  const quantity = item.purchaseQuantity === 1 ? "" : ` for ${String(item.purchaseQuantity)}`;
  return `${String(item.cost.amount)} ${item.cost.denomination.toUpperCase()}${quantity}`;
}

function nextInstanceId(character: CharacterDocument, entityId: string): string {
  const stem = entityId.split(".").at(-1) ?? "item";
  const ids = new Set(character.loadout.inventory.map((item) => item.id));
  let sequence = 1;
  while (ids.has(`${stem}-${String(sequence)}`)) sequence += 1;
  return `${stem}-${String(sequence)}`;
}

function inventoryWithAddition(
  character: CharacterDocument,
  item: InventoryCatalogItem,
  lots: number,
): CharacterDocument["loadout"]["inventory"] {
  const inventory = character.loadout.inventory.map((entry) => ({ ...entry }));
  if (item.equippable) {
    const occupiedIds = new Set(inventory.map((entry) => entry.id));
    const stem = item.id.split(".").at(-1) ?? "item";
    let sequence = 1;
    for (let index = 0; index < lots; index += 1) {
      while (occupiedIds.has(`${stem}-${String(sequence)}`)) sequence += 1;
      const id = `${stem}-${String(sequence)}`;
      occupiedIds.add(id);
      inventory.push({ id, entityId: item.id, quantity: 1 });
      sequence += 1;
    }
    return inventory;
  }
  const quantity = item.purchaseQuantity * lots;
  const existing = inventory.find((entry) => entry.entityId === item.id);
  if (existing === undefined) {
    inventory.push({ id: nextInstanceId(character, item.id), entityId: item.id, quantity });
  } else {
    existing.quantity += quantity;
  }
  return inventory;
}

function committedCharacter(
  character: CharacterDocument,
  loadout: CharacterDocument["loadout"],
  updatedAt: Date,
): CharacterDocument {
  return characterDocumentSchema.parse({
    ...character,
    loadout,
    metadata: {
      ...character.metadata,
      updatedAt: updatedAt.toISOString(),
      revision: character.metadata.revision + 1,
    },
  });
}

function validLots(lots: number): boolean {
  return Number.isInteger(lots) && lots > 0;
}

export function addInventoryItem(
  character: CharacterDocument,
  item: InventoryCatalogItem,
  lots = 1,
  updatedAt = new Date(),
): InventoryChangeProposal {
  if (!validLots(lots)) {
    return { applicable: false, issues: ["Item quantity must be a positive whole number."] };
  }
  return {
    applicable: true,
    issues: [],
    nextCharacter: committedCharacter(
      character,
      { ...character.loadout, inventory: inventoryWithAddition(character, item, lots) },
      updatedAt,
    ),
  };
}

export function purchaseInventoryItem(
  character: CharacterDocument,
  item: InventoryCatalogItem,
  lots = 1,
  updatedAt = new Date(),
): InventoryChangeProposal {
  if (item.cost === undefined) {
    return { applicable: false, issues: [`${item.name} doesn't have a fixed purchase price.`] };
  }
  if (!validLots(lots)) {
    return { applicable: false, issues: ["Purchase quantity must be a positive whole number."] };
  }
  const price = item.cost.amount * copperValues[item.cost.denomination] * lots;
  const available = currencyInCopper(character.loadout.currency);
  if (available < price) {
    return {
      applicable: false,
      issues: [`Not enough currency to buy ${item.name}.`],
    };
  }
  return {
    applicable: true,
    issues: [],
    nextCharacter: committedCharacter(
      character,
      {
        ...character.loadout,
        inventory: inventoryWithAddition(character, item, lots),
        currency: currencyFromCopper(available - price),
      },
      updatedAt,
    ),
  };
}

export function adjustInventoryQuantity(
  character: CharacterDocument,
  itemId: string,
  delta: number,
  updatedAt = new Date(),
): InventoryChangeProposal {
  if (!Number.isInteger(delta) || delta === 0) {
    return { applicable: false, issues: ["Quantity change must be a non-zero whole number."] };
  }
  const item = character.loadout.inventory.find((candidate) => candidate.id === itemId);
  if (item === undefined) {
    return { applicable: false, issues: ["The inventory item no longer exists."] };
  }
  const nextQuantity = item.quantity + delta;
  if (nextQuantity <= 0) return removeInventoryItem(character, itemId, updatedAt);
  const inventory = character.loadout.inventory.map((candidate) =>
    candidate.id === itemId ? { ...candidate, quantity: nextQuantity } : candidate,
  );
  return {
    applicable: true,
    issues: [],
    nextCharacter: committedCharacter(character, { ...character.loadout, inventory }, updatedAt),
  };
}

export function removeInventoryItem(
  character: CharacterDocument,
  itemId: string,
  updatedAt = new Date(),
): InventoryChangeProposal {
  if (!character.loadout.inventory.some((item) => item.id === itemId)) {
    return { applicable: false, issues: ["The inventory item no longer exists."] };
  }
  return {
    applicable: true,
    issues: [],
    nextCharacter: committedCharacter(
      character,
      {
        ...character.loadout,
        inventory: character.loadout.inventory.filter((item) => item.id !== itemId),
        equippedItemIds: character.loadout.equippedItemIds.filter((id) => id !== itemId),
        attunedItemIds: character.loadout.attunedItemIds.filter((id) => id !== itemId),
      },
      updatedAt,
    ),
  };
}

export function toggleEquippedItem(
  character: CharacterDocument,
  itemId: string,
  catalog: InventoryCatalogItem[],
  updatedAt = new Date(),
): InventoryChangeProposal {
  const inventoryItem = character.loadout.inventory.find((item) => item.id === itemId);
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const item = inventoryItem === undefined ? undefined : catalogById.get(inventoryItem.entityId);
  if (inventoryItem === undefined || item === undefined) {
    return { applicable: false, issues: ["The inventory item is unavailable."] };
  }
  if (!item.equippable) {
    return { applicable: false, issues: [`${item.name} can't be equipped.`] };
  }
  const currentlyEquipped = character.loadout.equippedItemIds.includes(itemId);
  let equippedItemIds = character.loadout.equippedItemIds.filter((id) => id !== itemId);
  if (!currentlyEquipped) {
    if (item.kind === "equipment-armor" || item.kind === "equipment-shield") {
      equippedItemIds = equippedItemIds.filter((equippedId) => {
        const equipped = character.loadout.inventory.find((entry) => entry.id === equippedId);
        return equipped === undefined || catalogById.get(equipped.entityId)?.kind !== item.kind;
      });
    }
    equippedItemIds.push(itemId);
  }
  return {
    applicable: true,
    issues: [],
    nextCharacter: committedCharacter(
      character,
      { ...character.loadout, equippedItemIds },
      updatedAt,
    ),
  };
}
