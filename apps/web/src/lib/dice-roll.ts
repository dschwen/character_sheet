import type { RollMode } from "@dnd/rules-api";

export interface D20RollRequest {
  label: string;
  modifier: number;
  mode: RollMode;
}

export interface D20RollResult extends D20RollRequest {
  dice: readonly number[];
  kept: number;
  total: number;
}

export type RandomSource = () => number;

function rollDie(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(
      "A dice random source must return a number from 0 (inclusive) to 1 (exclusive).",
    );
  }
  return Math.floor(value * 20) + 1;
}

export function rollD20(
  request: D20RollRequest,
  random: RandomSource = Math.random,
): D20RollResult {
  const dice =
    request.mode === "normal" ? ([rollDie(random)] as const) : [rollDie(random), rollDie(random)];
  const kept =
    request.mode === "advantage"
      ? Math.max(...dice)
      : request.mode === "disadvantage"
        ? Math.min(...dice)
        : dice[0];

  return {
    ...request,
    dice,
    kept,
    total: kept + request.modifier,
  };
}
