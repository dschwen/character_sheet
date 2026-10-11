import { z } from "zod";
import type { AttackRollOptionSummary, CharacterEvaluation, RollMode } from "@dnd/rules-api";
import { resolveRollMode } from "./d20.js";

const declarationSchema = z
  .object({
    benefitSourceIds: z.array(z.string().min(1)).default([]),
    tradeoffSourceId: z.string().min(1).optional(),
    effectId: z.string().min(1).optional(),
    firstAttackDeclarationConfirmed: z.boolean().default(false),
    ownTurnConfirmed: z.boolean().default(false),
    unusedThisTurnConfirmed: z.boolean().default(false),
    additionalAdvantage: z.boolean().default(false),
    additionalDisadvantage: z.boolean().default(false),
  })
  .strict();

export type AttackRollDeclaration = z.input<typeof declarationSchema>;
export interface AttackRollOptionResolution {
  attackId: string;
  mode: RollMode;
  advantageSources: string[];
  disadvantageSources: string[];
  benefits: AttackRollOptionSummary[];
  tradeoff?: AttackRollOptionSummary;
  effect?: AttackRollOptionSummary["effects"][number];
}

/** Pure resolution of declared timing; does not spend actions, track turns, or adjudicate a hit. */
export function resolveAttackRollOptions(
  evaluation: CharacterEvaluation,
  attackId: string,
  unparsed: AttackRollDeclaration = {},
): AttackRollOptionResolution {
  const request = declarationSchema.parse(unparsed);
  const attack = evaluation.attacks.find(({ id }) => id === attackId);
  if (attack === undefined) throw new TypeError("Choose an attack on this sheet.");
  if (evaluation.facts["actions.disabled"] === true || evaluation.facts["deathSave.dead"] === true)
    throw new TypeError("This character cannot make an attack while Incapacitated or dead.");
  if (new Set(request.benefitSourceIds).size !== request.benefitSourceIds.length)
    throw new TypeError("Do not select an attack benefit more than once.");
  const options = attack.rollOptions ?? [];
  const benefits = request.benefitSourceIds.map((id) => {
    const option = options.find(({ sourceId, kind }) => sourceId === id && kind === "advantage");
    if (option === undefined)
      throw new TypeError("That attack benefit is not granted for this attack ability.");
    if (option.requiresFirstAttackDeclaration && !request.firstAttackDeclarationConfirmed)
      throw new TypeError(
        "Confirm this benefit was declared on your first attack roll on your turn.",
      );
    return option;
  });
  const advantageSources = [
    ...(attack.advantageSources ?? []),
    ...benefits.map(({ sourceId }) => sourceId),
    ...(request.additionalAdvantage ? ["declared-situational-advantage"] : []),
  ];
  const disadvantageSources = [
    ...(attack.disadvantageSources ?? []),
    ...(request.additionalDisadvantage ? ["declared-situational-disadvantage"] : []),
  ];
  let tradeoff: AttackRollOptionSummary | undefined;
  let effect: AttackRollOptionSummary["effects"][number] | undefined;
  if (request.tradeoffSourceId !== undefined) {
    tradeoff = options.find(
      ({ sourceId, kind }) => sourceId === request.tradeoffSourceId && kind === "forgo-advantage",
    );
    if (tradeoff === undefined)
      throw new TypeError("That attack tradeoff is not granted for this attack ability.");
    if (
      tradeoff.requiredOptionSourceId !== undefined &&
      !request.benefitSourceIds.includes(tradeoff.requiredOptionSourceId)
    )
      throw new TypeError("Declare the required attack benefit before using this tradeoff.");
    if (tradeoff.onceOnYourTurn && (!request.ownTurnConfirmed || !request.unusedThisTurnConfirmed))
      throw new TypeError(
        "Confirm this is your turn and no attack has used this tradeoff this turn, including a missed attack.",
      );
    if (disadvantageSources.length > 0)
      throw new TypeError(
        "This tradeoff cannot be used when any Disadvantage applies, even if Advantage would cancel it.",
      );
    if (advantageSources.length === 0) throw new TypeError("There is no Advantage to forgo.");
    effect = tradeoff.effects.find(({ id }) => id === request.effectId);
    if (tradeoff.effects.length > 0 && effect === undefined)
      throw new TypeError("Choose one granted attack effect.");
  } else if (request.effectId !== undefined)
    throw new TypeError("Choose an attack tradeoff before selecting its effect.");
  return {
    attackId,
    mode:
      tradeoff === undefined ? resolveRollMode(advantageSources, disadvantageSources) : "normal",
    advantageSources,
    disadvantageSources,
    benefits,
    ...(tradeoff === undefined ? {} : { tradeoff }),
    ...(effect === undefined ? {} : { effect }),
  };
}
