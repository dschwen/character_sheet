import type { D20BonusDice, RollMode } from "@dnd/rules-api";

export interface D20RollRequest {
  testId?: string;
  label: string;
  modifier: number;
  mode: RollMode;
  criticalThreshold?: number;
  rerollValues?: readonly number[];
  rerollSource?: string;
  bonusDice?: readonly D20BonusDice[];
}

export interface D20RollResult extends D20RollRequest {
  kind: "d20";
  dice: readonly number[];
  kept: number;
  total: number;
  rerolls?: readonly D20Reroll[];
  bonusDiceRolls?: readonly D20BonusDiceRoll[];
  appliedActionIds?: readonly string[];
}

export interface D20BonusDiceRoll extends D20BonusDice {
  dice: readonly number[];
}

export interface D20Reroll {
  dieIndex: number;
  original: number;
  replacement: number;
}

export interface DicePoolRollRequest {
  dieMinimum?: { value: number; sourceName: string; traceId?: string };
  minimumTotal?: number;
  label: string;
  diceCount: number;
  diceSize: number;
  modifier?: number;
}

export interface DicePoolRollResult {
  dieMinimum?: DicePoolRollRequest["dieMinimum"];
  effectiveDice?: readonly number[];
  minimumTotal?: number;
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

function validateDieValue(value: number, dieSize: number): void {
  if (!Number.isInteger(value) || value < 1 || value > dieSize) {
    throw new RangeError(
      `A d${String(dieSize)} result must be a whole number from 1 through ${String(dieSize)}.`,
    );
  }
}

export function resolveD20Roll(
  request: D20RollRequest,
  initialDice: readonly number[],
  replacementDice: readonly number[] = [],
  bonusDiceResults: readonly (readonly number[])[] = [],
): D20RollResult {
  const expectedDice = request.mode === "normal" ? 1 : 2;
  if (initialDice.length !== expectedDice) {
    throw new RangeError(
      `${titleCaseMode(request.mode)} requires ${String(expectedDice)} d20 dice.`,
    );
  }
  initialDice.forEach((value) => {
    validateDieValue(value, 20);
  });
  replacementDice.forEach((value) => {
    validateDieValue(value, 20);
  });
  const rerollValues = new Set(request.rerollValues ?? []);
  if ([...rerollValues].some((value) => !Number.isInteger(value) || value < 1 || value > 20)) {
    throw new RangeError("D20 reroll values must be whole numbers from 1 through 20.");
  }
  const requiredReplacements = initialDice.filter((die) => rerollValues.has(die)).length;
  if (replacementDice.length !== requiredReplacements) {
    throw new RangeError(
      `This d20 roll requires ${String(requiredReplacements)} replacement dice.`,
    );
  }
  let replacementIndex = 0;
  const rerolls: D20Reroll[] = [];
  const dice = initialDice.map((die, dieIndex) => {
    if (!rerollValues.has(die)) return die;
    const replacement = replacementDice[replacementIndex];
    replacementIndex += 1;
    if (replacement === undefined) throw new RangeError("A replacement d20 result is missing.");
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
  const bonusDice = request.bonusDice ?? [];
  if (bonusDiceResults.length !== bonusDice.length) {
    throw new RangeError(`This d20 roll requires ${String(bonusDice.length)} bonus dice pools.`);
  }
  const bonusDiceRolls = bonusDice.map((bonus, index) => {
    const dice = bonusDiceResults[index];
    if (dice?.length !== bonus.diceCount) {
      throw new RangeError(
        `${bonus.source} requires ${String(bonus.diceCount)}d${String(bonus.diceSize)}.`,
      );
    }
    dice.forEach((value) => {
      validateDieValue(value, bonus.diceSize);
    });
    return { ...bonus, dice: [...dice] };
  });
  const bonusTotal = bonusDiceRolls
    .flatMap((bonus) => bonus.dice)
    .reduce((sum, die) => sum + die, 0);

  return {
    ...request,
    kind: "d20",
    dice,
    kept,
    total: kept + request.modifier + bonusTotal,
    ...(rerolls.length === 0 ? {} : { rerolls }),
    ...(bonusDiceRolls.length === 0 ? {} : { bonusDiceRolls }),
  };
}

function titleCaseMode(mode: RollMode): string {
  if (mode === "normal") return "A normal roll";
  return mode === "advantage" ? "Advantage" : "Disadvantage";
}

export function resolveDicePoolRoll(
  request: DicePoolRollRequest,
  dice: readonly number[],
): DicePoolRollResult {
  if (!Number.isInteger(request.diceCount) || request.diceCount < 1) {
    throw new RangeError("A dice pool must contain at least one die.");
  }
  if (!Number.isInteger(request.diceSize) || request.diceSize < 2) {
    throw new RangeError("A die must have at least two sides.");
  }
  if (dice.length !== request.diceCount) {
    throw new RangeError(`This dice pool requires ${String(request.diceCount)} results.`);
  }
  dice.forEach((value) => {
    validateDieValue(value, request.diceSize);
  });
  const modifier = request.modifier ?? 0;
  if (!Number.isFinite(modifier)) throw new RangeError("A dice modifier must be finite.");
  if (
    request.dieMinimum !== undefined &&
    (!Number.isInteger(request.dieMinimum.value) ||
      request.dieMinimum.value < 1 ||
      request.dieMinimum.value > request.diceSize)
  )
    throw new RangeError("A die minimum must be a whole number within the die's range.");
  if (request.minimumTotal !== undefined && !Number.isFinite(request.minimumTotal))
    throw new RangeError("A dice total minimum must be finite.");
  const effectiveDice = dice.map((value) => Math.max(value, request.dieMinimum?.value ?? 1));
  const subtotal = effectiveDice.reduce((total, die) => total + die, modifier);
  return {
    kind: "dice-pool",
    label: request.label,
    diceCount: request.diceCount,
    diceSize: request.diceSize,
    modifier,
    dice: [...dice],
    ...(request.dieMinimum === undefined ? {} : { dieMinimum: request.dieMinimum, effectiveDice }),
    ...(request.minimumTotal === undefined ? {} : { minimumTotal: request.minimumTotal }),
    total: request.minimumTotal === undefined ? subtotal : Math.max(request.minimumTotal, subtotal),
  };
}

export function dicePoolRollExpression(result: DicePoolRollResult): string {
  const subtotal = (result.effectiveDice ?? result.dice).reduce((total, die) => total + die, 0);
  const expression = `${String(subtotal)} ${result.modifier >= 0 ? "+" : "−"} ${String(Math.abs(result.modifier))}`;
  return result.minimumTotal !== undefined && subtotal + result.modifier < result.minimumTotal
    ? `max(${String(result.minimumTotal)}, ${expression}) = ${String(result.total)}`
    : `${expression} = ${String(result.total)}`;
}

export function dicePoolRollDetail(result: DicePoolRollResult): string {
  const physical = `${String(result.diceCount)}d${String(result.diceSize)} rolled: ${result.dice.map(String).join(", ")}`;
  if (result.effectiveDice === undefined || result.dieMinimum === undefined) return physical;
  const adjustments = result.dice.flatMap((original, index) =>
    result.effectiveDice?.[index] === original
      ? []
      : [`${String(original)} → ${String(result.effectiveDice?.[index])}`],
  );
  return adjustments.length === 0
    ? physical
    : `${physical} · ${result.dieMinimum.sourceName}: ${adjustments.join(", ")} (treated, not rerolled)`;
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
  const replacementDice = initialDice
    .filter((die) => rerollValues.has(die))
    .map(() => rollDie(20, random));
  const bonusDiceResults = (request.bonusDice ?? []).map((bonus) =>
    Array.from({ length: bonus.diceCount }, () => rollDie(bonus.diceSize, random)),
  );
  return resolveD20Roll(request, initialDice, replacementDice, bonusDiceResults);
}

export function rollDice(
  request: DicePoolRollRequest,
  random: RandomSource = Math.random,
): DicePoolRollResult {
  const dice = Array.from({ length: request.diceCount }, () => rollDie(request.diceSize, random));
  return resolveDicePoolRoll(request, dice);
}
