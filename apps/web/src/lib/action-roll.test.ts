import { describe, expect, it } from "vitest";

import { evaluateCharacter, proposeAction } from "@dnd/rules-core";

import { actionDiceRequest, rollActionDice } from "./action-roll";
import { loadWebData } from "./server-data";

describe("rules-driven action dice", () => {
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
