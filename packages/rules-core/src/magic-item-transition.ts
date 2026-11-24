import type { CharacterDocument } from "@dnd/character-model";
import type { EvaluateCharacterInput } from "@dnd/rules-api";
import { evaluateCharacter } from "./character-evaluator.js";
import { deathSaveStatus } from "./death-saving-throws.js";
import { healCharacterState } from "./hit-point-healing.js";
import { consumeInventoryUnit, withoutInventoryItem } from "./inventory-consumption.js";

type MagicItemUse =
  | { mode: "cast"; itemId: string; charges?: number; lastChargeRoll?: number }
  | { mode: "dawn"; itemId: string; roll: number }
  | { mode: "toggle"; itemId: string }
  | { mode: "elapse"; itemId: string; rounds: number }
  | { mode: "consume"; itemId: string; target: "self" | "other"; rolls: readonly number[] }
  | {
      mode: "saving-throw-reaction";
      itemId: string;
      ability: string;
      outcome: "success" | "failure";
    };

type MagicItemProposal =
  | { applicable: false; reason: string }
  | { applicable: true; nextCharacter: CharacterDocument; destroyed: boolean; restored: number };

function validRoll(value: number | undefined, sides: number): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 1 && value <= sides;
}

export function proposeMagicItemUse(
  input: EvaluateCharacterInput,
  request: MagicItemUse,
): MagicItemProposal {
  const { character } = input;
  const evaluation = evaluateCharacter(input);
  const item = evaluation.inventory.find(({ id }) => id === request.itemId);
  if (request.mode === "consume") {
    if (
      item === undefined ||
      (item.healingPotion === undefined && item.statusPotionId === undefined)
    )
      return { applicable: false, reason: "This item is not a usable potion in your inventory." };
    if (
      evaluation.facts["actions.disabled"] === true ||
      deathSaveStatus(character.state) === "dead"
    )
      return { applicable: false, reason: "This character cannot take a Bonus Action." };
    const { diceCount, diceSize, bonus } = item.healingPotion ?? {
      diceCount: 0,
      diceSize: 4,
      bonus: 0,
    };
    if (
      request.rolls.length !== diceCount ||
      request.rolls.some((roll) => !validRoll(roll, diceSize))
    )
      return { applicable: false, reason: "Enter valid dice rolls for this potion." };
    const nextLoadout = consumeInventoryUnit(character.loadout, item);
    const maximum = evaluation.values["hitPoints.maximum"]?.value;
    const amount = request.rolls.reduce((total, roll) => total + roll, bonus);
    if (
      request.target === "self" &&
      item.healingPotion !== undefined &&
      typeof maximum !== "number"
    )
      return { applicable: false, reason: "The character's maximum HP is unavailable." };
    let state =
      request.target === "self" && item.healingPotion !== undefined && typeof maximum === "number"
        ? healCharacterState(character.state, amount, maximum)
        : character.state;
    if (request.target === "self" && item.statusPotionId !== undefined) {
      if (
        !input.packages.some(({ entities }) =>
          entities.some((entity) => entity.id === item.statusPotionId && entity.kind === "status"),
        )
      )
        return { applicable: false, reason: "This potion's status is missing." };
      state = {
        ...state,
        activeEffectIds: [...new Set([...state.activeEffectIds, item.statusPotionId])],
      };
    }
    return {
      applicable: true,
      nextCharacter: { ...character, loadout: nextLoadout, state },
      destroyed: false,
      restored: 0,
    };
  }
  if (request.mode === "toggle" || request.mode === "elapse") {
    const timed = item?.timedPower;
    if (!timed?.available)
      return {
        applicable: false,
        reason: "Equip and attune the item and check its remaining duration.",
      };
    if (
      request.mode === "toggle" &&
      (evaluation.facts["actions.disabled"] === true || deathSaveStatus(character.state) === "dead")
    )
      return { applicable: false, reason: "This character cannot take a Bonus Action." };
    if (
      request.mode === "elapse" &&
      (!timed.active || !Number.isSafeInteger(request.rounds) || request.rounds < 1)
    )
      return {
        applicable: false,
        reason: "Record a positive whole number of rounds for an active item.",
      };
    const remainingRounds =
      request.mode === "toggle"
        ? timed.remainingRounds
        : Math.max(0, timed.remainingRounds - request.rounds);
    const active = request.mode === "toggle" ? !timed.active : remainingRounds > 0;
    const { loadout } = character;
    return {
      applicable: true,
      nextCharacter: {
        ...character,
        loadout: {
          ...loadout,
          inventory: loadout.inventory.map((entry) =>
            entry.id === request.itemId
              ? { ...entry, timedPowerState: { active, remainingRounds } }
              : entry,
          ),
        },
      },
      destroyed: false,
      restored: 0,
    };
  }
  const power = item?.power;
  if (item === undefined || power === undefined)
    return { applicable: false, reason: "This item has no available magic power." };

  let nextCharges = power.charges?.current;
  let destroyed = false;
  let restored = 0;
  let state = character.state;
  const { charges } = power;
  if (request.mode === "dawn") {
    if (charges === undefined || charges.current === charges.maximum)
      return { applicable: false, reason: "This item has no spent charges to regain." };
    if (!validRoll(request.roll, charges.dawnDieSize))
      return { applicable: false, reason: "Enter a valid dawn recharge roll." };
    restored = Math.min(charges.maximum - charges.current, request.roll + charges.dawnBonus);
    nextCharges = charges.current + restored;
  } else {
    if (!power.available)
      return { applicable: false, reason: "Equip and activate the item and check its charges." };
    if (evaluation.facts["actions.disabled"] === true || deathSaveStatus(state) === "dead")
      return {
        applicable: false,
        reason:
          request.mode === "saving-throw-reaction"
            ? "This character cannot take a Reaction."
            : "This character cannot take a Magic action.",
      };
    if (request.mode === "saving-throw-reaction") {
      if (
        power.kind !== "saving-throw-reaction" ||
        request.ability !== power.ability ||
        request.outcome !== "failure" ||
        charges === undefined
      )
        return {
          applicable: false,
          reason: "Choose a failed saving throw that the item can change.",
        };
      nextCharges = charges.current - 1;
    } else if (power.kind !== "spell") {
      return { applicable: false, reason: "This item does not cast a spell." };
    } else if (charges !== undefined) {
      const spend = request.charges;
      if (!validRoll(spend, Math.min(charges.current, charges.maximumSpend)))
        return { applicable: false, reason: "Choose a valid number of charges to spend." };
      nextCharges = charges.current - spend;
      if (nextCharges === 0 && charges.lastChargeDieSize !== undefined) {
        if (!validRoll(request.lastChargeRoll, charges.lastChargeDieSize))
          return { applicable: false, reason: "A valid last-charge roll is required." };
        destroyed = request.lastChargeRoll === charges.destroyedOn;
      }
    }
    if (request.mode === "cast" && power.kind === "spell" && power.selfStatusId) {
      if (
        !input.packages.some((pkg) =>
          pkg.entities.some(
            (entity) => entity.id === power.selfStatusId && entity.kind === "status",
          ),
        )
      )
        return { applicable: false, reason: "This item's spell status is missing." };
      state = {
        ...state,
        activeEffectIds: [...new Set([...state.activeEffectIds, power.selfStatusId])],
      };
    }
  }

  const { loadout } = character;
  const nextLoadout = destroyed
    ? withoutInventoryItem(loadout, item.id)
    : nextCharges === undefined
      ? loadout
      : {
          ...loadout,
          inventory: loadout.inventory.map((entry) =>
            entry.id === item.id ? { ...entry, charges: nextCharges } : entry,
          ),
        };
  return {
    applicable: true,
    nextCharacter: { ...character, loadout: nextLoadout, state },
    destroyed,
    restored,
  };
}
