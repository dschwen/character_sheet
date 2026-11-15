import { describe, expect, it } from "vitest";
import {
  eligibleToolIds,
  toolProficiencyChoiceSchema,
  toolBodySchema,
  type ContentEntity,
} from "./index.js";

describe("shared tool proficiency schemas", () => {
  const body = {
    category: "musical-instrument",
    ability: "charisma",
    checkId: "lute",
    description: "Source description",
    proficiencyRuleId: "test.rule.tools",
  };
  const tool = { id: "test.tool.lute", kind: "tool", body } as ContentEntity;
  it("accepts bounded category choices and individual explicit tool pools", () => {
    expect(toolBodySchema.parse(body).ability).toBe("charisma");
    const definition = toolProficiencyChoiceSchema.parse({
      minimum: 1,
      maximum: 1,
      category: "musical-instrument",
    });
    expect(eligibleToolIds(definition, [tool, { ...tool, id: "test.fake", kind: "feat" }])).toEqual(
      [tool.id],
    );
    expect(
      eligibleToolIds(
        toolProficiencyChoiceSchema.parse({ minimum: 1, maximum: 1, options: [tool.id] }),
        [tool],
      ),
    ).toEqual([tool.id]);
  });
  it("intersects explicit IDs with categories and rejects wrong categories", () => {
    expect(
      eligibleToolIds(
        toolProficiencyChoiceSchema.parse({
          minimum: 1,
          maximum: 1,
          categories: ["artisan"],
          options: [tool.id],
        }),
        [tool],
      ),
    ).toEqual([]);
  });
  it("rejects absent pools, inverted bounds and unrecognized categories", () => {
    for (const value of [
      { minimum: 1, maximum: 1 },
      { minimum: 2, maximum: 1, category: "artisan" },
      { minimum: 1, maximum: 1, category: "invented" },
    ])
      expect(toolProficiencyChoiceSchema.safeParse(value).success).toBe(false);
  });
  it("requires structured tool metadata rather than a generic container proficiency", () => {
    expect(toolBodySchema.safeParse({ ...body, category: "generic-tool" }).success).toBe(false);
    expect(toolBodySchema.safeParse({ ...body, proficiencyRuleId: undefined }).success).toBe(false);
    expect(toolBodySchema.safeParse({ ...body, ability: "luck" }).success).toBe(false);
  });
});
