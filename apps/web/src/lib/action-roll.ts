import type { ActionSummary, CharacterEvaluation } from "@dnd/rules-api";

import {
  rollDice,
  type DicePoolRollRequest,
  type DicePoolRollResult,
  type RandomSource,
} from "./dice-roll";

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function actionDiceRequest(
  action: ActionSummary,
  evaluation: CharacterEvaluation,
  actionName: string,
): DicePoolRollRequest | undefined {
  const healing = objectValue(action.parameters?.healing);
  if (typeof healing?.diceCount !== "number" || typeof healing.diceSize !== "number") {
    return undefined;
  }
  const bonusFact = healing.bonusFact;
  const modifier = typeof bonusFact === "string" ? evaluation.facts[bonusFact] : undefined;
  if (typeof bonusFact === "string" && typeof modifier !== "number") {
    throw new TypeError(`${action.id} is missing its ${bonusFact} roll modifier.`);
  }
  return {
    label: `${actionName} · Healing`,
    diceCount: healing.diceCount,
    diceSize: healing.diceSize,
    modifier: typeof modifier === "number" ? modifier : 0,
  };
}

export function rollActionDice(
  action: ActionSummary,
  evaluation: CharacterEvaluation,
  actionName: string,
  random: RandomSource = Math.random,
): DicePoolRollResult | undefined {
  const request = actionDiceRequest(action, evaluation, actionName);
  return request === undefined ? undefined : rollDice(request, random);
}
