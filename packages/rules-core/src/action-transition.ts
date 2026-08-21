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
    amount: z.number().int().positive().optional(),
  })
  .strict();

const stateActionParametersSchema = z
  .object({
    spends: z.number().int().positive().optional(),
    variableSpend: z.object({ minimum: z.number().int().positive() }).strict().optional(),
    resourceId: z.string().min(1),
    activatesEffectId: z.string().min(1).optional(),
    endsConditionIds: z.array(z.string().min(1)).default([]),
    spellId: z.string().min(1).optional(),
    restoresResource: z
      .object({ resourceId: z.string().min(1), amount: z.number().int().positive() })
      .strict()
      .optional(),
    restoresSpellSlots: z
      .object({ amount: z.number().int().positive(), slotLevel: z.number().int().min(1).max(9) })
      .strict()
      .optional(),
    healing: z
      .union([
        z
          .object({
            diceCount: z.number().int().positive(),
            diceSize: z.number().int().positive(),
            bonusFact: z.string().min(1),
          })
          .strict(),
        z.object({ perResourcePoint: z.number().positive() }).strict(),
      ])
      .optional(),
    temporaryHitPoints: z.number().int().nonnegative().optional(),
    minimumCurrentHitPoints: z.number().int().positive().optional(),
  })
  .passthrough()
  .refine(
    (parameters) => (parameters.spends === undefined) !== (parameters.variableSpend === undefined),
  );

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
    const diceHealing = healing !== undefined && "diceCount" in healing ? healing : undefined;
    if (diceHealing === undefined && request.rolls.length > 0) {
      addValidation(
        validations,
        "ACTION_ROLLS_NOT_EXPECTED",
        `${request.actionId} does not accept dice rolls.`,
        ["request.rolls"],
      );
    } else if (diceHealing !== undefined && request.rolls.length !== diceHealing.diceCount) {
      addValidation(
        validations,
        "ACTION_ROLL_COUNT_INVALID",
        `${request.actionId} requires ${String(diceHealing.diceCount)} d${String(diceHealing.diceSize)} roll.`,
        ["request.rolls"],
      );
    }
    for (const [index, roll] of request.rolls.entries()) {
      if (diceHealing !== undefined && roll > diceHealing.diceSize) {
        addValidation(
          validations,
          "ACTION_ROLL_OUT_OF_RANGE",
          `A d${String(diceHealing.diceSize)} roll cannot be ${String(roll)}.`,
          [`request.rolls.${String(index)}`],
        );
      }
    }
    if (parsedParameters.data.variableSpend !== undefined) {
      if (request.amount === undefined) {
        addValidation(
          validations,
          "ACTION_SPEND_AMOUNT_REQUIRED",
          `${request.actionId} requires an amount to spend.`,
          ["request.amount"],
        );
      } else if (request.amount < parsedParameters.data.variableSpend.minimum) {
        addValidation(
          validations,
          "ACTION_SPEND_AMOUNT_BELOW_MINIMUM",
          `${request.actionId} must spend at least ${String(parsedParameters.data.variableSpend.minimum)}.`,
          ["request.amount"],
        );
      }
    } else if (request.amount !== undefined) {
      addValidation(
        validations,
        "ACTION_SPEND_AMOUNT_NOT_EXPECTED",
        `${request.actionId} does not accept a variable spend amount.`,
        ["request.amount"],
      );
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
  const spend = parameters.variableSpend === undefined ? parameters.spends : request.amount;
  if (spend === undefined) {
    throw new TypeError("Validated action spend amount is missing");
  }
  const resource = evaluation.resources.find((candidate) => candidate.id === parameters.resourceId);
  const spell =
    parameters.spellId === undefined
      ? undefined
      : evaluation.spells.find((candidate) => candidate.id === parameters.spellId);
  const restoredResource =
    parameters.restoresResource === undefined
      ? undefined
      : evaluation.resources.find(
          (candidate) => candidate.id === parameters.restoresResource?.resourceId,
        );
  const restoredSpellSlot =
    parameters.restoresSpellSlots === undefined
      ? undefined
      : evaluation.spellcasting?.slots.find(
          (candidate) => candidate.level === parameters.restoresSpellSlots?.slotLevel,
        );
  const diceHealing =
    parameters.healing !== undefined && "diceCount" in parameters.healing
      ? parameters.healing
      : undefined;
  const bonus = diceHealing === undefined ? undefined : evaluation.facts[diceHealing.bonusFact];
  const maximumHitPoints =
    parameters.healing === undefined && parameters.minimumCurrentHitPoints === undefined
      ? undefined
      : evaluation.values["hitPoints.maximum"]?.value;
  if (
    resource === undefined ||
    (parameters.spellId !== undefined && spell === undefined) ||
    (parameters.restoresResource !== undefined && restoredResource === undefined) ||
    (parameters.restoresSpellSlots !== undefined && restoredSpellSlot === undefined) ||
    (parameters.minimumCurrentHitPoints !== undefined && typeof maximumHitPoints !== "number") ||
    (diceHealing !== undefined &&
      (typeof bonus !== "number" || typeof maximumHitPoints !== "number"))
  ) {
    addValidation(
      validations,
      "ACTION_TRANSITION_FACT_MISSING",
      `${request.actionId} is missing a required resource, spell, or healing fact.`,
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
  if (resource.current < spend) {
    addValidation(
      validations,
      "ACTION_RESOURCE_AMOUNT_INSUFFICIENT",
      `${request.actionId} cannot spend ${String(spend)}; only ${String(resource.current)} remain.`,
      ["request.amount"],
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
  if (parameters.healing !== undefined && typeof maximumHitPoints === "number") {
    const perResourcePoint =
      "perResourcePoint" in parameters.healing ? parameters.healing.perResourcePoint : undefined;
    if (perResourcePoint !== undefined && typeof perResourcePoint !== "number") {
      throw new TypeError("Action healing per resource point must be numeric");
    }
    const healing =
      perResourcePoint === undefined
        ? request.rolls.reduce((total, roll) => total + roll, 0) +
          (typeof bonus === "number" ? bonus : 0)
        : spend * perResourcePoint;
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
      [
        character.state.currentHitPoints,
        ...request.rolls,
        ...(typeof bonus === "number" ? [bonus] : []),
        ...(typeof perResourcePoint === "number" ? [spend, perResourcePoint] : []),
        maximumHitPoints,
      ],
      sourceTrace,
    );
  }
  if (parameters.minimumCurrentHitPoints !== undefined && typeof maximumHitPoints === "number") {
    const raisedHitPoints = Math.min(
      maximumHitPoints,
      Math.max(healedHitPoints, parameters.minimumCurrentHitPoints),
    );
    nextState.currentHitPoints = raisedHitPoints;
    recordChange(
      changes,
      traces,
      "state.currentHitPoints",
      healedHitPoints,
      raisedHitPoints,
      `${request.actionId} raises current Hit Points to at least ${String(parameters.minimumCurrentHitPoints)}.`,
      "apply-action-minimum-hit-points",
      [healedHitPoints, parameters.minimumCurrentHitPoints, maximumHitPoints],
      sourceTrace,
    );
    healedHitPoints = raisedHitPoints;
  }
  const expendedBefore = character.state.expendedResources[parameters.resourceId] ?? 0;
  const expendedAfter = expendedBefore + spend;
  nextState.expendedResources[parameters.resourceId] = expendedAfter;
  recordChange(
    changes,
    traces,
    `state.expendedResources.${parameters.resourceId}`,
    expendedBefore,
    expendedAfter,
    `${request.actionId} expends ${String(spend)} use.`,
    "spend-action-resource",
    [expendedBefore, spend, resource.maximum],
    sourceTrace,
  );
  if (
    parameters.activatesEffectId !== undefined &&
    !character.state.activeEffectIds.includes(parameters.activatesEffectId)
  ) {
    const activeEffectsBefore = [...character.state.activeEffectIds];
    const activeEffectsAfter = [...new Set([...activeEffectsBefore, parameters.activatesEffectId])];
    nextState.activeEffectIds = activeEffectsAfter;
    recordChange(
      changes,
      traces,
      "state.activeEffectIds",
      activeEffectsBefore,
      activeEffectsAfter,
      `${request.actionId} activates ${parameters.activatesEffectId}.`,
      "activate-action-effect",
      [parameters.activatesEffectId],
      sourceTrace,
    );
  }
  if (parameters.endsConditionIds.length > 0) {
    const conditionIdsBefore = [...character.state.conditionIds];
    const ended = new Set(parameters.endsConditionIds);
    const conditionIdsAfter = conditionIdsBefore.filter((conditionId) => !ended.has(conditionId));
    if (conditionIdsAfter.length !== conditionIdsBefore.length) {
      nextState.conditionIds = conditionIdsAfter;
      recordChange(
        changes,
        traces,
        "state.conditionIds",
        conditionIdsBefore,
        conditionIdsAfter,
        `${request.actionId} ends ${parameters.endsConditionIds.join(", ")}.`,
        "end-conditions-on-action",
        parameters.endsConditionIds,
        sourceTrace,
      );
    }
  }
  if (parameters.temporaryHitPoints !== undefined) {
    const temporaryHitPointsAfter = Math.max(
      character.state.temporaryHitPoints,
      parameters.temporaryHitPoints,
    );
    nextState.temporaryHitPoints = temporaryHitPointsAfter;
    recordChange(
      changes,
      traces,
      "state.temporaryHitPoints",
      character.state.temporaryHitPoints,
      temporaryHitPointsAfter,
      `${request.actionId} grants Temporary Hit Points.`,
      "apply-action-temporary-hit-points",
      [character.state.temporaryHitPoints, parameters.temporaryHitPoints],
      sourceTrace,
    );
  }
  if (spell?.concentration === true) {
    const concentrationBefore = character.state.concentrationSpellId ?? null;
    nextState.concentrationSpellId = spell.id;
    recordChange(
      changes,
      traces,
      "state.concentrationSpellId",
      concentrationBefore,
      spell.id,
      `${request.actionId} starts Concentration and ends any previous Concentration.`,
      "start-concentration",
      [concentrationBefore, spell.id],
      sourceTrace,
    );
  }
  if (parameters.restoresResource !== undefined && restoredResource !== undefined) {
    const restoredBefore =
      character.state.expendedResources[parameters.restoresResource.resourceId] ?? 0;
    const restoredAfter = Math.max(0, restoredBefore - parameters.restoresResource.amount);
    nextState.expendedResources[parameters.restoresResource.resourceId] = restoredAfter;
    recordChange(
      changes,
      traces,
      `state.expendedResources.${parameters.restoresResource.resourceId}`,
      restoredBefore,
      restoredAfter,
      `${request.actionId} restores up to ${String(parameters.restoresResource.amount)} resource points.`,
      "restore-action-resource",
      [restoredBefore, parameters.restoresResource.amount, restoredResource.maximum],
      sourceTrace,
    );
  }
  if (parameters.restoresSpellSlots !== undefined && restoredSpellSlot !== undefined) {
    const slotLevel = String(parameters.restoresSpellSlots.slotLevel);
    const restoredBefore = character.state.expendedSpellSlots[slotLevel] ?? 0;
    const restoredAfter = Math.max(0, restoredBefore - parameters.restoresSpellSlots.amount);
    nextState.expendedSpellSlots[slotLevel] = restoredAfter;
    recordChange(
      changes,
      traces,
      `state.expendedSpellSlots.${slotLevel}`,
      restoredBefore,
      restoredAfter,
      `${request.actionId} restores up to ${String(parameters.restoresSpellSlots.amount)} spell slots.`,
      "restore-action-spell-slots",
      [restoredBefore, parameters.restoresSpellSlots.amount, restoredSpellSlot.maximum],
      sourceTrace,
    );
  }
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
