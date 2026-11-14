import { describe, expect, it, vi } from "vitest";

import { rollD20Fullscreen, rollDiceFullscreen, type PhysicalDiceThrow } from "./fullscreen-dice";

function physicalThrows(...results: readonly number[][]): PhysicalDiceThrow {
  let index = 0;
  return vi.fn(() => {
    const result = results[index];
    index += 1;
    if (result === undefined) throw new Error("Unexpected physical throw.");
    return Promise.resolve(result);
  });
}

describe("fullscreen physical dice result mapping", () => {
  it("does not leave a delayed unhandled rejection when renderer initialization fails", async () => {
    vi.useFakeTimers();
    try {
      // This suite runs in Node, where no fullscreen renderer can initialize.
      await expect(
        rollDiceFullscreen({ label: "Unavailable renderer", diceCount: 1, diceSize: 6 }),
      ).rejects.toThrow("only available in a browser");
      await vi.runAllTimersAsync();
      const result = await rollDiceFullscreen(
        { label: "Subsequent roll", diceCount: 1, diceSize: 6 },
        physicalThrows([4]),
      );
      expect(result.total).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps the higher physical d20 for Advantage", async () => {
    const result = await rollD20Fullscreen(
      { label: "Attack", modifier: 5, mode: "advantage" },
      physicalThrows([7, 16]),
    );

    expect(result).toMatchObject({ dice: [7, 16], kept: 16, total: 21 });
  });

  it("physically rerolls eligible d20 results before choosing the kept die", async () => {
    const throwDice = physicalThrows([1, 12], [18]);
    const result = await rollD20Fullscreen(
      {
        label: "Halfling save",
        modifier: 2,
        mode: "disadvantage",
        rerollValues: [1],
        rerollSource: "Luck",
      },
      throwDice,
    );

    expect(throwDice).toHaveBeenNthCalledWith(1, 20, 2);
    expect(throwDice).toHaveBeenNthCalledWith(2, 20, 1);
    expect(result).toMatchObject({
      dice: [18, 12],
      kept: 12,
      total: 14,
      rerolls: [{ dieIndex: 0, original: 1, replacement: 18 }],
    });
  });

  it("uses every settled damage die and applies the modifier", async () => {
    const result = await rollDiceFullscreen(
      { label: "Greatsword damage", diceCount: 2, diceSize: 6, modifier: 4 },
      physicalThrows([3, 6]),
    );

    expect(result).toMatchObject({ dice: [3, 6], modifier: 4, total: 13 });
  });

  it("includes physically rolled bonus dice in a d20 result", async () => {
    const throwDice = physicalThrows([13], [3]);
    const result = await rollD20Fullscreen(
      {
        label: "Blessed attack",
        modifier: 5,
        mode: "normal",
        bonusDice: [{ diceCount: 1, diceSize: 4, source: "Blessed" }],
      },
      throwDice,
    );

    expect(throwDice).toHaveBeenNthCalledWith(1, 20, 1);
    expect(throwDice).toHaveBeenNthCalledWith(2, 4, 1);
    expect(result).toMatchObject({
      kept: 13,
      bonusDiceRolls: [{ source: "Blessed", dice: [3] }],
      total: 21,
    });
  });
});
