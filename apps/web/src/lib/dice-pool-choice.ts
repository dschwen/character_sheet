import type { DicePoolRollRequest, DicePoolRollResult, RandomSource } from "./dice-roll";
import { resolveDicePoolRoll, rollDice } from "./dice-roll";

export function validatePoolChoiceCount(count: number): void {
  if (!Number.isInteger(count) || count < 2 || count > 4)
    throw new RangeError("A damage choice requires two through four complete dice pools.");
}

/** Preserve each complete pool; neither sum pools nor choose individual dice. */
export function resolveDicePoolChoices(
  request: DicePoolRollRequest,
  count: number,
  dice: readonly number[],
): DicePoolRollResult[] {
  validatePoolChoiceCount(count);
  if (dice.length !== request.diceCount * count)
    throw new RangeError("The damage choice is missing complete dice pools.");
  return Array.from({ length: count }, (_, index) =>
    resolveDicePoolRoll(
      request,
      dice.slice(index * request.diceCount, (index + 1) * request.diceCount),
    ),
  );
}

export function rollDicePoolChoices(
  request: DicePoolRollRequest,
  count: number,
  random: RandomSource = Math.random,
): DicePoolRollResult[] {
  validatePoolChoiceCount(count);
  return Array.from({ length: count }, () => rollDice(request, random));
}

export function chooseDicePoolResult(
  candidates: readonly DicePoolRollResult[],
  index: number,
): DicePoolRollResult {
  validatePoolChoiceCount(candidates.length);
  const selected = candidates[index];
  if (!Number.isInteger(index) || selected === undefined)
    throw new RangeError("Choose one of the complete damage pools.");
  return {
    ...selected,
    label: `${selected.label} · chose pool ${String(index + 1)} of ${String(candidates.length)}`,
  };
}
