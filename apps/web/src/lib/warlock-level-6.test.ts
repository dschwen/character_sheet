import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeAction, proposeRest } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  warlockId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import { actionDiceRequest, applyPostRollBonus, canApplyPostRollBonus } from "./action-roll";
import { resolveD20Roll } from "./dice-roll";

const actionId = "action.dark-ones-own-luck";
const resourceId = "srd521.resource.warlock.dark-ones-own-luck";
const featureId = "srd521.subclass-feature.warlock.fiend.dark-one-s-own-luck";
const options = { id: "lucky-warlock", now: new Date("2026-10-09T12:00:00Z") };
function setup(level = 6) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(warlockId, catalog, level, "Lucky Warlock"),
    rulesPackage,
    options,
  );
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  const action = evaluation.actions.find(({ id }) => id === actionId);
  if (action === undefined && level >= 6) throw new Error("Missing Dark One's Own Luck.");
  return { character, rulesPackage, catalog, input, evaluation, action };
}

describe("Warlock level 6 and post-roll bonuses", () => {
  it("advances without replacing play state, possessions, or invocation history", () => {
    const { character, rulesPackage, catalog } = setup(5);
    character.state.currentHitPoints = 12;
    character.state.expendedSpellSlots["3"] = 1;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(45);
    expect(advanced.state.currentHitPoints).toBe(12);
    expect(advanced.state.expendedSpellSlots["3"]).toBe(1);
    expect(advanced.loadout.inventory).toEqual(character.loadout.inventory);
    expect(advanced.build.levels.slice(0, 5)).toEqual(character.build.levels);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 7,
      cantripsKnown: 3,
      slots: [{ level: 3, maximum: 2 }],
    });
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: false });
  });

  it("grants a traced Charisma-based Long Rest resource only at level 6", () => {
    const { evaluation, action } = setup();
    expect(setup(5).action).toBeUndefined();
    expect(action).toMatchObject({
      actionEconomy: "no-action",
      available: true,
      parameters: {
        checkBonus: {
          diceCount: 1,
          diceSize: 10,
          afterRoll: true,
          appliesTo: ["ability-check", "saving-throw"],
        },
      },
    });
    const resource = evaluation.resources.find(({ id }) => id === resourceId);
    expect(resource).toMatchObject({
      maximum: 3,
      current: 3,
      recharge: [{ event: "long-rest", amount: "all" }],
    });
    expect(evaluation.traces[resource?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: featureId })]),
    );
  });

  it.each(["abilityCheck.strength", "skill.arcana", "savingThrow.wisdom", "initiative"])(
    "rolls and adds the bonus once to %s, without changing its d20",
    (testId) => {
      const { action, evaluation, input, character } = setup();
      if (action === undefined) throw new Error("Missing action.");
      const original = resolveD20Roll(
        {
          label: testId,
          testId,
          modifier: 2,
          mode: "advantage",
          bonusDice: [{ diceCount: 1, diceSize: 4, source: "Existing effect" }],
        },
        [4, 15],
        [],
        [[3]],
      );
      expect(canApplyPostRollBonus(action, original)).toBe(true);
      expect(actionDiceRequest(action, evaluation, "Dark One's Own Luck")).toMatchObject({
        diceCount: 1,
        diceSize: 10,
      });
      const proposal = proposeAction(input, {
        actionId,
        rolls: [7],
        completedD20Test: { testId, appliedActionIds: [] },
      });
      expect(proposal.applicable).toBe(true);
      expect(proposal.nextState.expendedResources[resourceId]).toBe(1);
      expect(character.state.expendedResources[resourceId] ?? 0).toBe(0);
      const boosted = applyPostRollBonus(action, original, [7], "Dark One's Own Luck");
      expect(boosted).toMatchObject({
        dice: [4, 15],
        kept: 15,
        total: 27,
        appliedActionIds: [actionId],
      });
      expect(original.total).toBe(20);
      expect(boosted.bonusDiceRolls?.[0]).toEqual(original.bonusDiceRolls?.[0]);
      expect(boosted.bonusDiceRolls?.[1]).toMatchObject({
        dice: [7],
        source: "Dark One's Own Luck",
      });
      expect(canApplyPostRollBonus(action, boosted)).toBe(false);
      expect(() => applyPostRollBonus(action, boosted, [5], "Luck")).toThrow();
      expect(
        proposeAction(input, {
          actionId,
          rolls: [5],
          completedD20Test: { testId, appliedActionIds: [actionId] },
        }).applicable,
      ).toBe(false);
    },
  );

  it("rejects missing, attack, unknown, repeated, and malformed roll contexts atomically", () => {
    const { input, character } = setup();
    for (const request of [
      { actionId, rolls: [4] },
      {
        actionId,
        rolls: [4],
        completedD20Test: { testId: "attack.dagger-1", appliedActionIds: [] },
      },
      { actionId, rolls: [4], completedD20Test: { testId: "skill.fake", appliedActionIds: [] } },
      { actionId, rolls: [], completedD20Test: { testId: "skill.arcana", appliedActionIds: [] } },
      { actionId, rolls: [11], completedD20Test: { testId: "skill.arcana", appliedActionIds: [] } },
      {
        actionId,
        rolls: [1, 2],
        completedD20Test: { testId: "skill.arcana", appliedActionIds: [] },
      },
    ]) {
      const proposal = proposeAction(input, request);
      expect(proposal.applicable).toBe(false);
      expect(proposal.changes).toEqual([]);
      expect(proposal.nextState).toEqual(character.state);
    }
  });

  it("exhausts uses and recharges on Long Rest, not Short Rest", () => {
    const { input, character } = setup();
    const request = {
      actionId,
      rolls: [1],
      completedD20Test: { testId: "skill.arcana", appliedActionIds: [] },
    };
    for (let use = 0; use < 3; use++) {
      const proposal = proposeAction(input, request);
      expect(proposal.applicable).toBe(true);
      character.state = proposal.nextState;
    }
    expect(proposeAction(input, request).applicable).toBe(false);
    expect(
      proposeRest(input, { event: "short-rest" }).nextState.expendedResources[resourceId],
    ).toBe(3);
    character.state = proposeRest(input, { event: "long-rest" }).nextState;
    expect(proposeAction(input, request).applicable).toBe(true);
  });

  it("retains at least one use with a nonpositive Charisma modifier", () => {
    const { input, character } = setup();
    character.build.abilityScores.charisma = 3;
    expect(evaluateCharacter(input).resources.find(({ id }) => id === resourceId)?.maximum).toBe(1);
  });
});
