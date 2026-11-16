import { z } from "zod";
import type { CharacterEvaluation, GrappleBenefitSummary } from "@dnd/rules-api";
import { resolveRollMode } from "./d20.js";

export const creatureSizes = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;
const sizeSchema = z.enum(creatureSizes);
const targetSchema = z.object({
  sourceId: z.string().min(1),
  targetName: z.string().trim().min(1).max(120),
});
const sizesSchema = targetSchema.extend({
  currentSize: sizeSchema,
  targetSize: sizeSchema,
  sizesConfirmed: z.literal(true),
});
function source(evaluation: CharacterEvaluation, sourceId: string): GrappleBenefitSummary {
  if (evaluation.validations.some(({ severity }) => severity === "error"))
    throw new TypeError("Resolve character validation errors before declaring combat benefits.");
  if (evaluation.facts["actions.disabled"] === true || evaluation.facts["deathSave.dead"] === true)
    throw new TypeError("An Incapacitated or dead character cannot declare this benefit.");
  const result = evaluation.grappleBenefits?.find((entry) => entry.sourceId === sourceId);
  if (!result) throw new TypeError("That grapple benefit is not granted to this character.");
  return result;
}

const attackSchema = targetSchema
  .extend({
    targetGrappledByYouConfirmed: z.literal(true),
    attack: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("weapon"), attackId: z.string().min(1) }).strict(),
      z.object({ kind: z.literal("spell"), castingSourceId: z.string().min(1) }).strict(),
    ]),
    additionalAdvantage: z.boolean().default(false),
    additionalDisadvantage: z.boolean().default(false),
  })
  .strict();
export type GrappledTargetAttackRequest = z.input<typeof attackSchema>;
export function resolveGrappledTargetAttack(
  evaluation: CharacterEvaluation,
  unparsed: GrappledTargetAttackRequest,
) {
  const request = attackSchema.parse(unparsed);
  const benefit = source(evaluation, request.sourceId);
  if (!benefit.targetAdvantage)
    throw new TypeError("This source does not grant target-specific attack Advantage.");
  const choice = request.attack;
  const weapon =
    choice.kind === "weapon"
      ? evaluation.attacks.find(({ id }) => id === choice.attackId)
      : undefined;
  const casting =
    choice.kind === "spell"
      ? evaluation.spellcasting?.classId === choice.castingSourceId
        ? evaluation.spellcasting
        : evaluation.spells
            .flatMap((spell) => spell.castingOptions ?? [])
            .find(({ sourceId }) => sourceId === choice.castingSourceId)
      : undefined;
  if (!weapon && !casting)
    throw new TypeError("Choose a weapon, Unarmed Strike or spellcasting source on this sheet.");
  const mode = weapon?.damageModes?.find(
    ({ id }) => id === (weapon.properties.includes("two-handed") ? "two-handed" : "normal"),
  );
  if (mode?.available === false) throw new TypeError(mode.reasons.join(" "));
  const base = weapon ?? casting;
  if (base?.advantageSources === undefined || base.disadvantageSources === undefined)
    throw new TypeError("The attack's uncancelled Advantage/Disadvantage sources are unavailable.");
  const advantageSources = [
    ...base.advantageSources,
    benefit.sourceId,
    ...(request.additionalAdvantage ? ["declared-situational-advantage"] : []),
  ];
  const disadvantageSources = [
    ...base.disadvantageSources,
    ...(request.additionalDisadvantage ? ["declared-situational-disadvantage"] : []),
  ];
  return {
    targetName: request.targetName,
    sourceName: benefit.sourceName,
    traceId: benefit.traceId,
    attackName: weapon?.name ?? "Spell",
    modifier: base.attackBonus,
    mode: resolveRollMode(advantageSources, disadvantageSources),
    advantageSources,
    disadvantageSources,
    criticalThreshold: weapon?.criticalHitThreshold ?? 20,
  };
}

const punchSchema = sizesSchema
  .extend({
    attackId: z.string().min(1),
    hitCreatureConfirmed: z.literal(true),
    attackActionConfirmed: z.literal(true),
    ownTurnConfirmed: z.literal(true),
    unusedThisTurnConfirmed: z.literal(true),
    freeHandConfirmed: z.literal(true),
    withinReachConfirmed: z.literal(true),
    targetEligibleConfirmed: z.literal(true),
    critical: z.boolean().default(false),
    damageType: z.string().min(1).optional(),
  })
  .strict();
export type PunchAndGrabRequest = z.input<typeof punchSchema>;
export function resolvePunchAndGrab(
  evaluation: CharacterEvaluation,
  unparsed: PunchAndGrabRequest,
) {
  const request = punchSchema.parse(unparsed);
  const benefit = source(evaluation, request.sourceId);
  if (!benefit.damageAndGrapple)
    throw new TypeError("This source does not grant Damage and Grapple together.");
  const attack = evaluation.attacks.find(({ id }) => id === request.attackId);
  if (!attack?.properties.includes(benefit.damageAndGrapple.attackProperty) || !attack.grapple)
    throw new TypeError("Choose the granted Unarmed Strike, not a weapon attack.");
  if (
    creatureSizes.indexOf(request.targetSize) >
    creatureSizes.indexOf(request.currentSize) + attack.grapple.maximumTargetSizeSteps
  )
    throw new TypeError("The target is too large for this Unarmed Strike's Grapple option.");
  const damageType = request.damageType ?? attack.damage.type;
  if (![attack.damage.type, ...(attack.damage.alternativeTypes ?? [])].includes(damageType))
    throw new TypeError("Choose a damage type granted to this Unarmed Strike.");
  return {
    sourceName: benefit.sourceName,
    traceId: benefit.traceId,
    targetName: request.targetName,
    damage: { ...attack.damage, type: damageType },
    critical: request.critical,
    difficultyClass: attack.grapple.difficultyClass,
    saveTraceId: attack.grapple.traceId,
    instructions: `${request.targetName} chooses a Strength or Dexterity saving throw, DC ${String(attack.grapple.difficultyClass)}. On failure, set Grappled (by this character) on the target's sheet. Apply Unarmed Strike damage once, separately. Target immunity, the save result, reach, turn use and target-sheet changes remain manual.`,
  };
}

const movementSchema = sizesSchema
  .extend({
    targetGrappledByYouConfirmed: z.literal(true),
    distanceFeet: z.number().int().nonnegative().max(10000),
  })
  .strict();
export type GrappleMovementRequest = z.input<typeof movementSchema>;
export function resolveGrappleMovement(
  evaluation: CharacterEvaluation,
  unparsed: GrappleMovementRequest,
) {
  const request = movementSchema.parse(unparsed);
  const benefit = source(evaluation, request.sourceId);
  if (!benefit.movement)
    throw new TypeError("This source does not grant a grapple movement benefit.");
  const applies =
    creatureSizes.indexOf(request.targetSize) <= creatureSizes.indexOf(request.currentSize);
  const multiplier = applies ? 1 : 2;
  return {
    sourceName: benefit.sourceName,
    traceId: benefit.traceId,
    targetName: request.targetName,
    benefitApplies: applies,
    movementCostFeet: request.distanceFeet * multiplier,
    instructions: `${request.targetName}: ${String(request.distanceFeet)} ft. of movement costs ${String(request.distanceFeet * multiplier)} ft. before other movement costs. ${applies ? "No extra grapple movement cost: the target is your confirmed size or smaller." : "This benefit does not apply: the target is larger; ordinary extra grapple movement cost applies."} Confirm remaining movement, difficult terrain, other costs and actual current sizes manually. Speed and positions have not been changed.`,
  };
}
