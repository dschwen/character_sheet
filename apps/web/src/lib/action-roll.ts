import type { ActionSummary, CharacterEvaluation } from "@dnd/rules-api";

import {
  rollDice,
  type DicePoolRollRequest,
  type DicePoolRollResult,
  type RandomSource,
  type DiceRollResult,
  type D20RollResult,
  resolveDicePoolRoll,
} from "./dice-roll";

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function actionMovementMessage(action: ActionSummary): string | undefined {
  const movement = objectValue(action.parameters?.movement);
  if (typeof movement?.maximumFeet !== "number") return undefined;
  return `You may move up to ${String(movement.maximumFeet)} ft. as part of this action. ${movement.provokesOpportunityAttacks === false ? "This movement does not provoke Opportunity Attacks." : "Normal Opportunity Attack rules apply."} Resolve movement manually.`;
}

export function actionDiceRequest(
  action: ActionSummary,
  evaluation: CharacterEvaluation,
  actionName: string,
): DicePoolRollRequest | undefined {
  const healing = objectValue(action.parameters?.healing);
  const bonus = objectValue(action.parameters?.checkBonus);
  if (
    bonus?.afterRoll === true &&
    typeof bonus.diceCount === "number" &&
    typeof bonus.diceSize === "number"
  ) {
    return {
      label: `${actionName} · ${bonus.mode === "subtract" ? "Subtract" : "Add"} to roll`,
      diceCount: bonus.diceCount,
      diceSize: bonus.diceSize,
      modifier: 0,
    };
  }
  if (typeof healing?.diceCount !== "number" || typeof healing.diceSize !== "number") {
    return undefined;
  }
  const bonusFact = healing.bonusFact;
  const modifier = typeof bonusFact === "string" ? evaluation.facts[bonusFact] : undefined;
  if (typeof bonusFact === "string" && typeof modifier !== "number") {
    throw new TypeError(`${action.id} is missing its ${bonusFact} roll modifier.`);
  }
  return {
    label: `${actionName} · Healing${typeof healing.minimum === "number" ? ` (minimum ${String(healing.minimum)} HP)` : ""}`,
    diceCount: healing.diceCount,
    diceSize: healing.diceSize,
    modifier: typeof modifier === "number" ? modifier : 0,
  };
}

export function requiresCompletedD20Test(action: ActionSummary): boolean {
  return objectValue(action.parameters?.checkBonus)?.afterRoll === true;
}

export function canApplyPostRollBonus(
  action: ActionSummary,
  roll: DiceRollResult | undefined,
): roll is D20RollResult {
  if (
    !requiresCompletedD20Test(action) ||
    roll?.kind !== "d20" ||
    roll.testId === undefined ||
    (roll.appliedActionIds ?? []).includes(action.id)
  )
    return false;
  const kind = roll.testId.startsWith("savingThrow.")
    ? "saving-throw"
    : roll.testId === "initiative" ||
        roll.testId.startsWith("abilityCheck.") ||
        roll.testId.startsWith("skill.") ||
        roll.testId.startsWith("tool.")
      ? "ability-check"
      : undefined;
  const appliesTo = objectValue(action.parameters?.checkBonus)?.appliesTo;
  return (
    objectValue(action.parameters?.checkBonus)?.mode === "add" &&
    kind !== undefined &&
    Array.isArray(appliesTo) &&
    appliesTo.includes(kind)
  );
}

export function applyPostRollBonus(
  action: ActionSummary,
  roll: DiceRollResult,
  dice: readonly number[],
  source: string,
): D20RollResult {
  if (!canApplyPostRollBonus(action, roll))
    throw new TypeError("This bonus cannot be applied to this roll.");
  const bonus = objectValue(action.parameters?.checkBonus);
  if (
    typeof bonus?.diceCount !== "number" ||
    typeof bonus.diceSize !== "number" ||
    bonus.mode !== "add"
  )
    throw new TypeError("Unsupported post-roll bonus.");
  const result = resolveDicePoolRoll(
    { label: source, diceCount: bonus.diceCount, diceSize: bonus.diceSize },
    dice,
  );
  return {
    ...roll,
    total: roll.total + result.total,
    appliedActionIds: [...(roll.appliedActionIds ?? []), action.id],
    bonusDiceRolls: [
      ...(roll.bonusDiceRolls ?? []),
      {
        diceCount: result.diceCount,
        diceSize: result.diceSize,
        dice: [...dice],
        source,
      },
    ],
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
