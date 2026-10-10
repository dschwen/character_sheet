import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeAction } from "@dnd/rules-core";
import type { ActionUseRequest } from "@dnd/rules-api";
import {
  bardId,
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import { savingThrowRerollRequest } from "./saving-throw-reroll";
import { resolveD20Roll, rollD20 } from "./dice-roll";

const actionId = "action.countercharm";
const featureId = "srd521.class-feature.bard.countercharm";
const options = { id: "bard-seven", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(bardId, catalog, level, "Countercharming Bard"),
    rulesPackage,
    options,
  );
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  return { character, rulesPackage, catalog, input, evaluation };
}
function ownRequest(): ActionUseRequest {
  return {
    actionId,
    failedSavingThrow: {
      target: "self",
      ability: "wisdom",
      conditionId: "srd521.condition.charmed",
      failed: true,
      reactionAvailable: true,
    },
    completedD20Test: { testId: "savingThrow.wisdom", appliedActionIds: [] },
  };
}
function getAction(evaluation: ReturnType<typeof evaluateCharacter>) {
  const action = evaluation.actions.find((action) => action.id === actionId);
  if (!action) throw new Error("Missing Countercharm");
  return action;
}

describe("Bard level 7 Countercharm and shared saving-throw rerolls", () => {
  it("advances with level-4 spells, preserved state, and a source-linked Reaction", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 17;
    character.state.expendedSpellSlots["1"] = 2;
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(next.state).toEqual(character.state);
    expect(next.loadout.inventory).toEqual(character.loadout.inventory);
    expect(next.build.levels.slice(0, 6)).toEqual(character.build.levels);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 11,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
        { level: 4, maximum: 1 },
      ],
    });
    const action = getAction(evaluation);
    expect(action).toMatchObject({
      available: true,
      actionEconomy: "reaction",
      parameters: { savingThrowReroll: { mode: "advantage", rangeFeet: 30 } },
    });
    expect(evaluation.traces[action.traceId]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: featureId, page: 33 })]),
    );
    expect(levelUpEligibility(next, catalog)).toMatchObject({ eligible: false, currentLevel: 7 });
  });

  it.each(["charmed", "frightened"])(
    "authorizes a declared failed %s save without spending inspiration or removing conditions",
    (condition) => {
      const { input, character } = setup();
      character.state.conditionIds = [`srd521.condition.${condition}`];
      const original = structuredClone(character);
      const request = ownRequest();
      if (request.failedSavingThrow)
        request.failedSavingThrow.conditionId = `srd521.condition.${condition}`;
      const proposal = proposeAction(input, request);
      expect(proposal.applicable).toBe(true);
      expect(proposal.savingThrowReroll).toMatchObject({
        target: "self",
        ability: "wisdom",
        mode: "advantage",
      });
      expect(proposal.nextState).toEqual(character.state);
      expect(proposal.changes).toEqual([]);
      expect(character).toEqual(original);
      expect(Object.values(proposal.traces).flatMap((trace) => trace.sourceReferences)).toEqual(
        expect.arrayContaining([expect.objectContaining({ page: 33 })]),
      );
    },
  );

  it.each([0, 30])("authorizes another creature at %s feet using its own sheet", (distanceFeet) => {
    const { input } = setup();
    const request = ownRequest();
    delete request.completedD20Test;
    if (request.failedSavingThrow) {
      request.failedSavingThrow.target = "other";
      request.failedSavingThrow.distanceFeet = distanceFeet;
    }
    expect(proposeAction(input, request).savingThrowReroll?.target).toBe("other");
  });

  it.each([
    "success",
    "no-reaction",
    "wrong-condition",
    "missing-test",
    "wrong-test",
    "repeated",
    "out-of-range",
    "missing-distance",
    "other-sheet-test",
    "unexpected-dice",
    "unexpected-spend",
  ])("rejects %s atomically", (reason) => {
    const { input, character } = setup();
    const request = ownRequest();
    const context = request.failedSavingThrow;
    if (!context) throw new Error("Missing context");
    if (reason === "success") context.failed = false;
    if (reason === "no-reaction") context.reactionAvailable = false;
    if (reason === "wrong-condition") context.conditionId = "srd521.condition.poisoned";
    if (reason === "missing-test") delete request.completedD20Test;
    if (reason === "wrong-test")
      request.completedD20Test = { testId: "skill.insight", appliedActionIds: [] };
    if (reason === "repeated")
      request.completedD20Test = { testId: "savingThrow.wisdom", appliedActionIds: [actionId] };
    if (["out-of-range", "missing-distance", "other-sheet-test"].includes(reason)) {
      context.target = "other";
      if (reason !== "other-sheet-test") delete request.completedD20Test;
      if (reason !== "missing-distance") context.distanceFeet = 31;
    }
    if (reason === "unexpected-dice") request.rolls = [10];
    if (reason === "unexpected-spend") request.amount = 1;
    const proposal = proposeAction(input, request);
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.savingThrowReroll).toBeUndefined();
  });

  it.each(["incapacitated", "stunned", "paralyzed", "unconscious"])(
    "cannot take the Reaction while %s",
    (condition) => {
      const { input, character } = setup();
      character.state.conditionIds = [`srd521.condition.${condition}`];
      expect(proposeAction(input, ownRequest()).applicable).toBe(false);
    },
  );

  it("does not grant Countercharm at level 6", () => {
    const { input, evaluation } = setup(6);
    expect(evaluation.actions.some((action) => action.id === actionId)).toBe(false);
    expect(proposeAction(input, ownRequest()).applicable).toBe(false);
  });

  it("rerolls with Advantage using shared physical and fallback dice, replacing the old result", () => {
    const { evaluation } = setup();
    const action = getAction(evaluation);
    const previous = rollD20(
      { testId: "savingThrow.wisdom", label: "Wisdom save", mode: "normal", modifier: 2 },
      () => 0,
    );
    const request = savingThrowRerollRequest(action, evaluation, previous);
    expect(request.mode).toBe("advantage");
    expect(resolveD20Roll(request, [3, 18]).total).toBe(20);
    const values = [0.1, 0.85];
    expect(rollD20(request, () => values.shift() ?? 0).total).toBe(20);
    expect(previous.total).toBe(3);
  });

  it("cancels Advantage against any Disadvantage, including already canceled roll effects", () => {
    const { evaluation } = setup();
    const action = getAction(evaluation);
    const previous = rollD20(
      { testId: "savingThrow.wisdom", label: "Wisdom save", mode: "normal", modifier: 2 },
      () => 0,
    );
    expect(savingThrowRerollRequest(action, evaluation, previous, true).mode).toBe("normal");
    const test = evaluation.d20Tests["savingThrow.wisdom"];
    if (!test) throw new Error("Missing save");
    test.disadvantageSources = ["effect"];
    test.advantageSources = ["other effect"];
    expect(savingThrowRerollRequest(action, evaluation, previous).mode).toBe("normal");
  });

  it("rejects attacks, ability checks, missing results, and already-rerolled results", () => {
    const { evaluation } = setup();
    const action = getAction(evaluation);
    for (const testId of ["skill.insight", "initiative", "attack.weapon"])
      expect(() =>
        savingThrowRerollRequest(
          action,
          evaluation,
          rollD20({ testId, label: "Invalid", mode: "normal", modifier: 0 }),
        ),
      ).toThrow();
    expect(() => savingThrowRerollRequest(action, evaluation, undefined)).toThrow();
    const previous = {
      ...rollD20({ testId: "savingThrow.wisdom", label: "Save", mode: "normal", modifier: 2 }),
      appliedActionIds: [actionId],
    };
    expect(() => savingThrowRerollRequest(action, evaluation, previous)).toThrow();
  });

  it("retains ordinary bonus-die definitions without retaining previously added consumable dice", () => {
    const { evaluation } = setup();
    const action = getAction(evaluation);
    const request = {
      testId: "savingThrow.wisdom",
      label: "Blessed save",
      mode: "normal" as const,
      modifier: 2,
      bonusDice: [{ diceCount: 1, diceSize: 4, source: "Bless" }],
    };
    const previous = {
      ...resolveD20Roll(request, [2], [], [[1]]),
      total: 12,
      appliedActionIds: ["action.dark-ones-own-luck"],
      bonusDiceRolls: [
        { diceCount: 1, diceSize: 4, dice: [1], source: "Bless" },
        { diceCount: 1, diceSize: 10, dice: [7], source: "Dark One's Own Luck" },
      ],
    };
    const reroll = savingThrowRerollRequest(action, evaluation, previous);
    expect(reroll.bonusDice).toEqual(request.bonusDice);
    expect(resolveD20Roll(reroll, [3, 18], [], [[2]]).total).toBe(22);
  });

  it("does not silently turn a future resource-cost reroll into a free Reaction", () => {
    const { input, character, rulesPackage } = setup();
    const ir = rulesPackage.authoringIr?.find((feature) => feature.id === featureId);
    const rule = ir?.proposedRules[0];
    if (!rule) throw new Error("Missing reroll rule");
    rule.parameters = {
      ...rule.parameters,
      resourceId: "srd521.resource.bard.bardic-inspiration",
      spends: 1,
    };
    const proposal = proposeAction(input, ownRequest());
    expect(proposal.applicable).toBe(false);
    expect(proposal.validations.map(({ code }) => code)).toContain(
      "SAVING_THROW_REROLL_COST_UNSUPPORTED",
    );
    expect(proposal.nextState).toEqual(character.state);
  });
});
