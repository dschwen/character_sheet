import type { RollMode } from "@dnd/rules-api";

export interface D20RollRequest {
  label: string;
  modifier: number;
  mode: RollMode;
  criticalThreshold?: number;
  rerollValues?: readonly number[];
  rerollSource?: string;
}

export interface D20RollResult extends D20RollRequest {
  kind: "d20";
  dice: readonly number[];
  kept: number;
  total: number;
  rerolls?: readonly D20Reroll[];
}

export interface D20Reroll {
  dieIndex: number;
  original: number;
  replacement: number;
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
  const initialDice =
    request.mode === "normal"
      ? ([rollDie(20, random)] as const)
      : [rollDie(20, random), rollDie(20, random)];
  const rerollValues = new Set(request.rerollValues ?? []);
  if ([...rerollValues].some((value) => !Number.isInteger(value) || value < 1 || value > 20)) {
    throw new RangeError("D20 reroll values must be whole numbers from 1 through 20.");
  }
  const rerolls: D20Reroll[] = [];
  const dice = initialDice.map((die, dieIndex) => {
    if (!rerollValues.has(die)) return die;
    const replacement = rollDie(20, random);
    rerolls.push({ dieIndex, original: die, replacement });
    return replacement;
  });
  const firstDie = dice[0];
  if (firstDie === undefined) throw new RangeError("A D20 roll must contain at least one die.");
  const kept =
    request.mode === "advantage"
      ? Math.max(...dice)
      : request.mode === "disadvantage"
        ? Math.min(...dice)
        : firstDie;

  return {
    ...request,
    kind: "d20",
    dice,
    kept,
    total: kept + request.modifier,
    ...(rerolls.length === 0 ? {} : { rerolls }),
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
