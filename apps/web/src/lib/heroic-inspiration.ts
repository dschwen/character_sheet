import { heroicInspirationGrantSchema } from "@dnd/content-schema";
import type { ActionSummary, ActionUseRequest } from "@dnd/rules-api";

export function heroicInspirationGrant(action: ActionSummary) {
  const result = heroicInspirationGrantSchema.safeParse(action.parameters?.grantsHeroicInspiration);
  return result.success ? result.data : undefined;
}

export function heroicInspirationTrigger(
  action: ActionSummary,
  inCombat: boolean,
  startingTurn: boolean,
): ActionUseRequest["turnStart"] {
  if (heroicInspirationGrant(action) === undefined) return undefined;
  if (!inCombat || !startingTurn)
    throw new Error("Confirm you are starting your turn during combat.");
  return { inCombat, startingTurn };
}
