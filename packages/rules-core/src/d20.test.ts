import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { proficiencyContribution, resolveProficiencyLevel, resolveRollMode } from "./d20.js";

describe("proficiency semantics", () => {
  it("keeps only the strongest proficiency state", () => {
    expect(resolveProficiencyLevel(["half", "proficient", "half"])).toBe("proficient");
    expect(resolveProficiencyLevel(["proficient", "expertise"])).toBe("expertise");
    expect(resolveProficiencyLevel([])).toBe("none");
  });

  it("rounds half proficiency down and doubles expertise", () => {
    expect(proficiencyContribution("half", 3)).toBe(1);
    expect(proficiencyContribution("proficient", 3)).toBe(3);
    expect(proficiencyContribution("expertise", 3)).toBe(6);
  });

  it("preserves the proficiency-state ordering for every supported bonus", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 6 }), (bonus) => {
        const contributions = [
          proficiencyContribution("none", bonus),
          proficiencyContribution("half", bonus),
          proficiencyContribution("proficient", bonus),
          proficiencyContribution("expertise", bonus),
        ];

        expect(contributions).toEqual([...contributions].sort((left, right) => left - right));
        expect(contributions.at(-1)).toBe(bonus * 2);
      }),
    );
  });
});

describe("advantage and disadvantage semantics", () => {
  it("does not stack repeated sources and cancels opposing states", () => {
    expect(resolveRollMode(["one", "two"], [])).toBe("advantage");
    expect(resolveRollMode([], ["one", "two"])).toBe("disadvantage");
    expect(resolveRollMode(["one", "two"], ["three"])).toBe("normal");
    expect(resolveRollMode([], [])).toBe("normal");
  });
});
