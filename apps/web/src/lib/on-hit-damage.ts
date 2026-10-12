import { z } from "zod";
import { onHitExtraDamageSchema } from "@dnd/content-schema";
import type { ActionSummary, AttackSummary } from "@dnd/rules-api";
import type { DicePoolRollRequest } from "./dice-roll";

const resolvedDamageSchema = onHitExtraDamageSchema.extend({
  diceCount: z.number().int().positive(),
});

export function onHitDamageDefinition(action: ActionSummary) {
  const result = resolvedDamageSchema.safeParse(action.parameters?.extraDamage);
  return result.success ? result.data : undefined;
}

export function onHitDamageOptions(action: ActionSummary, actions: readonly ActionSummary[]) {
  const economy = onHitDamageDefinition(action)?.optionActionEconomy;
  return economy === undefined
    ? []
    : actions.filter(
        (option) =>
          option.actionEconomy === economy &&
          typeof option.parameters?.sneakAttackDiceCost === "number",
      );
}

export function eligibleDamageWeapon(action: ActionSummary, attack: AttackSummary): boolean {
  const definition = onHitDamageDefinition(action);
  if (definition === undefined || attack.properties.includes("unarmed-strike")) return false;
  const eligibility = definition.weaponEligibility;
  return (
    eligibility === undefined ||
    eligibility.anyAttackTypes.includes(attack.attackType) ||
    eligibility.anyProperties.some((property) => attack.properties.includes(property))
  );
}

export function onHitRequirements(action: ActionSummary): string[] {
  const result = z.array(z.string()).safeParse(action.parameters?.requirements);
  return result.success ? result.data : [];
}

export function onHitSave(action: ActionSummary) {
  const result = z
    .object({ ability: z.string(), difficultyClass: z.number() })
    .safeParse(action.parameters?.savingThrow);
  return result.success ? result.data : undefined;
}

export interface OnHitDamageContext {
  attackId: string;
  optionIds: string[];
  hitCreature: boolean;
  unusedThisTurn: boolean;
  critical: boolean;
  confirmedRequirements: string[];
}

/** Rolls only the extra damage; no HP, status, or encounter state is inferred. */
export function onHitDamageRollRequest(
  action: ActionSummary,
  actions: readonly ActionSummary[],
  attacks: readonly AttackSummary[],
  context: OnHitDamageContext,
  name: string,
): { request: DicePoolRollRequest; options: ActionSummary[] } {
  const definition = onHitDamageDefinition(action);
  if (definition === undefined || !action.available)
    throw new Error("This extra-damage action is not available.");
  const attack = attacks.find(({ id }) => id === context.attackId);
  if (attack === undefined || !eligibleDamageWeapon(action, attack))
    throw new Error("Choose an eligible equipped weapon.");
  if (!context.hitCreature || !context.unusedThisTurn)
    throw new Error("Confirm a creature was hit and this damage has not been used this turn.");
  if (
    context.optionIds.length > definition.maximumOptions ||
    new Set(context.optionIds).size !== context.optionIds.length
  )
    throw new Error(`Select at most ${String(definition.maximumOptions)} distinct effect(s).`);
  const availableOptions = onHitDamageOptions(action, actions);
  const options = context.optionIds.map((id) => {
    const option = availableOptions.find((candidate) => candidate.id === id);
    if (option?.available !== true) throw new Error("That extra-damage option is not available.");
    return option;
  });
  for (const requirement of [action, ...options].flatMap(onHitRequirements)) {
    if (!context.confirmedRequirements.includes(requirement))
      throw new Error(`Confirm eligibility: ${requirement}.`);
  }
  const cost = options.reduce((sum, option) => {
    const value = option.parameters?.sneakAttackDiceCost;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
      throw new Error("Invalid effect die cost.");
    return sum + value;
  }, 0);
  const remaining = definition.diceCount - cost;
  if (remaining < 1) throw new Error("The effect costs too many damage dice.");
  const damageType =
    definition.type === "weapon-damage-type" ? attack.damage.type : definition.type;
  return {
    request: {
      label: `${name}${context.critical ? " critical" : ""} · ${damageType}${cost === 0 ? "" : ` · ${String(cost)}d${String(definition.diceSize)} forgone`}`,
      diceCount: remaining * (context.critical ? 2 : 1),
      diceSize: definition.diceSize,
      modifier: 0,
      minimumTotal: 0,
    },
    options,
  };
}
