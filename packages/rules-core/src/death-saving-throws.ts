import { z } from "zod";
import { characterDocumentSchema, type CharacterState } from "@dnd/character-model";
import type { CalculationTrace } from "@dnd/calculation-trace";
import type {
  DeathSavingThrowProposal,
  DeathSavingThrowRequest,
  EvaluateCharacterInput,
  StateChange,
} from "@dnd/rules-api";

export const deathSavingThrowSources = [
  { entityId: "srd521.rule.death-saving-throws", sourceId: "wotc-srd-5.2.1-en", page: 17 },
  { entityId: "srd521.rule.death-saving-throws", sourceId: "wotc-srd-5.2.1-en", page: 18 },
];

export function deathSaveStatus(state: CharacterState): "alive" | "dying" | "stable" | "dead" {
  if (state.dead === true || state.deathSaveFailures >= 3 || state.exhaustion >= 6) return "dead";
  if (state.currentHitPoints > 0) return "alive";
  if (state.stableAtZeroHitPoints === true || state.deathSaveSuccesses >= 3) return "stable";
  return "dying";
}

const requestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("roll"),
      naturalRoll: z.number().int().min(1).max(20),
      total: z.number().int(),
      startOfTurnConfirmed: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal("stabilize"), successfulFirstAidConfirmed: z.boolean() }).strict(),
]);

/** Resolve declared physical results after any reroll decision; never roll or spend a feature here. */
export function proposeDeathSavingThrow(
  input: EvaluateCharacterInput,
  unparsedRequest: DeathSavingThrowRequest,
): DeathSavingThrowProposal {
  const character = characterDocumentSchema.parse(input.character);
  const request = requestSchema.parse(unparsedRequest);
  const before = character.state;
  const nextState = structuredClone(before);
  const status = deathSaveStatus(before);
  if (
    before.currentHitPoints !== 0 ||
    status === "dead" ||
    status === "stable" ||
    (request.kind === "roll" ? !request.startOfTurnConfirmed : !request.successfulFirstAidConfirmed)
  )
    return {
      kind: "death-saving-throw",
      applicable: false,
      changes: [],
      nextState,
      validations: [
        {
          id: "death-save-ineligible",
          code: "DEATH_SAVE_NOT_ELIGIBLE",
          severity: "error",
          message: {
            en: "Death saves require a living, non-Stable character at 0 HP and a confirmed start of turn; first aid requires a declared successful DC 10 Medicine check and Help action.",
          },
          paths: ["state.currentHitPoints", "request"],
        },
      ],
      traces: {},
    };
  let outcome: NonNullable<DeathSavingThrowProposal["outcome"]>;
  const stabilize = () => {
    nextState.stableAtZeroHitPoints = true;
    nextState.deathSaveSuccesses = 0;
    nextState.deathSaveFailures = 0;
  };
  if (request.kind === "stabilize") {
    stabilize();
    outcome = "stable";
  } else if (request.naturalRoll === 20) {
    nextState.currentHitPoints = 1;
    nextState.deathSaveSuccesses = 0;
    nextState.deathSaveFailures = 0;
    nextState.stableAtZeroHitPoints = false;
    outcome = "regain-one-hit-point";
  } else if (request.naturalRoll !== 1 && request.total >= 10) {
    nextState.deathSaveSuccesses += 1;
    if (nextState.deathSaveSuccesses >= 3) {
      stabilize();
      outcome = "stable";
    } else outcome = "success";
  } else {
    const failures = request.naturalRoll === 1 ? 2 : 1;
    nextState.deathSaveFailures = Math.min(3, nextState.deathSaveFailures + failures);
    if (nextState.deathSaveFailures >= 3) nextState.dead = true;
    outcome =
      nextState.deathSaveFailures >= 3 ? "dead" : failures === 2 ? "two-failures" : "failure";
  }
  const changes: StateChange[] = [];
  const traces: Record<string, CalculationTrace> = {};
  for (const field of [
    "currentHitPoints",
    "deathSaveSuccesses",
    "deathSaveFailures",
    "stableAtZeroHitPoints",
    "dead",
  ] as const) {
    const previous = before[field] ?? null;
    const next = nextState[field] ?? null;
    if (previous === next) continue;
    const traceId = `deathSavingThrow.${field}`;
    changes.push({
      path: `state.${field}`,
      before: previous,
      after: next,
      reason: outcome,
      traceId,
    });
    traces[traceId] = {
      id: traceId,
      result: next,
      nodes: [
        {
          id: `${traceId}.resolve`,
          operation: "resolve-death-saving-throw",
          inputs: [request, previous],
          output: next,
        },
      ],
      sourceReferences: deathSavingThrowSources,
    };
  }
  return {
    kind: "death-saving-throw",
    applicable: true,
    outcome,
    changes,
    nextState,
    validations: [],
    traces,
  };
}
