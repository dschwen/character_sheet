import { failedSaveRerollSchema } from "@dnd/content-schema";
import type { ActionSummary, CharacterEvaluation } from "@dnd/rules-api";
import { d20RerollRequest, type D20RollRequest, type DiceRollResult } from "./dice-roll";

export function failedSaveRerollDefinition(action: ActionSummary) {
  const parsed = failedSaveRerollSchema.safeParse(action.parameters?.failedSaveReroll);
  return parsed.success ? parsed.data : undefined;
}

export function failedSaveRerollRequest(
  action: ActionSummary,
  evaluation: CharacterEvaluation,
  previous: DiceRollResult | undefined,
): D20RollRequest {
  const definition = failedSaveRerollDefinition(action);
  if (
    definition === undefined ||
    previous?.kind !== "d20" ||
    !previous.testId?.startsWith("savingThrow.") ||
    previous.appliedActionIds?.includes(action.id)
  )
    throw new TypeError("Choose a completed saving throw that has not used this feature.");
  const test = evaluation.d20Tests[previous.testId];
  const bonus = evaluation.facts[definition.bonusFact];
  if (test === undefined || typeof bonus !== "number" || !Number.isFinite(bonus))
    throw new TypeError("The saving throw or reroll bonus is unavailable.");
  return {
    testId: test.id,
    label: `${previous.label} · ${action.id.split(".").at(-1) ?? "Feature"} (+${String(bonus)})`,
    modifier: previous.modifier + bonus,
    mode: previous.mode,
    ...d20RerollRequest(test, [...(previous.bonusDice ?? [])]),
  };
}
