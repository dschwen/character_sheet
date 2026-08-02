import { describe, expect, it } from "vitest";

import { evaluateCharacter } from "@dnd/rules-core";

import { classSummary, signed, titleCase } from "./presentation";
import { loadWebData } from "./server-data";

describe("web data boundary", () => {
  it("loads every reviewed fixture and the generated rules package", () => {
    const data = loadWebData();

    expect(data.rulesPackage.manifest.id).toBe("srd-5.2.1");
    expect(data.rulesPackage.entities.length).toBeGreaterThan(100);
    expect(data.rulesPackage.authoringIr?.length).toBeGreaterThan(40);
    expect(data.fixtures).toHaveLength(12);
  });

  it("can evaluate every character embedded in the static app", () => {
    const data = loadWebData();

    for (const fixture of data.fixtures) {
      const evaluation = evaluateCharacter({
        character: fixture.character,
        packages: [data.rulesPackage],
      });

      expect(evaluation.validations, fixture.filename).toEqual([]);
      expect(evaluation.traces.armorClass, fixture.filename).toBeDefined();
      expect(evaluation.facts["hitPoints.maximum"], fixture.filename).toBeTypeOf("number");
    }
  });
});

describe("sheet presentation", () => {
  it("formats signed values and identifiers for the sheet", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-1)).toBe("-1");
    expect(titleCase("animal-handling")).toBe("Animal Handling");
  });

  it("summarizes class levels from leveling history", () => {
    const fighter = loadWebData().fixtures.find(({ filename }) => filename === "fighter-5.json");

    expect(fighter).toBeDefined();
    if (fighter !== undefined) expect(classSummary(fighter.character)).toBe("Fighter 5");
  });
});
