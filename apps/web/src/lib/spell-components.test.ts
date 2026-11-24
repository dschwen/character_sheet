import { describe, expect, it } from "vitest";
import type { InventoryItemSummary } from "@dnd/rules-api";
import { loadWebData } from "./server-data";
import { materialComponentMessage } from "./spell-components";

const { rulesPackage } = loadWebData();
const spell = { id: "srd521.spell.hex" };
const arcaneFocus: InventoryItemSummary = {
  id: "arcane-focus",
  entityId: "srd521.equipment.gear.arcane-focus",
  name: "Arcane Focus",
  equipped: true,
  quantity: 1,
  kind: "equipment-gear",
};
const holySymbol: InventoryItemSummary = {
  ...arcaneFocus,
  id: "holy-symbol",
  entityId: "srd521.equipment.gear.holy-symbol",
  name: "Holy Symbol",
};

describe("spellcasting focus guidance", () => {
  it("uses the selected source to find an eligible focus", () => {
    const material = (source: string) =>
      materialComponentMessage(spell, [arcaneFocus, holySymbol], rulesPackage, source);

    expect(material("srd521.class.warlock")).toContain("Equipped substitute: Arcane Focus.");
    expect(material("srd521.class.cleric")).toContain("Equipped substitute: Holy Symbol.");
    expect(material("srd521.class-feature.warlock.contact-patron")).toContain(
      "Equipped substitute: Arcane Focus.",
    );
    expect(material("srd521.species.elf")).not.toContain("Equipped substitute");
  });

  it("always requires the actual consumed component", () => {
    expect(
      materialComponentMessage(
        { id: "srd521.spell.find-familiar" },
        [arcaneFocus],
        rulesPackage,
        "srd521.class.wizard",
      ),
    ).toContain("Provide the specified component.");
  });
});
