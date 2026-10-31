import { z } from "zod";

import type { CalculationTrace, JsonValue, SourceReference } from "@dnd/calculation-trace";
import {
  characterDocumentSchema,
  type CharacterDocument,
  type CharacterState,
} from "@dnd/character-model";
import { isEditionReferenceSpan } from "@dnd/content-schema";
import type {
  EvaluateCharacterInput,
  RestEvent,
  RestRequest,
  StateChange,
  StateTransitionProposal,
  ValidationMessage,
} from "@dnd/rules-api";

import { evaluateCharacter } from "./character-evaluator.js";
import { deathSaveStatus } from "./death-saving-throws.js";
import { featureOptionChoices, validateFeatureOptionChoices } from "./feature-option-choices.js";

const restRequestSchema = z
  .object({
    event: z.enum(["short-rest", "long-rest"]),
    featureChoiceReplacements: z
      .array(
        z
          .object({ choiceId: z.string().min(1), optionIds: z.array(z.string().min(1)).min(1) })
          .strict(),
      )
      .default([]),
    hitDice: z
      .array(
        z
          .object({
            classId: z.string().min(1),
            rolls: z.array(z.number().int().positive()).min(1),
          })
          .strict(),
      )
      .default([]),
    spellSlotRecoveries: z
      .array(
        z
          .object({
            sourceId: z.string().min(1),
            slots: z
              .array(
                z
                  .object({
                    level: z.number().int().min(1).max(9),
                    count: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

const hitPointClassBodySchema = z
  .object({ hitPointDie: z.number().int().positive() })
  .passthrough();

const restSources: Readonly<
  Record<RestEvent | "temporary-hit-points" | "death-saves", SourceReference>
> = {
  "short-rest": {
    entityId: "srd521.rule.short-rest",
    sourceId: "wotc-srd-5.2.1-en",
    page: 187,
  },
  "long-rest": {
    entityId: "srd521.rule.long-rest",
    sourceId: "wotc-srd-5.2.1-en",
    page: 185,
  },
  "temporary-hit-points": {
    entityId: "srd521.rule.temporary-hit-points",
    sourceId: "wotc-srd-5.2.1-en",
    page: 18,
  },
  "death-saves": {
    entityId: "srd521.rule.death-saving-throws",
    sourceId: "wotc-srd-5.2.1-en",
    page: 17,
  },
};

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

function validation(
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
  sources: SourceReference[],
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  const traceId = `transition.${path}`;
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
    sourceReferences: sources,
  };
}

function classLevelCounts(character: CharacterDocument): Map<string, number> {
  const counts = new Map<string, number>();
  for (const level of character.build.levels) {
    counts.set(level.classId, (counts.get(level.classId) ?? 0) + 1);
  }
  return counts;
}

interface ValidatedHitDieSpend {
  classId: string;
  rolls: number[];
  hitPointDie: number;
}

function validateHitDieSpending(
  input: EvaluateCharacterInput,
  character: CharacterDocument,
  request: z.infer<typeof restRequestSchema>,
  validations: ValidationMessage[],
): ValidatedHitDieSpend[] {
  if (request.event !== "short-rest" && request.hitDice.length > 0) {
    validation(
      validations,
      "HIT_DICE_SPEND_REQUIRES_SHORT_REST",
      "Hit Dice can be spent only as part of a Short Rest proposal.",
      ["request.hitDice"],
    );
    return [];
  }
  const duplicateClassIds = request.hitDice
    .map((spend) => spend.classId)
    .filter((classId, index, values) => values.indexOf(classId) !== index);
  if (duplicateClassIds.length > 0) {
    validation(
      validations,
      "DUPLICATE_HIT_DIE_SPEND",
      "Combine Hit Die rolls for the same class into one request entry.",
      ["request.hitDice"],
    );
  }
  const levels = classLevelCounts(character);
  const entities = new Map(
    input.packages.flatMap((rulesPackage) =>
      rulesPackage.entities.map((entity) => [entity.id, entity] as const),
    ),
  );
  const validated: ValidatedHitDieSpend[] = [];
  for (const [index, spend] of request.hitDice.entries()) {
    const classLevels = levels.get(spend.classId) ?? 0;
    const entity = entities.get(spend.classId);
    if (classLevels === 0 || entity?.kind !== "class") {
      validation(
        validations,
        "HIT_DIE_CLASS_INVALID",
        `${spend.classId} is not a loaded class on this character.`,
        [`request.hitDice.${String(index)}.classId`],
      );
      continue;
    }
    const hitPointDie = hitPointClassBodySchema.parse(entity.body).hitPointDie;
    const alreadyExpended = character.state.expendedHitDice[spend.classId] ?? 0;
    const available = Math.max(0, classLevels - alreadyExpended);
    if (spend.rolls.length > available) {
      validation(
        validations,
        "HIT_DICE_INSUFFICIENT",
        `${spend.classId} has only ${String(available)} unspent Hit Dice.`,
        [`request.hitDice.${String(index)}.rolls`],
      );
    }
    for (const [rollIndex, roll] of spend.rolls.entries()) {
      if (roll > hitPointDie) {
        validation(
          validations,
          "HIT_DIE_ROLL_OUT_OF_RANGE",
          `A d${String(hitPointDie)} Hit Die roll cannot be ${String(roll)}.`,
          [`request.hitDice.${String(index)}.rolls.${String(rollIndex)}`],
        );
      }
    }
    validated.push({ classId: spend.classId, rolls: spend.rolls, hitPointDie });
  }
  return validated;
}

function resourceRecharge(
  event: RestEvent,
  character: CharacterDocument,
  evaluation: ReturnType<typeof evaluateCharacter>,
  nextState: CharacterState,
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
): void {
  for (const resource of evaluation.resources) {
    const rules = resource.recharge.filter((rule) => rule.event === event);
    if (rules.length === 0 || resource.expended === 0) {
      continue;
    }
    const restored = rules.reduce(
      (total, rule) =>
        rule.amount === "all"
          ? resource.expended
          : Math.min(resource.expended, total + rule.amount),
      0,
    );
    const after = Math.max(0, resource.expended - restored);
    nextState.expendedResources[resource.id] = after;
    recordChange(
      changes,
      traces,
      `state.expendedResources.${resource.id}`,
      character.state.expendedResources[resource.id] ?? 0,
      after,
      `${event === "short-rest" ? "Short" : "Long"} Rest recharges ${resource.id}.`,
      "recharge-resource",
      [resource.expended, restored],
      evaluation.traces[resource.traceId]?.sourceReferences ?? [restSources[event]],
    );
  }
}

function resetDeathSavesAfterHealing(
  character: CharacterDocument,
  nextState: CharacterState,
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
): void {
  if (character.state.stableAtZeroHitPoints !== undefined) {
    nextState.stableAtZeroHitPoints = false;
    recordChange(
      changes,
      traces,
      "state.stableAtZeroHitPoints",
      character.state.stableAtZeroHitPoints,
      false,
      "Regaining Hit Points ends zero-HP stabilization.",
      "end-stabilization-after-healing",
      [nextState.currentHitPoints],
      [restSources["death-saves"]],
    );
  }
  for (const field of ["deathSaveSuccesses", "deathSaveFailures"] as const) {
    recordChange(
      changes,
      traces,
      `state.${field}`,
      character.state[field],
      0,
      "Regaining Hit Points resets Death Saving Throw marks.",
      "reset-death-saves-after-healing",
      [character.state[field]],
      [restSources["death-saves"]],
    );
    nextState[field] = 0;
  }
}

function restoreShortRestSpellSlots(
  character: CharacterDocument,
  evaluation: ReturnType<typeof evaluateCharacter>,
  nextState: CharacterState,
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
): void {
  if (evaluation.spellcasting?.slotRecharge !== "short-rest") {
    return;
  }
  for (const slot of evaluation.spellcasting.slots) {
    if (slot.expended === 0) {
      continue;
    }
    const level = String(slot.level);
    nextState.expendedSpellSlots[level] = 0;
    recordChange(
      changes,
      traces,
      `state.expendedSpellSlots.${level}`,
      character.state.expendedSpellSlots[level] ?? 0,
      0,
      "A Short Rest restores all expended Pact Magic spell slots.",
      "restore-short-rest-spell-slots",
      [slot.expended, slot.level, slot.maximum],
      evaluation.traces[slot.traceId]?.sourceReferences ?? [restSources["short-rest"]],
    );
  }
}

function validateSpellSlotRecovery(
  request: z.infer<typeof restRequestSchema>,
  evaluation: ReturnType<typeof evaluateCharacter>,
  validations: ValidationMessage[],
): void {
  const sources = new Set<string>();
  const resourceUses = new Map<string, number>();
  const restored = new Map<number, number>();
  for (const selection of request.spellSlotRecoveries) {
    const definition = evaluation.spellSlotRecoveries?.find(
      ({ sourceId }) => sourceId === selection.sourceId,
    );
    if (
      request.event !== "short-rest" ||
      definition === undefined ||
      !definition.available ||
      sources.has(selection.sourceId)
    ) {
      validation(
        validations,
        "SPELL_SLOT_RECOVERY_UNAVAILABLE",
        "Choose a granted, unspent Short Rest recovery feature only once.",
        ["request.spellSlotRecoveries"],
      );
      continue;
    }
    sources.add(selection.sourceId);
    const uses = (resourceUses.get(definition.resourceId) ?? 0) + 1;
    resourceUses.set(definition.resourceId, uses);
    if (
      uses > (evaluation.resources.find(({ id }) => id === definition.resourceId)?.current ?? 0)
    ) {
      validation(
        validations,
        "SPELL_SLOT_RECOVERY_UNAVAILABLE",
        "The selected recoveries exceed their shared resource's remaining uses.",
        ["request.spellSlotRecoveries"],
      );
    }
    const total = selection.slots.reduce((sum, slot) => sum + slot.level * slot.count, 0);
    if (total > definition.maximumCombinedLevel) {
      validation(
        validations,
        "SPELL_SLOT_RECOVERY_BUDGET_EXCEEDED",
        `${definition.name} can recover only ${String(definition.maximumCombinedLevel)} combined slot levels.`,
        ["request.spellSlotRecoveries"],
      );
    }
    const levels = new Set<number>();
    for (const slot of selection.slots) {
      const current = evaluation.spellcasting?.slots.find(({ level }) => level === slot.level);
      const count = (restored.get(slot.level) ?? 0) + slot.count;
      restored.set(slot.level, count);
      if (
        evaluation.spellcasting?.slotRecharge === "short-rest" ||
        levels.has(slot.level) ||
        slot.level > definition.maximumSlotLevel ||
        current === undefined ||
        count > current.expended
      ) {
        validation(
          validations,
          "SPELL_SLOT_RECOVERY_SELECTION_INVALID",
          "Recover only eligible expended slots, without duplicate slot levels or over-recovery.",
          ["request.spellSlotRecoveries"],
        );
      }
      levels.add(slot.level);
    }
  }
}

function applySpellSlotRecovery(
  request: z.infer<typeof restRequestSchema>,
  evaluation: ReturnType<typeof evaluateCharacter>,
  nextState: CharacterState,
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
): void {
  interface RecoveryAmount {
    count: number;
    names: string[];
    sources: SourceReference[];
  }
  const slotAmounts = new Map<number, RecoveryAmount>();
  const resourceAmounts = new Map<string, RecoveryAmount>();
  for (const selection of request.spellSlotRecoveries) {
    const definition = evaluation.spellSlotRecoveries?.find(
      ({ sourceId }) => sourceId === selection.sourceId,
    );
    if (definition === undefined)
      throw new TypeError("Missing validated spell recovery definition.");
    for (const slot of selection.slots) {
      const previous = slotAmounts.get(slot.level);
      slotAmounts.set(slot.level, {
        count: (previous?.count ?? 0) + slot.count,
        names: [...(previous?.names ?? []), definition.name],
        sources: [...(previous?.sources ?? []), ...definition.sources],
      });
    }
    const previous = resourceAmounts.get(definition.resourceId);
    resourceAmounts.set(definition.resourceId, {
      count: (previous?.count ?? 0) + 1,
      names: [...(previous?.names ?? []), definition.name],
      sources: [...(previous?.sources ?? []), ...definition.sources],
    });
  }
  for (const [level, amount] of slotAmounts) {
    const key = String(level);
    const before = nextState.expendedSpellSlots[key] ?? 0;
    const after = before - amount.count;
    nextState.expendedSpellSlots[key] = after;
    recordChange(
      changes,
      traces,
      `state.expendedSpellSlots.${key}`,
      before,
      after,
      `${amount.names.join(" and ")} restores ${String(amount.count)} level ${key} spell slot(s).`,
      "recover-selected-spell-slots",
      [before, amount.count, level],
      amount.sources,
    );
  }
  for (const [resourceId, amount] of resourceAmounts) {
    const before = nextState.expendedResources[resourceId] ?? 0;
    nextState.expendedResources[resourceId] = before + amount.count;
    recordChange(
      changes,
      traces,
      `state.expendedResources.${resourceId}`,
      before,
      before + amount.count,
      `${amount.names.join(" and ")} expends its slot recovery use.`,
      "expend-spell-slot-recovery",
      [before, amount.count],
      amount.sources,
    );
  }
}

function proposeShortRest(
  character: CharacterDocument,
  request: z.infer<typeof restRequestSchema>,
  spending: ValidatedHitDieSpend[],
  evaluation: ReturnType<typeof evaluateCharacter>,
  nextState: CharacterState,
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
): void {
  const constitutionModifier = evaluation.values["ability.constitution.modifier"]?.value;
  const maximumHitPoints = evaluation.values["hitPoints.maximum"]?.value;
  if (typeof constitutionModifier !== "number" || typeof maximumHitPoints !== "number") {
    return;
  }
  const totalHealing = spending.reduce(
    (total, spend) =>
      total +
      spend.rolls.reduce(
        (classTotal, roll) => classTotal + Math.max(1, roll + constitutionModifier),
        0,
      ),
    0,
  );
  const healedHitPoints = Math.min(
    maximumHitPoints,
    character.state.currentHitPoints + totalHealing,
  );
  if (totalHealing > 0) {
    nextState.currentHitPoints = healedHitPoints;
    recordChange(
      changes,
      traces,
      "state.currentHitPoints",
      character.state.currentHitPoints,
      healedHitPoints,
      "Spent Hit Dice restore Hit Points.",
      "spend-hit-dice-for-healing",
      [
        character.state.currentHitPoints,
        constitutionModifier,
        ...request.hitDice.flatMap((spend) => spend.rolls),
      ],
      [restSources["short-rest"]],
    );
    resetDeathSavesAfterHealing(character, nextState, changes, traces);
  }
  for (const spend of spending) {
    const before = character.state.expendedHitDice[spend.classId] ?? 0;
    const after = before + spend.rolls.length;
    nextState.expendedHitDice[spend.classId] = after;
    recordChange(
      changes,
      traces,
      `state.expendedHitDice.${spend.classId}`,
      before,
      after,
      `Spent ${String(spend.rolls.length)} ${spend.classId} Hit Dice.`,
      "expend-hit-dice",
      [before, spend.rolls.length, spend.hitPointDie],
      [restSources["short-rest"]],
    );
  }
  resourceRecharge("short-rest", character, evaluation, nextState, changes, traces);
  restoreShortRestSpellSlots(character, evaluation, nextState, changes, traces);
}

function proposeLongRest(
  character: CharacterDocument,
  evaluation: ReturnType<typeof evaluateCharacter>,
  nextState: CharacterState,
  changes: StateChange[],
  traces: Record<string, CalculationTrace>,
): void {
  const maximumHitPoints = evaluation.values["hitPoints.maximum"]?.value;
  if (typeof maximumHitPoints === "number") {
    nextState.currentHitPoints = maximumHitPoints;
    recordChange(
      changes,
      traces,
      "state.currentHitPoints",
      character.state.currentHitPoints,
      maximumHitPoints,
      "A Long Rest restores all lost Hit Points.",
      "restore-all-hit-points",
      [character.state.currentHitPoints, maximumHitPoints],
      [restSources["long-rest"]],
    );
    if (maximumHitPoints > character.state.currentHitPoints) {
      resetDeathSavesAfterHealing(character, nextState, changes, traces);
    }
  }
  for (const [classId, expended] of Object.entries(character.state.expendedHitDice)) {
    nextState.expendedHitDice[classId] = 0;
    recordChange(
      changes,
      traces,
      `state.expendedHitDice.${classId}`,
      expended,
      0,
      "A Long Rest restores all spent Hit Dice.",
      "restore-all-hit-dice",
      [expended],
      [restSources["long-rest"]],
    );
  }
  for (const [level, expended] of Object.entries(character.state.expendedSpellSlots)) {
    const slotTraceId = evaluation.spellcasting?.slots.find(
      (slot) => slot.level === Number(level),
    )?.traceId;
    nextState.expendedSpellSlots[level] = 0;
    recordChange(
      changes,
      traces,
      `state.expendedSpellSlots.${level}`,
      expended,
      0,
      "A Long Rest restores all expended spell slots.",
      "restore-all-spell-slots",
      [expended, Number(level)],
      (slotTraceId === undefined
        ? undefined
        : evaluation.traces[slotTraceId]?.sourceReferences) ?? [restSources["long-rest"]],
    );
  }
  nextState.temporaryHitPoints = 0;
  recordChange(
    changes,
    traces,
    "state.temporaryHitPoints",
    character.state.temporaryHitPoints,
    0,
    "Temporary Hit Points expire when a Long Rest finishes.",
    "expire-temporary-hit-points",
    [character.state.temporaryHitPoints],
    [restSources["temporary-hit-points"]],
  );
  const exhaustion = Math.max(0, character.state.exhaustion - 1);
  nextState.exhaustion = exhaustion;
  recordChange(
    changes,
    traces,
    "state.exhaustion",
    character.state.exhaustion,
    exhaustion,
    "A Long Rest reduces Exhaustion by 1.",
    "reduce-exhaustion",
    [character.state.exhaustion, 1],
    [restSources["long-rest"]],
  );
  if (character.state.concentrationSpellId !== undefined) {
    delete nextState.concentrationSpellId;
    recordChange(
      changes,
      traces,
      "state.concentrationSpellId",
      character.state.concentrationSpellId,
      null,
      "Sleeping during a Long Rest ends Concentration.",
      "end-concentration",
      [character.state.concentrationSpellId],
      [restSources["long-rest"]],
    );
  }
  if (evaluation.facts["species.longRestGrantsHeroicInspiration"] === true) {
    nextState.heroicInspiration = true;
    recordChange(
      changes,
      traces,
      "state.heroicInspiration",
      character.state.heroicInspiration,
      true,
      "Resourceful grants Heroic Inspiration after a Long Rest.",
      "grant-heroic-inspiration",
      [character.state.heroicInspiration],
      evaluation.traces["species.longRestGrantsHeroicInspiration"]?.sourceReferences ?? [
        restSources["long-rest"],
      ],
    );
  }
  resourceRecharge("long-rest", character, evaluation, nextState, changes, traces);
}

export function proposeRest(
  input: EvaluateCharacterInput,
  unparsedRequest: RestRequest,
): StateTransitionProposal {
  const character = characterDocumentSchema.parse(input.character);
  const request = restRequestSchema.parse(unparsedRequest);
  const originalState = cloneState(character.state);
  const validations: ValidationMessage[] = [];
  if (deathSaveStatus(character.state) === "dead")
    validation(
      validations,
      "DEAD_CHARACTER_REST",
      "A rest cannot revive a dead character. Resolve revival explicitly.",
      ["state.deathSaveFailures"],
    );
  const nextBuild = structuredClone(character.build);
  const choiceChanges: { path: string; before: string[]; after: string[]; sourceId: string }[] = [];
  const seen = new Set<string>();
  for (const replacement of request.featureChoiceReplacements) {
    const definition = featureOptionChoices(input.packages).find(
      ({ choice }) => choice.id === replacement.choiceId,
    );
    const records = nextBuild.levels.flatMap((level, index) =>
      level.selectedFeatureChoices.flatMap((choice, selectionIndex) =>
        choice.choiceId === replacement.choiceId ? [{ choice, index, selectionIndex }] : [],
      ),
    );
    if (
      seen.has(replacement.choiceId) ||
      !definition?.choice.changeOn?.includes(request.event) ||
      records.length !== 1
    ) {
      validation(
        validations,
        "REST_FEATURE_CHOICE_INVALID",
        "Only an acquired, rest-replaceable feature option can be changed once per rest.",
        ["request.featureChoiceReplacements"],
      );
      continue;
    }
    seen.add(replacement.choiceId);
    const record = records[0];
    if (record === undefined || definition.choice.optionSelection === undefined) continue;
    choiceChanges.push({
      path: `build.levels.${String(record.index)}.selectedFeatureChoices.${String(record.selectionIndex)}.optionIds`,
      before: [...record.choice.optionIds],
      after: [...replacement.optionIds],
      sourceId: definition.choice.optionSelection.sourceFeatureId,
    });
    record.choice.optionIds = [...replacement.optionIds];
  }
  if (request.featureChoiceReplacements.length > 0) {
    validations.push(...validateFeatureOptionChoices(character, input.packages));
    validations.push(
      ...validateFeatureOptionChoices({ ...character, build: nextBuild }, input.packages),
    );
  }
  if (character.state.currentHitPoints < 1) {
    validation(
      validations,
      "REST_REQUIRES_POSITIVE_HIT_POINTS",
      "A Short or Long Rest requires at least 1 Hit Point to start.",
      ["state.currentHitPoints"],
    );
  }
  const spending = validateHitDieSpending(input, character, request, validations);
  const evaluation = evaluateCharacter({ ...input, character });
  validateSpellSlotRecovery(request, evaluation, validations);
  if (validations.some((message) => message.severity === "error")) {
    return {
      kind: "rest",
      event: request.event,
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
  for (const change of choiceChanges) {
    const source = input.packages
      .flatMap((pack) => pack.entities)
      .find((entity) => entity.id === change.sourceId);
    recordChange(
      changes,
      traces,
      change.path,
      change.before,
      change.after,
      "Replace a feature option after completing the rest.",
      "replace-feature-option-on-rest",
      [request.event, ...change.before],
      source?.source.map((span) => ({
        entityId: source.id,
        sourceId: span.sourceId,
        ...(isEditionReferenceSpan(span) ? {} : { page: span.page }),
      })) ?? [],
    );
  }
  const expiringStatuses = input.packages
    .flatMap((pack) => pack.entities)
    .filter(
      (entity) =>
        entity.kind === "status" &&
        z.object({ endsOnRest: z.literal(true) }).safeParse(entity.body).success &&
        character.state.activeEffectIds.includes(entity.id),
    );
  if (expiringStatuses.length > 0) {
    const ended = new Set(expiringStatuses.map(({ id }) => id));
    nextState.activeEffectIds = nextState.activeEffectIds.filter((id) => !ended.has(id));
    recordChange(
      changes,
      traces,
      "state.activeEffectIds",
      character.state.activeEffectIds,
      nextState.activeEffectIds,
      "Rest ends short-duration feature statuses.",
      "expire-statuses-on-rest",
      [...ended],
      expiringStatuses.flatMap((entity) =>
        entity.source.map((span) => ({
          entityId: entity.id,
          sourceId: span.sourceId,
          ...(isEditionReferenceSpan(span) ? {} : { page: span.page }),
        })),
      ),
    );
  }
  if (request.event === "short-rest") {
    proposeShortRest(character, request, spending, evaluation, nextState, changes, traces);
    applySpellSlotRecovery(request, evaluation, nextState, changes, traces);
  } else {
    proposeLongRest(character, evaluation, nextState, changes, traces);
  }
  return {
    kind: "rest",
    event: request.event,
    applicable: true,
    changes,
    nextState,
    ...(request.featureChoiceReplacements.length > 0 ? { nextBuild } : {}),
    validations,
    traces,
  };
}
