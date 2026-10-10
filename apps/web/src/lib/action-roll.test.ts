import { describe, expect, it } from "vitest";

import { evaluateCharacter, proposeAction } from "@dnd/rules-core";

import { actionDiceRequest, rollActionDice } from "./action-roll";
import { loadWebData } from "./server-data";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  monkId,
} from "./character-builder";

describe("rules-driven action dice", () => {
  it("uses the Martial Arts die and Wisdom modifier for Wholeness of Body", () => {
    const { rulesPackage } = loadWebData();
    const character = buildCharacter(
      defaultBuilderDraft(monkId, characterBuilderCatalog(rulesPackage), 6, "Healing Monk"),
      rulesPackage,
      { id: "healing-monk", now: new Date("2026-10-09T12:00:00Z") },
    );
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const action = evaluation.actions.find(({ id }) => id === "action.wholeness-of-body");
    if (action === undefined) throw new Error("Missing Wholeness of Body.");
    expect(actionDiceRequest(action, evaluation, "Wholeness of Body")).toEqual({
      label: "Wholeness of Body · Healing (minimum 1 HP)",
      diceCount: 1,
      diceSize: 8,
      modifier: 2,
    });
    expect(rollActionDice(action, evaluation, "Wholeness of Body", () => 0.99)).toMatchObject({
      dice: [8],
      total: 10,
    });
  });
  it("derives and rolls Second Wind's 1d10 plus Fighter-level healing", () => {
    const { fixtures, rulesPackage } = loadWebData();
    const fixture = fixtures.find(({ filename }) => filename === "fighter-5.json");
    if (fixture === undefined) throw new Error("Fighter fixture is missing.");
    const evaluation = evaluateCharacter({
      character: fixture.character,
      packages: [rulesPackage],
    });
    const action = evaluation.actions.find(({ id }) => id === "action.second-wind");
    if (action === undefined) throw new Error("Second Wind action is missing.");

    expect(actionDiceRequest(action, evaluation, "Second Wind")).toEqual({
      label: "Second Wind · Healing",
      diceCount: 1,
      diceSize: 10,
      modifier: 5,
    });
    const result = rollActionDice(action, evaluation, "Second Wind", () => 0.39);
    if (result === undefined) throw new Error("Second Wind roll was not created.");
    expect(result).toMatchObject({ dice: [4], modifier: 5, total: 9 });

    const proposal = proposeAction(
      { character: fixture.character, packages: [rulesPackage] },
      { actionId: action.id, rolls: [...result.dice] },
    );
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(fixture.character.state.currentHitPoints + 9);
  });

  it("does not invent dice for actions without transition rolls", () => {
    const { fixtures, rulesPackage } = loadWebData();
    const fixture = fixtures.find(({ filename }) => filename === "fighter-5.json");
    if (fixture === undefined) throw new Error("Fighter fixture is missing.");
    const evaluation = evaluateCharacter({
      character: fixture.character,
      packages: [rulesPackage],
    });
    const action = evaluation.actions.find(({ id }) => id === "action.action-surge");
    if (action === undefined) throw new Error("Action Surge action is missing.");

    expect(actionDiceRequest(action, evaluation, "Action Surge")).toBeUndefined();
  });
});
