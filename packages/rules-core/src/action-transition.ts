import { z } from "zod";

import type { CalculationTrace, JsonValue } from "@dnd/calculation-trace";
import { characterDocumentSchema, type CharacterState } from "@dnd/character-model";
import type {
  ActionTransitionProposal,
  ActionUseRequest,
  EvaluateCharacterInput,
  StateChange,
  ValidationMessage,
} from "@dnd/rules-api";

import { evaluateCharacter } from "./character-evaluator.js";

const actionUseRequestSchema = z
  .object({
    actionId: z.string().min(1),
    rolls: z.array(z.number().int().positive()).default([]),
  })
  .strict();

const stateActionParametersSchema = z
  .object({
    spends: z.number().int().positive(),
    resourceId: z.string().min(1),
    healing: z
      .object({
        diceCount: z.number().int().positive(),
        diceSize: z.number().int().positive(),
        bonusFact: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .passthrough();

function cloneState(state: CharacterState): CharacterState {
  return {
    ...state,
    expendedResources: { ...state.expendedResources },
    expendedHitDice: { ...state.expendedHitDice },
    expendedSpellSlots: { ...state.expendedSpellSlots },
    conditionIds: [...state.conditionIds],
    activeEffectIds: [...state.activeEffectIds],
  };
}

function addValidation(
  validations: ValidationMessage[],
  code: string,
  message: string,
  paths: string[],
): void {
  validations.push({
    id: `${code.toLowerCase()}-${String(validations.length + 1)}`,
    severity: "error",
    code,
    message: { en: message },
    paths,
  });
}

function recordChange(
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
  path: string,
  before: JsonValue,
  after: JsonValue,
  reason: string,
  operation: string,
  inputs: JsonValue[],
  sourceTrace: CalculationTrace | undefined,
): void {
  if (before === after) {
    return;
  }
  const traceId = `transition.action.${path}`;
  changes.push({ path, before, after, reason, traceId });
  traces[traceId] = {
    id: traceId,
    result: after,
    nodes: [
      {
        id: `${traceId}.apply`,
        operation,
        inputs,
        output: after,
        label: reason,
      },
    ],
    sourceReferences: sourceTrace?.sourceReferences ?? [],
  };
}

export function proposeAction(
  input: EvaluateCharacterInput,
  unparsedRequest: ActionUseRequest,
): ActionTransitionProposal {
  const character = characterDocumentSchema.parse(input.character);
  const request = actionUseRequestSchema.parse(unparsedRequest);
  const evaluation = evaluateCharacter({ ...input, character });
  const action = evaluation.actions.find((candidate) => candidate.id === request.actionId);
  const originalState = cloneState(character.state);
  const validations: ValidationMessage[] = [];
  if (action === undefined) {
    addValidation(
      validations,
      "ACTION_NOT_AVAILABLE",
      `${request.actionId} is not granted to this character.`,
      ["request.actionId"],
    );
  } else if (!action.available) {
    addValidation(
      validations,
      "ACTION_PREREQUISITES_NOT_SATISFIED",
      `${request.actionId} cannot currently be used.`,
      ["request.actionId"],
    );
  }

  const parsedParameters = stateActionParametersSchema.safeParse(action?.parameters);
  if (action !== undefined && !parsedParameters.success) {
    addValidation(
      validations,
      "ACTION_TRANSITION_UNSUPPORTED",
      `${request.actionId} does not have a supported state-transition definition.`,
      ["request.actionId"],
    );
  }
  if (parsedParameters.success) {
    const healing = parsedParameters.data.healing;
    if (healing === undefined && request.rolls.length > 0) {
      addValidation(
        validations,
        "ACTION_ROLLS_NOT_EXPECTED",
        `${request.actionId} does not accept dice rolls.`,
        ["request.rolls"],
      );
    } else if (healing !== undefined && request.rolls.length !== healing.diceCount) {
      addValidation(
        validations,
        "ACTION_ROLL_COUNT_INVALID",
        `${request.actionId} requires ${String(healing.diceCount)} d${String(healing.diceSize)} roll.`,
        ["request.rolls"],
      );
    }
    for (const [index, roll] of request.rolls.entries()) {
      if (healing !== undefined && roll > healing.diceSize) {
        addValidation(
          validations,
          "ACTION_ROLL_OUT_OF_RANGE",
          `A d${String(healing.diceSize)} roll cannot be ${String(roll)}.`,
          [`request.rolls.${String(index)}`],
        );
      }
    }
  }
  if (
    action === undefined ||
    !parsedParameters.success ||
    validations.some((message) => message.severity === "error")
  ) {
    return {
      kind: "action",
      actionId: request.actionId,
      applicable: false,
      changes: [],
      nextState: originalState,
      validations,
      traces: {},
    };
  }

  const parameters = parsedParameters.data;
  const resource = evaluation.resources.find((candidate) => candidate.id === parameters.resourceId);
  const bonus =
    parameters.healing === undefined ? undefined : evaluation.facts[parameters.healing.bonusFact];
  const maximumHitPoints =
    parameters.healing === undefined ? undefined : evaluation.values["hitPoints.maximum"]?.value;
  if (
    resource === undefined ||
    (parameters.healing !== undefined &&
      (typeof bonus !== "number" || typeof maximumHitPoints !== "number"))
  ) {
    addValidation(
      validations,
      "ACTION_TRANSITION_FACT_MISSING",
      `${request.actionId} is missing a required resource or healing fact.`,
      ["request.actionId"],
    );
    return {
      kind: "action",
      actionId: request.actionId,
      applicable: false,
      changes: [],
      nextState: originalState,
      validations,
      traces: {},
    };
  }

  const nextState = cloneState(character.state);
  const changes: StateChange[] = [];
  const traces: Record<string, CalculationTrace> = {};
  const sourceTrace = evaluation.traces[action.traceId];
  let healedHitPoints = character.state.currentHitPoints;
  if (
    parameters.healing !== undefined &&
    typeof bonus === "number" &&
    typeof maximumHitPoints === "number"
  ) {
    const healing = request.rolls.reduce((total, roll) => total + roll, 0) + bonus;
    healedHitPoints = Math.min(
      maximumHitPoints,
      character.state.currentHitPoints + Math.max(0, healing),
    );
    nextState.currentHitPoints = healedHitPoints;
    recordChange(
      changes,
      traces,
      "state.currentHitPoints",
      character.state.currentHitPoints,
      healedHitPoints,
      `${request.actionId} restores Hit Points.`,
      "apply-action-healing",
      [character.state.currentHitPoints, ...request.rolls, bonus, maximumHitPoints],
      sourceTrace,
    );
  }
  const expendedBefore = character.state.expendedResources[parameters.resourceId] ?? 0;
  const expendedAfter = Math.min(resource.maximum, expendedBefore + parameters.spends);
  nextState.expendedResources[parameters.resourceId] = expendedAfter;
  recordChange(
    changes,
    traces,
    `state.expendedResources.${parameters.resourceId}`,
    expendedBefore,
    expendedAfter,
    `${request.actionId} expends ${String(parameters.spends)} use.`,
    "spend-action-resource",
    [expendedBefore, parameters.spends, resource.maximum],
    sourceTrace,
  );
  if (healedHitPoints > character.state.currentHitPoints) {
    for (const field of ["deathSaveSuccesses", "deathSaveFailures"] as const) {
      nextState[field] = 0;
      recordChange(
        changes,
        traces,
        `state.${field}`,
        character.state[field],
        0,
        "Regaining Hit Points resets Death Saving Throw marks.",
        "reset-death-saves-after-healing",
        [character.state[field]],
        sourceTrace,
      );
    }
  }
  return {
    kind: "action",
    actionId: request.actionId,
    applicable: true,
    changes,
    nextState,
    validations,
    traces,
  };
}
