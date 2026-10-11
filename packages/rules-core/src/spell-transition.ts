import { z } from "zod";

import type { CalculationTrace, JsonValue } from "@dnd/calculation-trace";
import { characterDocumentSchema, type CharacterState } from "@dnd/character-model";
import type {
  EvaluateCharacterInput,
  SpellCastRequest,
  SpellCastTransitionProposal,
  StateChange,
  ValidationMessage,
} from "@dnd/rules-api";

import { evaluateCharacter } from "./character-evaluator.js";
import { deathSaveStatus, deathSavingThrowSources } from "./death-saving-throws.js";

const spellCastRequestSchema = z
  .object({
    spellId: z.string().min(1),
    slotLevel: z.number().int().min(1).max(9).optional(),
    asRitual: z.boolean().default(false),
    castingSourceId: z.string().min(1).optional(),
    useFreeCast: z.boolean().default(false),
    restoresHitPointsToOther: z.boolean().default(false),
    protectedCreatureCount: z.number().int().nonnegative().default(0),
  })
  .strict();

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
  sourceReferences: CalculationTrace["sourceReferences"],
): void {
  if (before === after) {
    return;
  }
  const traceId = `transition.spell-cast.${path}`;
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
    sourceReferences,
  };
}

export function proposeSpellCast(
  input: EvaluateCharacterInput,
  unparsedRequest: SpellCastRequest,
): SpellCastTransitionProposal {
  const character = characterDocumentSchema.parse(input.character);
  const request = spellCastRequestSchema.parse(unparsedRequest);
  const evaluation = evaluateCharacter({ ...input, character });
  const spell = evaluation.spells.find((candidate) => candidate.id === request.spellId);
  const originalState = cloneState(character.state);
  const validations: ValidationMessage[] = [];
  if (evaluation.facts["condition.incapacitated.active"] === true)
    addValidation(
      validations,
      "INCAPACITATED_CHARACTER_CAST",
      "An incapacitated character cannot take the action or Reaction required to cast a spell.",
      ["state.currentHitPoints", "state.conditionIds"],
    );
  if (deathSaveStatus(character.state) === "dead")
    addValidation(
      validations,
      "DEAD_CHARACTER_CAST",
      "A dead character cannot cast spells. Resolve revival explicitly.",
      ["state.deathSaveFailures"],
    );
  const protection = evaluation.spellProtections?.find((effect) => effect.school === spell?.school);
  const castingLevel =
    request.useFreeCast || request.asRitual
      ? (spell?.level ?? 0)
      : (request.slotLevel ?? spell?.level ?? 0);
  const maximumCreatures =
    protection === undefined ? 0 : castingLevel + protection.additionalTargets;
  if (
    request.protectedCreatureCount > 0 &&
    (protection === undefined || request.protectedCreatureCount > maximumCreatures)
  ) {
    addValidation(
      validations,
      "SPELL_PROTECTION_UNAVAILABLE",
      "The selected spell protection is unavailable or exceeds its creature limit.",
      ["request.protectedCreatureCount"],
    );
  }
  const castingOption =
    spell === undefined
      ? undefined
      : request.castingSourceId === undefined
        ? request.useFreeCast
          ? spell.castingOptions?.find((option) => option.freeCastResourceId !== undefined)
          : spell.castingOptions?.[0]
        : spell.castingOptions?.find((option) => option.sourceId === request.castingSourceId);
  if (evaluation.facts["actions.disabled"] === true) {
    addValidation(
      validations,
      "SPELL_CAST_PREVENTED_BY_CONDITION",
      "An active condition prevents the character from casting spells.",
      ["character.state.conditionIds"],
    );
  }
  if (spell === undefined) {
    addValidation(
      validations,
      "SPELL_NOT_KNOWN",
      `${request.spellId} is not known by this character.`,
      ["request.spellId"],
    );
  } else if (request.castingSourceId !== undefined && castingOption === undefined) {
    addValidation(
      validations,
      "SPELL_CASTING_SOURCE_UNAVAILABLE",
      `${request.castingSourceId} cannot cast ${request.spellId}.`,
      ["request.castingSourceId"],
    );
  } else if (request.useFreeCast) {
    if (spell.level === 0) {
      addValidation(
        validations,
        "CANTRIP_DOES_NOT_USE_FREE_CAST",
        `${request.spellId} is a cantrip and does not expend a free casting.`,
        ["request.useFreeCast"],
      );
    }
    if (request.asRitual) {
      addValidation(
        validations,
        "RITUAL_DOES_NOT_USE_FREE_CAST",
        "A ritual casting does not expend a free casting.",
        ["request.useFreeCast", "request.asRitual"],
      );
    }
    if (request.slotLevel !== undefined) {
      addValidation(
        validations,
        "FREE_CAST_DOES_NOT_USE_SLOT",
        "A free casting does not expend a spell slot.",
        ["request.slotLevel", "request.useFreeCast"],
      );
    }
    if (castingOption?.freeCastResourceId === undefined) {
      addValidation(
        validations,
        "SPELL_FREE_CAST_UNAVAILABLE",
        `${request.spellId} has no free casting from the selected source.`,
        ["request.useFreeCast"],
      );
    } else {
      const resource = evaluation.resources.find(
        (candidate) => candidate.id === castingOption.freeCastResourceId,
      );
      if (resource === undefined || resource.current < 1) {
        addValidation(
          validations,
          "SPELL_FREE_CAST_EXPENDED",
          `The free casting of ${request.spellId} has already been expended.`,
          ["request.useFreeCast"],
        );
      }
    }
  } else if (spell.level === 0 && request.slotLevel !== undefined) {
    addValidation(
      validations,
      "CANTRIP_DOES_NOT_USE_SLOT",
      `${request.spellId} is a cantrip and does not expend a spell slot.`,
      ["request.slotLevel"],
    );
  } else if (spell.level > 0 && request.asRitual) {
    if (!spell.ritual) {
      addValidation(
        validations,
        "SPELL_IS_NOT_RITUAL",
        `${request.spellId} does not have the Ritual tag.`,
        ["request.asRitual"],
      );
    }
    if (request.slotLevel !== undefined) {
      addValidation(
        validations,
        "RITUAL_DOES_NOT_USE_SLOT",
        "A ritual casting does not expend a spell slot.",
        ["request.slotLevel"],
      );
    }
  } else if (spell.level > 0) {
    if (!spell.prepared) {
      addValidation(validations, "SPELL_NOT_PREPARED", `${request.spellId} is not prepared.`, [
        "request.spellId",
      ]);
    }
    if (request.slotLevel === undefined || request.slotLevel < spell.level) {
      addValidation(
        validations,
        "SPELL_SLOT_LEVEL_INVALID",
        `${request.spellId} requires a spell slot of level ${String(spell.level)} or higher.`,
        ["request.slotLevel"],
      );
    } else {
      const slot = evaluation.spellcasting?.slots.find(
        (candidate) => candidate.level === request.slotLevel,
      );
      if (slot === undefined || slot.current < 1) {
        addValidation(
          validations,
          "SPELL_SLOT_UNAVAILABLE",
          `No level ${String(request.slotLevel)} spell slot is available.`,
          ["request.slotLevel"],
        );
      }
    }
  }
  if (validations.length > 0 || spell === undefined) {
    return {
      kind: "spell-cast",
      spellId: request.spellId,
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
  const traceId = "transition.spell-cast.protection.maximumCreatures";
  if (request.protectedCreatureCount > 0 && protection !== undefined) {
    traces[traceId] = {
      id: traceId,
      result: maximumCreatures,
      nodes: [
        {
          id: `${traceId}.calculate`,
          operation: "spell-level-plus-additional-targets",
          inputs: [castingLevel, protection.additionalTargets],
          output: maximumCreatures,
        },
      ],
      sourceReferences: protection.sources,
    };
  }
  if (request.useFreeCast && castingOption?.freeCastResourceId !== undefined) {
    const resourceId = castingOption.freeCastResourceId;
    const before = character.state.expendedResources[resourceId] ?? 0;
    const after = before + 1;
    nextState.expendedResources[resourceId] = after;
    recordChange(
      changes,
      traces,
      `state.expendedResources.${resourceId}`,
      before,
      after,
      `${request.spellId} expends its free casting.`,
      "expend-free-spell-cast",
      [before, resourceId],
      spell.sources,
    );
  } else if (spell.level > 0 && !request.asRitual && request.slotLevel !== undefined) {
    const before = character.state.expendedSpellSlots[String(request.slotLevel)] ?? 0;
    const after = before + 1;
    nextState.expendedSpellSlots[String(request.slotLevel)] = after;
    recordChange(
      changes,
      traces,
      `state.expendedSpellSlots.${String(request.slotLevel)}`,
      before,
      after,
      `${request.spellId} expends a level ${String(request.slotLevel)} spell slot.`,
      "expend-spell-slot",
      [before, request.slotLevel, spell.level],
      spell.sources,
    );
  }
  if (spell.concentration) {
    const before = character.state.concentrationSpellId ?? null;
    nextState.concentrationSpellId = spell.id;
    recordChange(
      changes,
      traces,
      "state.concentrationSpellId",
      before,
      spell.id,
      `Casting ${request.spellId} starts Concentration and ends any previous Concentration.`,
      "start-concentration",
      [before, spell.id],
      spell.sources,
    );
  }
  if (
    request.restoresHitPointsToOther &&
    (spell.healing?.length ?? 0) > 0 &&
    !request.useFreeCast &&
    !request.asRitual &&
    request.slotLevel !== undefined
  ) {
    for (const effect of evaluation.spellHealingEffects ?? []) {
      if (effect.target !== "caster-after-healing-other") continue;
      const maximum = evaluation.values["hitPoints.maximum"]?.value;
      if (typeof maximum !== "number") throw new TypeError("Spell healing requires maximum HP.");
      const before = nextState.currentHitPoints;
      const amount = effect.base + effect.perSlotLevel * request.slotLevel;
      const after = Math.min(maximum, before + amount);
      nextState.currentHitPoints = after;
      recordChange(
        changes,
        traces,
        "state.currentHitPoints",
        before,
        after,
        `${effect.sourceName} restores ${String(after - before)} Hit Points after healing another creature.`,
        "heal-caster-after-healing-other",
        [before, amount, maximum, request.slotLevel],
        effect.sources,
      );
      if (after > before) {
        for (const field of [
          "deathSaveSuccesses",
          "deathSaveFailures",
          "stableAtZeroHitPoints",
        ] as const) {
          const previous = nextState[field];
          if (previous === undefined) continue;
          const next = field === "stableAtZeroHitPoints" ? false : 0;
          if (field === "stableAtZeroHitPoints") nextState[field] = false;
          else nextState[field] = 0;
          recordChange(
            changes,
            traces,
            `state.${field}`,
            previous,
            next,
            "Regaining Hit Points resets death saving throws and ends stability.",
            "reset-death-saves-after-healing",
            [previous, before, after],
            deathSavingThrowSources,
          );
        }
      }
    }
  }
  return {
    kind: "spell-cast",
    spellId: request.spellId,
    applicable: true,
    ...(request.protectedCreatureCount > 0 && protection !== undefined
      ? {
          protection: {
            ...protection,
            creatureCount: request.protectedCreatureCount,
            maximumCreatures,
            traceId,
          },
        }
      : {}),
    changes,
    nextState,
    validations: [],
    traces,
  };
}
