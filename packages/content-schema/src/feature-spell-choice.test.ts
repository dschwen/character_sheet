import { describe, expect, it } from "vitest";

import { classFeatureChoiceSchema } from "./index.js";

describe("feature spell choice grant modes", () => {
  const choice = {
    id: "test.choice.spells",
    level: 3,
    minimum: 1,
    maximum: 1,
    options: ["test.spell.example"],
    spellSelection: {
      sourceFeatureId: "test.feature.spells",
      castingClassId: "test.class.caster",
      sourceClassIds: ["test.class.caster"],
      alwaysPrepared: false,
      spellbookAddition: true,
      allowCantrips: false,
      school: "evocation",
      maximumSpellLevel: 2,
    },
  };
  it("accepts mutually exclusive spellbook and preparation grants", () => {
    expect(classFeatureChoiceSchema.safeParse(choice).success).toBe(true);
    expect(
      classFeatureChoiceSchema.safeParse({
        ...choice,
        spellSelection: {
          ...choice.spellSelection,
          alwaysPrepared: true,
          spellbookAddition: undefined,
        },
      }).success,
    ).toBe(true);
  });
  it("rejects ambiguous or absent grant modes", () => {
    expect(
      classFeatureChoiceSchema.safeParse({
        ...choice,
        spellSelection: { ...choice.spellSelection, alwaysPrepared: true },
      }).success,
    ).toBe(false);
    expect(
      classFeatureChoiceSchema.safeParse({
        ...choice,
        spellSelection: { ...choice.spellSelection, spellbookAddition: undefined },
      }).success,
    ).toBe(false);
  });
});
