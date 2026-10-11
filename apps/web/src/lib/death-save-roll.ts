import type { CharacterState } from "@dnd/character-model";
import type { CharacterEvaluation, DeathSavingThrowRequest } from "@dnd/rules-api";
import { deathSaveStatus } from "@dnd/rules-core";
import { d20RerollRequest, type D20RollRequest, type DiceRollResult } from "./dice-roll";

export function deathSaveRollRequest(evaluation: CharacterEvaluation): D20RollRequest {
  const test = evaluation.d20Tests["savingThrow.death"];
  if (test === undefined) throw new TypeError("Death Saving Throw test is unavailable.");
  return {
    testId: test.id,
    label: "Death Saving Throw",
    modifier: test.modifier,
    mode: test.rollMode,
    ...d20RerollRequest(test),
  };
}
export function canResolveDeathSave(
  state: CharacterState,
  roll: DiceRollResult | undefined,
): boolean {
  return (
    state.currentHitPoints === 0 &&
    deathSaveStatus(state) === "dying" &&
    roll?.kind === "d20" &&
    roll.testId === "savingThrow.death" &&
    !roll.appliedActionIds?.includes("death-save.resolve")
  );
}
export function deathSaveResolutionRequest(
  state: CharacterState,
  roll: DiceRollResult | undefined,
  startOfTurnConfirmed: boolean,
): DeathSavingThrowRequest {
  if (!startOfTurnConfirmed || !canResolveDeathSave(state, roll) || roll?.kind !== "d20")
    throw new TypeError("Confirm your start of turn and choose an unresolved Death Saving Throw.");
  return { kind: "roll", naturalRoll: roll.kept, total: roll.total, startOfTurnConfirmed };
}
