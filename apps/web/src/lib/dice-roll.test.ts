import { describe, expect, it } from "vitest";

import { rollD20, rollDice, type RandomSource } from "./dice-roll";

function sequence(...values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("d20 rolls", () => {
  it("adds a modifier to a normal roll", () => {
    expect(
      rollD20({ label: "Strength check", modifier: 3, mode: "normal" }, sequence(0.45)),
    ).toEqual({
      kind: "d20",
      label: "Strength check",
      modifier: 3,
      mode: "normal",
      dice: [10],
      kept: 10,
      total: 13,
    });
  });

  it("keeps the higher d20 with advantage", () => {
    expect(
      rollD20({ label: "Perception", modifier: 5, mode: "advantage" }, sequence(0.2, 0.9)),
    ).toMatchObject({ dice: [5, 19], kept: 19, total: 24 });
  });

  it("keeps the lower d20 with disadvantage", () => {
    expect(
      rollD20({ label: "Stealth", modifier: -1, mode: "disadvantage" }, sequence(0.7, 0.1)),
    ).toMatchObject({ dice: [15, 3], kept: 3, total: 2 });
  });

  it("rerolls configured d20 values once and exposes feedback", () => {
    expect(
      rollD20(
        {
          label: "Halfling Dexterity check",
          modifier: 3,
          mode: "normal",
          rerollValues: [1],
          rerollSource: "Luck",
        },
        sequence(0, 0.65),
      ),
    ).toEqual({
      kind: "d20",
      label: "Halfling Dexterity check",
      modifier: 3,
      mode: "normal",
      rerollValues: [1],
      rerollSource: "Luck",
      dice: [14],
      kept: 14,
      total: 17,
      rerolls: [{ dieIndex: 0, original: 1, replacement: 14 }],
    });
  });

  it("does not recursively reroll a qualifying replacement", () => {
    expect(
      rollD20(
        { label: "Halfling save", modifier: 0, mode: "normal", rerollValues: [1] },
        sequence(0, 0),
      ),
    ).toMatchObject({
      dice: [1],
      kept: 1,
      rerolls: [{ dieIndex: 0, original: 1, replacement: 1 }],
    });
  });

  it("rejects random values outside the supported range", () => {
    expect(() =>
      rollD20({ label: "Initiative", modifier: 0, mode: "normal" }, sequence(1)),
    ).toThrow(RangeError);
  });

  it("rolls arbitrary damage dice and adds a modifier once", () => {
    expect(
      rollDice(
        { label: "Greatsword damage", diceCount: 2, diceSize: 6, modifier: 3 },
        sequence(0, 0.99),
      ),
    ).toEqual({
      kind: "dice-pool",
      label: "Greatsword damage",
      diceCount: 2,
      diceSize: 6,
      modifier: 3,
      dice: [1, 6],
      total: 10,
    });
  });
});
