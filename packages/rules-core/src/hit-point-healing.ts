import type { CharacterState } from "@dnd/character-model";

import { deathSaveStatus } from "./death-saving-throws.js";

function nonNegativeInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

export function healCharacterState(
  state: CharacterState,
  amount: number,
  maximumHitPoints: number,
): CharacterState {
  if (deathSaveStatus(state) === "dead")
    throw new TypeError("Ordinary healing cannot revive a dead character.");
  const currentHitPoints = Math.min(
    nonNegativeInteger(maximumHitPoints),
    state.currentHitPoints + nonNegativeInteger(amount),
  );
  return {
    ...state,
    currentHitPoints,
    ...(currentHitPoints > state.currentHitPoints
      ? {
          deathSaveSuccesses: 0,
          deathSaveFailures: 0,
          ...(state.stableAtZeroHitPoints === undefined ? {} : { stableAtZeroHitPoints: false }),
        }
      : {}),
  };
}
