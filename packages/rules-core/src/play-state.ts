import type { CharacterDocument, CharacterState, CurrencyDenomination } from "@dnd/character-model";
import { deathSaveStatus } from "./death-saving-throws.js";
import { healCharacterState } from "./hit-point-healing.js";

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

export function commitCharacterState(
  character: CharacterDocument,
  state: CharacterState,
  updatedAt = new Date(),
): CharacterDocument {
  return {
    ...character,
    state,
    metadata: {
      ...character.metadata,
      updatedAt: updatedAt.toISOString(),
      revision: character.metadata.revision + 1,
    },
  };
}

export function applyDamage(
  character: CharacterDocument,
  amount: number,
  updatedAt?: Date,
  options: {
    maximumHitPoints?: number;
    critical?: boolean;
    concentrationEffectIds?: readonly string[];
    dropToOneEffectId?: string;
  } = {},
): CharacterDocument {
  const damage = nonNegativeInteger(amount);
  const absorbed = Math.min(character.state.temporaryHitPoints, damage);
  const remaining = damage - absorbed;
  const state = {
    ...character.state,
    temporaryHitPoints: character.state.temporaryHitPoints - absorbed,
    currentHitPoints: Math.max(0, character.state.currentHitPoints - remaining),
  };
  const protectedState = protectDropToZero(character.state, state, options.dropToOneEffectId);
  if (protectedState !== undefined)
    return commitCharacterState(character, protectedState, updatedAt);
  const previousStatus = deathSaveStatus(character.state);
  if (previousStatus === "dead") state.dead = true;
  else if (character.state.currentHitPoints > 0 && state.currentHitPoints === 0) {
    // Legacy sheets may retain marks after old healing workflows. A new fall starts afresh.
    state.deathSaveSuccesses = 0;
    state.deathSaveFailures = 0;
  }
  if (state.currentHitPoints === 0) {
    Object.assign(state, withoutActiveEffects(state, options.concentrationEffectIds ?? []));
    delete state.concentrationSpellId;
    if (character.state.currentHitPoints > 0 && character.state.stableAtZeroHitPoints !== undefined)
      state.stableAtZeroHitPoints = false;
  }
  if (damage > 0 && character.state.currentHitPoints === 0) {
    state.stableAtZeroHitPoints = false;
    state.deathSaveSuccesses = previousStatus === "stable" ? 0 : character.state.deathSaveSuccesses;
    state.deathSaveFailures = Math.min(
      3,
      (previousStatus === "stable" ? 0 : state.deathSaveFailures) + (options.critical ? 2 : 1),
    );
    if (state.deathSaveFailures >= 3) state.dead = true;
  }
  if (
    options.maximumHitPoints !== undefined &&
    state.currentHitPoints === 0 &&
    (options.maximumHitPoints <= 0 ||
      (character.state.currentHitPoints === 0
        ? damage
        : remaining - character.state.currentHitPoints) >= options.maximumHitPoints)
  )
    state.dead = true;
  return commitCharacterState(character, state, updatedAt);
}

export function applyHealing(
  character: CharacterDocument,
  amount: number,
  maximumHitPoints: number,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    healCharacterState(character.state, amount, maximumHitPoints),
    updatedAt,
  );
}

export function setTemporaryHitPoints(
  character: CharacterDocument,
  amount: number,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    { ...character.state, temporaryHitPoints: nonNegativeInteger(amount) },
    updatedAt,
  );
}

export function setHeroicInspiration(
  character: CharacterDocument,
  heroicInspiration: boolean,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(character, { ...character.state, heroicInspiration }, updatedAt);
}

export function setExhaustion(
  character: CharacterDocument,
  exhaustion: number,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    {
      ...character.state,
      exhaustion: Math.min(6, nonNegativeInteger(exhaustion)),
      ...(nonNegativeInteger(exhaustion) >= 6 || deathSaveStatus(character.state) === "dead"
        ? { dead: true }
        : {}),
    },
    updatedAt,
  );
}

export function clearConcentration(
  character: CharacterDocument,
  updatedAt?: Date,
): CharacterDocument {
  const state = { ...character.state };
  delete state.concentrationSpellId;
  return commitCharacterState(character, state, updatedAt);
}

function withoutActiveEffects(state: CharacterState, effectIds: readonly string[]): CharacterState {
  const ending = new Set(effectIds);
  return {
    ...state,
    activeEffectIds: state.activeEffectIds.filter((id) => !ending.has(id)),
    activeEffectSelections: Object.fromEntries(
      Object.entries(state.activeEffectSelections).filter(([id]) => !ending.has(id)),
    ),
    activeEffectParameters: Object.fromEntries(
      Object.entries(state.activeEffectParameters).filter(([id]) => !ending.has(id)),
    ),
  };
}

export function endActiveEffects(
  character: CharacterDocument,
  effectIds: readonly string[],
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    withoutActiveEffects(character.state, effectIds),
    updatedAt,
  );
}

export function clearConcentrationAndEffects(
  character: CharacterDocument,
  effectIds: readonly string[],
  updatedAt?: Date,
): CharacterDocument {
  const state = withoutActiveEffects(character.state, effectIds);
  delete state.concentrationSpellId;
  return commitCharacterState(character, state, updatedAt);
}

function setStateIdActive(values: readonly string[], id: string, active: boolean): string[] {
  return active ? [...new Set([...values, id])] : values.filter((value) => value !== id);
}

export function setConditionActive(
  character: CharacterDocument,
  conditionId: string,
  active: boolean,
  updatedAt?: Date,
  breaksConcentration = false,
): CharacterDocument {
  const state = {
    ...character.state,
    conditionIds: setStateIdActive(character.state.conditionIds, conditionId, active),
  };
  if (active && breaksConcentration) delete state.concentrationSpellId;
  return commitCharacterState(character, state, updatedAt);
}

export function setActiveEffectActive(
  character: CharacterDocument,
  effectId: string,
  active: boolean,
  updatedAt?: Date,
): CharacterDocument {
  const activeEffectSelections = active
    ? { ...character.state.activeEffectSelections }
    : Object.fromEntries(
        Object.entries(character.state.activeEffectSelections).filter(([id]) => id !== effectId),
      );
  const activeEffectParameters = active
    ? { ...character.state.activeEffectParameters }
    : Object.fromEntries(
        Object.entries(character.state.activeEffectParameters).filter(([id]) => id !== effectId),
      );
  return commitCharacterState(
    character,
    {
      ...character.state,
      activeEffectIds: setStateIdActive(character.state.activeEffectIds, effectId, active),
      activeEffectSelections,
      activeEffectParameters,
    },
    updatedAt,
  );
}

export function setActiveEffectSelection(
  character: CharacterDocument,
  effectId: string,
  selection: string,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    {
      ...character.state,
      activeEffectSelections: {
        ...character.state.activeEffectSelections,
        [effectId]: selection,
      },
    },
    updatedAt,
  );
}

export function setActiveEffectParameter(
  character: CharacterDocument,
  effectId: string,
  parameter: string,
  value: string,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    {
      ...character.state,
      activeEffectParameters: {
        ...character.state.activeEffectParameters,
        [effectId]: {
          ...character.state.activeEffectParameters[effectId],
          [parameter]: value,
        },
      },
    },
    updatedAt,
  );
}

export function setActiveEffectWithHitPointBonus(
  character: CharacterDocument,
  effectId: string,
  active: boolean,
  hitPointBonus: number,
  selection: string,
  updatedAt?: Date,
  dropToOneEffectId?: string,
): CharacterDocument {
  if (active && deathSaveStatus(character.state) === "dead") return character;
  if (character.state.activeEffectIds.includes(effectId) === active) return character;
  const adjusted = adjustStatusHitPoints(
    character.state,
    active ? hitPointBonus : -hitPointBonus,
    dropToOneEffectId,
  );
  const state = active ? adjusted : withoutActiveEffects(adjusted, [effectId]);
  return commitCharacterState(
    character,
    {
      ...state,
      activeEffectIds: setStateIdActive(state.activeEffectIds, effectId, active),
      activeEffectSelections: active
        ? { ...state.activeEffectSelections, [effectId]: selection }
        : state.activeEffectSelections,
    },
    updatedAt,
  );
}

function protectDropToZero(
  previous: CharacterState,
  next: CharacterState,
  effectId: string | undefined,
): CharacterState | undefined {
  if (
    effectId === undefined ||
    !previous.activeEffectIds.includes(effectId) ||
    previous.currentHitPoints === 0 ||
    next.currentHitPoints !== 0 ||
    deathSaveStatus(previous) === "dead"
  )
    return undefined;
  return {
    ...withoutActiveEffects(next, [effectId]),
    currentHitPoints: 1,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    ...(next.stableAtZeroHitPoints === undefined ? {} : { stableAtZeroHitPoints: false }),
  };
}

function adjustStatusHitPoints(
  state: CharacterState,
  amount: number,
  dropToOneEffectId?: string,
): CharacterState {
  if (deathSaveStatus(state) === "dead") return state;
  const currentHitPoints = Math.max(0, state.currentHitPoints + amount);
  const next = { ...state, currentHitPoints };
  const protectedState = protectDropToZero(state, next, dropToOneEffectId);
  if (protectedState !== undefined) return protectedState;
  if ((state.currentHitPoints === 0) !== (currentHitPoints === 0)) {
    next.deathSaveSuccesses = 0;
    next.deathSaveFailures = 0;
    if (next.stableAtZeroHitPoints !== undefined) next.stableAtZeroHitPoints = false;
    if (currentHitPoints === 0) delete next.concentrationSpellId;
  }
  return next;
}

export function setActiveEffectSelectionWithHitPointAdjustment(
  character: CharacterDocument,
  effectId: string,
  selection: string,
  hitPointAdjustment: number,
  updatedAt?: Date,
  dropToOneEffectId?: string,
): CharacterDocument {
  const state = adjustStatusHitPoints(character.state, hitPointAdjustment, dropToOneEffectId);
  return commitCharacterState(
    character,
    {
      ...state,
      activeEffectSelections: {
        ...state.activeEffectSelections,
        [effectId]: selection,
      },
    },
    updatedAt,
  );
}

export function setCurrency(
  character: CharacterDocument,
  denomination: CurrencyDenomination,
  amount: number,
  updatedAt = new Date(),
): CharacterDocument {
  return {
    ...character,
    loadout: {
      ...character.loadout,
      currency: {
        ...character.loadout.currency,
        [denomination]: nonNegativeInteger(amount),
      },
    },
    metadata: {
      ...character.metadata,
      updatedAt: updatedAt.toISOString(),
      revision: character.metadata.revision + 1,
    },
  };
}
