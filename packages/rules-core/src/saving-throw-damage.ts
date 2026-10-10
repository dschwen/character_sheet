import { z } from "zod";
import type {
  CharacterEvaluation,
  SavingThrowDamageRequest,
  SavingThrowDamageResolution,
} from "@dnd/rules-api";

const requestSchema = z
  .object({
    damage: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    ability: z.enum([
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ]),
    outcome: z.enum(["success", "failure"]),
    damageOnSuccess: z.enum(["half", "none", "full"]),
  })
  .strict();

/** Resolve only the declared saving throw; resistances and other damage modifiers are separate. */
export function resolveSavingThrowDamage(
  evaluation: CharacterEvaluation,
  input: SavingThrowDamageRequest,
): SavingThrowDamageResolution {
  const request = requestSchema.parse(input);
  const baseline =
    request.outcome === "failure"
      ? 1
      : request.damageOnSuccess === "half"
        ? 0.5
        : request.damageOnSuccess === "none"
          ? 0
          : 1;
  const eligible = (evaluation.savingThrowDamageEffects ?? []).filter(
    (effect) =>
      effect.active && effect.ability === request.ability && request.damageOnSuccess === "half",
  );
  const fraction = Math.min(
    baseline,
    ...eligible.map((effect) =>
      request.outcome === "success" ? effect.successFraction : effect.failureFraction,
    ),
  );
  const applied = eligible.filter(
    (effect) =>
      (request.outcome === "success" ? effect.successFraction : effect.failureFraction) ===
        fraction && fraction < baseline,
  );
  const damage = Math.floor(request.damage * fraction);
  const names = applied.map((effect) => effect.sourceName);
  const explanation = `${request.outcome === "success" ? "Successful" : "Failed"} ${request.ability} save${names.length === 0 ? "" : ` · ${names.join(", ")}`}: ${String(request.damage)} × ${String(fraction)}, rounded down = ${String(damage)} damage. Resistances, vulnerability, and other reductions are not applied.`;
  const traceId = "incomingDamage.savingThrow";
  return {
    damage,
    fraction,
    appliedEffectIds: [...new Set(applied.map((effect) => effect.sourceId))],
    explanation,
    trace: {
      id: traceId,
      result: damage,
      nodes: [
        {
          id: `${traceId}.context`,
          operation: "declare-saving-throw-context",
          inputs: [request.ability, request.outcome, request.damageOnSuccess],
          output: baseline,
        },
        {
          id: `${traceId}.effects`,
          operation: "select-lowest-applicable-damage-fraction",
          inputs: [
            baseline,
            ...eligible.map((effect) =>
              request.outcome === "success" ? effect.successFraction : effect.failureFraction,
            ),
          ],
          output: fraction,
        },
        {
          id: `${traceId}.damage`,
          operation: "multiply-and-round-down",
          inputs: [request.damage, fraction],
          output: damage,
        },
      ],
      sourceReferences: eligible.flatMap(
        (effect) => evaluation.traces[effect.traceId]?.sourceReferences ?? [],
      ),
    },
  };
}
