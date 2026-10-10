import { savingThrowRerollSchema } from "@dnd/content-schema";
import type { ActionSummary, CharacterEvaluation } from "@dnd/rules-api";
import { d20RerollRequest, type D20RollRequest, type DiceRollResult } from "./dice-roll";

export function savingThrowRerollDefinition(action: ActionSummary) {
  const parsed = savingThrowRerollSchema.safeParse(action.parameters?.savingThrowReroll);
  return parsed.success ? parsed.data : undefined;
}

export function savingThrowRerollRequest(
  action: ActionSummary,
  evaluation: CharacterEvaluation,
  previous: DiceRollResult | undefined,
  additionalDisadvantage = false,
): D20RollRequest {
  if (
    !savingThrowRerollDefinition(action) ||
    previous?.kind !== "d20" ||
    !previous.testId?.startsWith("savingThrow.") ||
    previous.appliedActionIds?.includes(action.id)
  )
    throw new TypeError("Choose a completed saving throw that has not used this reroll feature.");
  const test = evaluation.d20Tests[previous.testId];
  if (!test) throw new TypeError("The completed saving throw is not on this sheet.");
  return {
    testId: previous.testId,
    label: `${previous.label} · ${action.id.split(".").at(-1) ?? "Reaction"} reroll`,
    modifier: previous.modifier,
    mode:
      additionalDisadvantage ||
      test.disadvantageSources.length > 0 ||
      previous.mode === "disadvantage"
        ? "normal"
        : "advantage",
    ...d20RerollRequest(test, [...(previous.bonusDice ?? [])]),
  };
}
