import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";

import {
  addInventoryItem,
  adjustInventoryQuantity,
  currencyFromCopper,
  currencyInCopper,
  formatEquipmentCost,
  inventoryCatalog,
  purchaseInventoryItem,
  removeInventoryItem,
  toggleEquippedItem,
  type InventoryChangeProposal,
} from "./inventory-management";
import { loadWebData } from "./server-data";

const updatedAt = new Date("2026-08-07T12:00:00.000Z");

function fixture(filename: string): CharacterDocument {
  const result = loadWebData().fixtures.find((candidate) => candidate.filename === filename);
  if (result === undefined) throw new Error(`Missing fixture ${filename}`);
  return result.character;
}

function changed(proposal: InventoryChangeProposal): CharacterDocument {
  expect(proposal.issues).toEqual([]);
  expect(proposal.nextCharacter).toBeDefined();
  if (proposal.nextCharacter === undefined) throw new Error("Inventory proposal failed");
  return proposal.nextCharacter;
}

describe("inventory management", () => {
  it("projects every equipment entity and its source-defined purchase terms", () => {
    const { rulesPackage } = loadWebData();
    const catalog = inventoryCatalog(rulesPackage);
    const arrows = catalog.find((item) => item.id === "srd521.equipment.ammunition.arrows");
    const spellbook = catalog.find((item) => item.id === "srd521.equipment.gear.spellbook");
    const incense = catalog.find(
      (item) => item.id === "srd521.equipment.gear.find-familiar-incense",
    );

    expect(catalog.filter((item) => item.kind.startsWith("equipment-"))).toHaveLength(142);
    expect(incense).toMatchObject({
      purchaseQuantity: 1,
      equippable: false,
      cost: { amount: 10, denomination: "gp" },
    });
    const magicItems = catalog.filter((item) => item.kind === "magic-item");
    expect(magicItems).toHaveLength(13);
    expect(
      magicItems.find((item) => item.id === "srd521.magic-item.cloak-of-protection"),
    ).toMatchObject({ equippable: true, requiresAttunement: true, wearSlot: "cloak" });
    expect(arrows).toMatchObject({ purchaseQuantity: 20, cost: { amount: 1, denomination: "gp" } });
    expect(arrows === undefined ? "" : formatEquipmentCost(arrows)).toBe("1 GP for 20");
    expect(spellbook?.cost).toBeUndefined();
  });

  it("converts coin values and makes purchases across denominations", () => {
    const { rulesPackage } = loadWebData();
    const basket = inventoryCatalog(rulesPackage).find(
      (item) => item.id === "srd521.equipment.gear.basket",
    );
    if (basket === undefined) throw new Error("Basket is missing");
    const source = characterDocumentSchema.parse({
      ...fixture("wizard-5.json"),
      loadout: { currency: { gp: 1 } },
    });

    const purchased = changed(purchaseInventoryItem(source, basket, 1, updatedAt));

    expect(currencyInCopper(source.loadout.currency)).toBe(100);
    expect(currencyFromCopper(60)).toEqual({ cp: 0, sp: 6, ep: 0, gp: 0, pp: 0 });
    expect(purchased.loadout.currency).toEqual({ cp: 0, sp: 6, ep: 0, gp: 0, pp: 0 });
    expect(purchased.loadout.inventory).toEqual([
      { id: "basket-1", entityId: basket.id, quantity: 1 },
    ]);
  });

  it("buys ammunition in source-defined bundles and rejects insufficient funds", () => {
    const { rulesPackage } = loadWebData();
    const arrows = inventoryCatalog(rulesPackage).find(
      (item) => item.id === "srd521.equipment.ammunition.arrows",
    );
    if (arrows === undefined) throw new Error("Arrows are missing");
    const funded = characterDocumentSchema.parse({
      ...fixture("wizard-5.json"),
      loadout: { currency: { gp: 2 } },
    });

    const purchased = changed(purchaseInventoryItem(funded, arrows, 1, updatedAt));
    const rejected = purchaseInventoryItem(fixture("wizard-5.json"), arrows, 1, updatedAt);

    expect(purchased.loadout.inventory[0]).toMatchObject({ entityId: arrows.id, quantity: 20 });
    expect(purchased.loadout.currency.gp).toBe(1);
    expect(rejected).toMatchObject({
      applicable: false,
      issues: ["Not enough currency to buy Arrows."],
    });
  });

  it("adds equippable items as distinct instances and stacks ordinary gear", () => {
    const { rulesPackage } = loadWebData();
    const catalog = inventoryCatalog(rulesPackage);
    const dagger = catalog.find((item) => item.id === "srd521.equipment.weapon.dagger");
    const robe = catalog.find((item) => item.id === "srd521.equipment.gear.robe");
    if (dagger === undefined || robe === undefined) throw new Error("Catalog fixtures are missing");

    const daggers = changed(addInventoryItem(fixture("wizard-5.json"), dagger, 2, updatedAt));
    const firstRobe = changed(addInventoryItem(daggers, robe, 1, updatedAt));
    const secondRobe = changed(addInventoryItem(firstRobe, robe, 1, updatedAt));

    expect(daggers.loadout.inventory).toEqual([
      { id: "dagger-1", entityId: dagger.id, quantity: 1 },
      { id: "dagger-2", entityId: dagger.id, quantity: 1 },
    ]);
    expect(secondRobe.loadout.inventory.find((item) => item.entityId === robe.id)?.quantity).toBe(
      2,
    );
  });

  it("adjusts stacks, removes instance references, and enforces one equipped armor suit", () => {
    const { rulesPackage } = loadWebData();
    const catalog = inventoryCatalog(rulesPackage);
    const leather = catalog.find(
      (item) => item.id === "srd521.equipment.armor.light.leather-armor",
    );
    if (leather === undefined) throw new Error("Leather Armor is missing");
    const fighter = fixture("fighter-5.json");
    const withLeather = changed(addInventoryItem(fighter, leather, 1, updatedAt));
    const equippedLeather = changed(
      toggleEquippedItem(withLeather, "leather-armor-1", catalog, updatedAt),
    );
    const adjustedJavelins = changed(
      adjustInventoryQuantity(equippedLeather, "javelins", -3, updatedAt),
    );
    const removed = changed(removeInventoryItem(adjustedJavelins, "leather-armor-1", updatedAt));

    expect(equippedLeather.loadout.equippedItemIds).not.toContain("chain-mail-1");
    expect(equippedLeather.loadout.equippedItemIds).toContain("leather-armor-1");
    expect(
      adjustedJavelins.loadout.inventory.find((item) => item.id === "javelins")?.quantity,
    ).toBe(5);
    expect(removed.loadout.inventory.some((item) => item.id === "leather-armor-1")).toBe(false);
    expect(removed.loadout.equippedItemIds).not.toContain("leather-armor-1");
  });
});
