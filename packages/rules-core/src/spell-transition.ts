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

const spellCastRequestSchema = z
  .object({
    spellId: z.string().min(1),
    slotLevel: z.number().int().min(1).max(9).optional(),
    asRitual: z.boolean().default(false),
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
  if (spell === undefined) {
    addValidation(
      validations,
      "SPELL_NOT_KNOWN",
      `${request.spellId} is not known by this character.`,
      ["request.spellId"],
    );
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
  if (spell.level > 0 && !request.asRitual && request.slotLevel !== undefined) {
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
  return {
    kind: "spell-cast",
    spellId: request.spellId,
    applicable: true,
    changes,
    nextState,
    validations: [],
    traces,
  };
}
