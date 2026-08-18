import type { CharacterDocument, CharacterState, CurrencyDenomination } from "@dnd/character-model";

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
): CharacterDocument {
  const damage = nonNegativeInteger(amount);
  const absorbed = Math.min(character.state.temporaryHitPoints, damage);
  const remaining = damage - absorbed;
  return commitCharacterState(
    character,
    {
      ...character.state,
      temporaryHitPoints: character.state.temporaryHitPoints - absorbed,
      currentHitPoints: Math.max(0, character.state.currentHitPoints - remaining),
    },
    updatedAt,
  );
}

export function applyHealing(
  character: CharacterDocument,
  amount: number,
  maximumHitPoints: number,
  updatedAt?: Date,
): CharacterDocument {
  const healing = nonNegativeInteger(amount);
  return commitCharacterState(
    character,
    {
      ...character.state,
      currentHitPoints: Math.min(
        nonNegativeInteger(maximumHitPoints),
        character.state.currentHitPoints + healing,
      ),
    },
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
    { ...character.state, exhaustion: Math.min(6, nonNegativeInteger(exhaustion)) },
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
  return commitCharacterState(
    character,
    {
      ...character.state,
      activeEffectIds: setStateIdActive(character.state.activeEffectIds, effectId, active),
      activeEffectSelections,
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

export function setActiveEffectWithHitPointBonus(
  character: CharacterDocument,
  effectId: string,
  active: boolean,
  hitPointBonus: number,
  selection: string,
  updatedAt?: Date,
): CharacterDocument {
  const selections = Object.fromEntries(
    Object.entries(character.state.activeEffectSelections).filter(([id]) => id !== effectId),
  );
  if (active) selections[effectId] = selection;
  return commitCharacterState(
    character,
    {
      ...character.state,
      currentHitPoints: Math.max(
        0,
        character.state.currentHitPoints + (active ? hitPointBonus : -hitPointBonus),
      ),
      activeEffectIds: setStateIdActive(character.state.activeEffectIds, effectId, active),
      activeEffectSelections: selections,
    },
    updatedAt,
  );
}

export function setActiveEffectSelectionWithHitPointAdjustment(
  character: CharacterDocument,
  effectId: string,
  selection: string,
  hitPointAdjustment: number,
  updatedAt?: Date,
): CharacterDocument {
  return commitCharacterState(
    character,
    {
      ...character.state,
      currentHitPoints: Math.max(0, character.state.currentHitPoints + hitPointAdjustment),
      activeEffectSelections: {
        ...character.state.activeEffectSelections,
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
