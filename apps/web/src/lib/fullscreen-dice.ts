import type { DiceRoller, DieSpec, DieType, ThrowOptions } from "@dnd/webgl-dice";
import { resolveDicePoolChoices, validatePoolChoiceCount } from "./dice-pool-choice";

import {
  resolveD20Roll,
  resolveDicePoolRoll,
  type D20RollRequest,
  type D20RollResult,
  type DicePoolRollRequest,
  type DicePoolRollResult,
} from "./dice-roll";

export type PhysicalDiceThrow = (diceSize: number, diceCount: number) => Promise<readonly number[]>;

const supportedDiceSizes = new Set([4, 6, 8, 10, 12, 20]);
const origins = ["bottom-left", "bottom-right", "left", "right"] as const;
let rollerPromise: Promise<DiceRoller> | undefined;
let rollQueue: Promise<void> = Promise.resolve();
let clearTimer: ReturnType<typeof setTimeout> | undefined;
let throwIndex = 0;

function dieType(diceSize: number): DieType {
  if (!supportedDiceSizes.has(diceSize)) {
    throw new RangeError(`The fullscreen roller does not support d${String(diceSize)} dice.`);
  }
  return `d${String(diceSize)}` as DieType;
}

async function fullscreenRoller(): Promise<DiceRoller> {
  if (typeof window === "undefined") {
    throw new Error("The fullscreen dice roller is only available in a browser.");
  }
  rollerPromise ??= import("@dnd/webgl-dice").then(
    ({ DiceRoller: WebGlDiceRoller }) =>
      new WebGlDiceRoller({
        fullscreen: true,
        transparent: true,
        pointerEvents: false,
        zIndex: 9999,
        viewportWorldHeight: 12,
      }),
  );
  return rollerPromise;
}

function dieSpecs(diceSize: number, diceCount: number): DieSpec[] {
  if (!Number.isInteger(diceCount) || diceCount < 1) {
    throw new RangeError("A physical roll requires at least one die.");
  }
  const type = dieType(diceSize);
  const radius = diceCount > 6 ? 0.55 : diceCount > 3 ? 0.68 : type === "d20" ? 0.82 : 0.88;
  return Array.from({ length: diceCount }, () => ({
    type,
    radius,
    color: 0x214f42,
    labelColor: "#fffefa",
    emboss: "recessed",
    embossStrength: 0.22,
  }));
}

async function throwPhysicalDice(diceSize: number, diceCount: number): Promise<readonly number[]> {
  const results = await throwPhysicalDiceGroups([{ diceSize, diceCount }]);
  return results[0] ?? [];
}

async function throwPhysicalDiceGroups(
  groups: readonly { diceSize: number; diceCount: number }[],
): Promise<readonly (readonly number[])[]> {
  const roller = await fullscreenRoller();
  if (clearTimer !== undefined) clearTimeout(clearTimer);
  roller.clear();
  const from = origins[throwIndex % origins.length] ?? "bottom-left";
  throwIndex += 1;
  const toward: ThrowOptions["toward"] = from.includes("left") ? "top-right" : "top-left";
  const groupSpecs = groups.map(({ diceSize, diceCount }) => dieSpecs(diceSize, diceCount));
  const labels = await roller.throwAndWait(groupSpecs.flat(), {
    from,
    toward,
    velocity: 10,
    lift: 5,
    spin: 22,
    spread: 0.75,
    timeout: 7000,
  });
  const values = labels.map((label) => {
    const value = Number(label);
    if (!Number.isInteger(value)) throw new Error(`The physical die returned ${label}.`);
    return value;
  });
  let offset = 0;
  return groupSpecs.map((specs) => {
    const result = values.slice(offset, offset + specs.length);
    offset += specs.length;
    return result;
  });
}

function scheduleClear(): void {
  clearTimer = setTimeout(() => {
    void fullscreenRoller().then(
      (roller) => {
        roller.clear();
      },
      () => {
        // Initialization failed; there is no fullscreen canvas to clear.
      },
    );
  }, 1800);
}

function enqueueRoll<T>(roll: () => Promise<T>): Promise<T> {
  const result = rollQueue.then(roll, roll);
  rollQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result.finally(scheduleClear);
}

async function resolvePhysicalD20(
  request: D20RollRequest,
  throwDice: PhysicalDiceThrow,
): Promise<D20RollResult> {
  const diceCount = request.mode === "normal" ? 1 : 2;
  const initialDice = await throwDice(20, diceCount);
  const rerollValues = new Set(request.rerollValues ?? []);
  const replacementCount = initialDice.filter((value) => rerollValues.has(value)).length;
  const replacements = replacementCount === 0 ? [] : await throwDice(20, replacementCount);
  const bonusDiceResults = [];
  for (const bonus of request.bonusDice ?? []) {
    bonusDiceResults.push(await throwDice(bonus.diceSize, bonus.diceCount));
  }
  return resolveD20Roll(request, initialDice, replacements, bonusDiceResults);
}

async function resolveFullscreenD20(request: D20RollRequest): Promise<D20RollResult> {
  const groups = [
    { diceSize: 20, diceCount: request.mode === "normal" ? 1 : 2 },
    ...(request.bonusDice ?? []).map(({ diceSize, diceCount }) => ({ diceSize, diceCount })),
  ];
  const [initialDice = [], ...bonusDiceResults] = await throwPhysicalDiceGroups(groups);
  const rerollValues = new Set(request.rerollValues ?? []);
  const replacementCount = initialDice.filter((value) => rerollValues.has(value)).length;
  const replacements = replacementCount === 0 ? [] : await throwPhysicalDice(20, replacementCount);
  return resolveD20Roll(request, initialDice, replacements, bonusDiceResults);
}

export function rollD20Fullscreen(
  request: D20RollRequest,
  throwDice?: PhysicalDiceThrow,
): Promise<D20RollResult> {
  return throwDice === undefined
    ? enqueueRoll(() => resolveFullscreenD20(request))
    : resolvePhysicalD20(request, throwDice);
}

async function resolvePhysicalDicePool(
  request: DicePoolRollRequest,
  throwDice: PhysicalDiceThrow,
): Promise<DicePoolRollResult> {
  return resolveDicePoolRoll(request, await throwDice(request.diceSize, request.diceCount));
}

export function rollDiceFullscreen(
  request: DicePoolRollRequest,
  throwDice?: PhysicalDiceThrow,
): Promise<DicePoolRollResult> {
  return throwDice === undefined
    ? enqueueRoll(() => resolvePhysicalDicePool(request, throwPhysicalDice))
    : resolvePhysicalDicePool(request, throwDice);
}

export function rollDiceChoicesFullscreen(
  request: DicePoolRollRequest,
  count: number,
  throwDice?: PhysicalDiceThrow,
): Promise<DicePoolRollResult[]> {
  validatePoolChoiceCount(count);
  const roll = async () =>
    resolveDicePoolChoices(
      request,
      count,
      await (throwDice ?? throwPhysicalDice)(request.diceSize, request.diceCount * count),
    );
  return throwDice === undefined ? enqueueRoll(roll) : roll();
}
