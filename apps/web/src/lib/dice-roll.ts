import type { RollMode } from "@dnd/rules-api";

export interface D20RollRequest {
  label: string;
  modifier: number;
  mode: RollMode;
  criticalThreshold?: number;
}

export interface D20RollResult extends D20RollRequest {
  kind: "d20";
  dice: readonly number[];
  kept: number;
  total: number;
}

export interface DicePoolRollRequest {
  label: string;
  diceCount: number;
  diceSize: number;
  modifier?: number;
}

export interface DicePoolRollResult {
  kind: "dice-pool";
  label: string;
  diceCount: number;
  diceSize: number;
  modifier: number;
  dice: readonly number[];
  total: number;
}

export type DiceRollResult = D20RollResult | DicePoolRollResult;

export type RandomSource = () => number;

function rollDie(dieSize: number, random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(
      "A dice random source must return a number from 0 (inclusive) to 1 (exclusive).",
    );
  }
  return Math.floor(value * dieSize) + 1;
}

export function rollD20(
  request: D20RollRequest,
  random: RandomSource = Math.random,
): D20RollResult {
  const dice =
    request.mode === "normal"
      ? ([rollDie(20, random)] as const)
      : [rollDie(20, random), rollDie(20, random)];
  const kept =
    request.mode === "advantage"
      ? Math.max(...dice)
      : request.mode === "disadvantage"
        ? Math.min(...dice)
        : dice[0];

  return {
    ...request,
    kind: "d20",
    dice,
    kept,
    total: kept + request.modifier,
  };
}

export function rollDice(
  request: DicePoolRollRequest,
  random: RandomSource = Math.random,
): DicePoolRollResult {
  if (!Number.isInteger(request.diceCount) || request.diceCount < 1) {
    throw new RangeError("A dice pool must contain at least one die.");
  }
  if (!Number.isInteger(request.diceSize) || request.diceSize < 2) {
    throw new RangeError("A die must have at least two sides.");
  }
  const dice = Array.from({ length: request.diceCount }, () => rollDie(request.diceSize, random));
  const modifier = request.modifier ?? 0;
  return {
    kind: "dice-pool",
    label: request.label,
    diceCount: request.diceCount,
    diceSize: request.diceSize,
    modifier,
    dice,
    total: dice.reduce((total, die) => total + die, modifier),
  };
}
