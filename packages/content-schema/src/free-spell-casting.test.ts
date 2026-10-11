import { describe, expect, it } from "vitest";
import { featureAutomationBodySchema } from "./index.js";

const classId = "test.class.caster";
const resourceId = "test.resource.free-cast";
const spellIds = ["test.spell.sample"];
describe("source-authored free casting eligibility and cost", () => {
  it.each([
    { classId, resourceId, spellIds },
    { classId, resourceId, optionChoiceId: "test.choice.spells" },
    { classId, atWill: true, spellIds, guidance: ["A feature-specific casting instruction."] },
  ])("accepts one eligibility selector and one cost model: %j", (freeSpellCasting) => {
    expect(featureAutomationBodySchema.safeParse({ freeSpellCasting }).success).toBe(true);
  });
  it.each([
    { classId, spellIds },
    { classId, atWill: true, resourceId, spellIds },
    { classId, resourceId },
    { classId, resourceId, spellIds, optionChoiceId: "test.choice.spells" },
    { classId, atWill: true, spellIds: [] },
    { classId, resourceId, spellIds, guidance: [""] },
  ])("rejects incomplete or ambiguous casting: %j", (freeSpellCasting) => {
    expect(featureAutomationBodySchema.safeParse({ freeSpellCasting }).success).toBe(false);
  });
});
