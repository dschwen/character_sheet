import { describe, expect, it } from "vitest";

import { classFeatureChoiceSchema, featureChoiceEnabled } from "./index.js";

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
  it("gates conditional spell choices on exactly one matching parent option", () => {
    const conditional = classFeatureChoiceSchema.parse({
      ...choice,
      requiredOption: { choiceId: "test.choice.parent", optionId: "test.option.cantrips" },
    });
    expect(featureChoiceEnabled(conditional, {})).toBe(false);
    expect(featureChoiceEnabled(conditional, { "test.choice.parent": ["test.option.other"] })).toBe(
      false,
    );
    expect(
      featureChoiceEnabled(conditional, { "test.choice.parent": ["test.option.cantrips"] }),
    ).toBe(true);
    expect(
      featureChoiceEnabled(conditional, {
        "test.choice.parent": ["test.option.cantrips", "test.option.other"],
      }),
    ).toBe(false);
    expect(featureChoiceEnabled(classFeatureChoiceSchema.parse(choice), {})).toBe(true);
    expect(
      classFeatureChoiceSchema.safeParse({
        ...conditional,
        requiredOption: { ...conditional.requiredOption, choiceId: choice.id },
      }).success,
    ).toBe(false);
    expect(
      classFeatureChoiceSchema.safeParse({ ...conditional, spellSelection: undefined }).success,
    ).toBe(false);
  });
});
