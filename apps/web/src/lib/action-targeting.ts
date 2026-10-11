import { resolvedActionTargetingSchema } from "@dnd/content-schema";
import type { ActionSummary, ActionUseRequest } from "@dnd/rules-api";

export function actionTargeting(action: ActionSummary) {
  const parsed = resolvedActionTargetingSchema.safeParse(action.parameters?.targeting);
  return parsed.success ? parsed.data : undefined;
}

export function actionTargetingRequest(
  action: ActionSummary,
  count: string,
  eligibilityConfirmed: boolean,
): ActionUseRequest["targeting"] {
  const targeting = actionTargeting(action);
  if (targeting === undefined) return undefined;
  const parsed = Number(count);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > targeting.maximum)
    throw new Error(`Choose between 1 and ${String(targeting.maximum)} targets.`);
  if (!eligibilityConfirmed)
    throw new Error("Confirm the targets meet the displayed range and sight requirements.");
  return { count: parsed, eligibilityConfirmed };
}

export function actionInstructions(action: ActionSummary): string[] {
  const instructions = action.parameters?.assistedInstructions;
  return Array.isArray(instructions)
    ? instructions.filter((instruction): instruction is string => typeof instruction === "string")
    : [];
}
