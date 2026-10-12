import { z } from "zod";
import { reactionAttackSchema } from "@dnd/content-schema";
import type { CalculationTrace } from "@dnd/calculation-trace";
import type { ActionSummary, AttackSummary, CharacterEvaluation } from "@dnd/rules-api";

const requestSchema = z
  .object({
    attackId: z.string().min(1),
    damageTaken: z.number().int().nonnegative(),
    sourceIsCreature: z.boolean(),
    distanceFeet: z.number().finite().nonnegative(),
    reactionAvailable: z.boolean(),
  })
  .strict();
export type ReactionAttackDeclaration = z.infer<typeof requestSchema>;
export interface ReactionAttackResolution {
  actionId: string;
  attackId: string;
  attackCount: 1;
  trace: CalculationTrace;
  guidance: string[];
}

export function reactionAttackDefinition(action: ActionSummary) {
  const result = reactionAttackSchema.safeParse(action.parameters?.reactionAttack);
  return result.success ? result.data : undefined;
}

export function eligibleReactionAttack(action: ActionSummary, attack: AttackSummary): boolean {
  const definition = reactionAttackDefinition(action);
  const kind = attack.properties.includes("unarmed-strike") ? "unarmed" : "weapon";
  return (
    definition !== undefined &&
    definition.attackTypes.includes(attack.attackType) &&
    definition.attackKinds.includes(kind)
  );
}

/** Authorizes one declared attack; the caller tracks Reaction use and target identity manually. */
export function resolveReactionAttack(
  evaluation: CharacterEvaluation,
  actionId: string,
  unparsed: ReactionAttackDeclaration,
): ReactionAttackResolution {
  const request = requestSchema.parse(unparsed);
  const action = evaluation.actions.find(({ id }) => id === actionId);
  const definition = action === undefined ? undefined : reactionAttackDefinition(action);
  if (
    action === undefined ||
    definition === undefined ||
    !action.available ||
    evaluation.facts["actions.disabled"] === true ||
    evaluation.facts["deathSave.dead"] === true
  )
    throw new TypeError("This reaction attack is not available.");
  if (
    !request.reactionAvailable ||
    !request.sourceIsCreature ||
    request.damageTaken <= 0 ||
    request.distanceFeet > definition.rangeFeet
  )
    throw new TypeError(
      `Confirm damage taken from a creature within ${String(definition.rangeFeet)} feet and an available Reaction.`,
    );
  const attack = evaluation.attacks.find(({ id }) => id === request.attackId);
  if (attack === undefined || !eligibleReactionAttack(action, attack))
    throw new TypeError("Choose an eligible equipped attack for this reaction.");
  if (
    action.actionEconomy !== "reaction" ||
    action.parameters?.resourceId !== undefined ||
    action.parameters?.spends !== undefined ||
    action.parameters?.variableSpend !== undefined
  )
    throw new TypeError("This reaction attack does not support additional resource costs.");
  const instructions = z.array(z.string()).safeParse(action.parameters?.assistedInstructions);
  const traceId = `${action.id}.reaction-attack`;
  return {
    actionId,
    attackId: attack.id,
    attackCount: definition.attackCount,
    guidance: instructions.success ? instructions.data : [],
    trace: {
      id: traceId,
      result: attack.id,
      nodes: [
        {
          id: `${traceId}.trigger`,
          operation: "authorize-declared-reaction-attack",
          inputs: [
            request.damageTaken,
            request.sourceIsCreature,
            request.distanceFeet,
            definition.rangeFeet,
            request.reactionAvailable,
            attack.id,
            definition.attackCount,
          ],
          output: attack.id,
          label:
            "One attack against the creature that dealt the triggering damage; Reaction use and target identity are manual.",
        },
      ],
      sourceReferences: [
        ...(evaluation.traces[action.traceId]?.sourceReferences ?? []),
        ...(evaluation.traces[attack.traceId]?.sourceReferences ?? []),
      ],
    },
  };
}
