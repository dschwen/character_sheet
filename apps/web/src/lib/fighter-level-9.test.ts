import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeAction, proposeRest } from "@dnd/rules-core";
import type { ActionUseRequest, RollMode } from "@dnd/rules-api";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  barbarianId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import { failedSaveRerollRequest } from "./failed-save-reroll";
import { resolveD20Roll, rollD20 } from "./dice-roll";
import { abilities } from "./presentation";
import { selectedAttackMastery } from "./weapon-mastery";

const actionId = "action.indomitable";
const resourceId = "srd521.resource.fighter.indomitable";
const options = { id: "fighter-nine", now: new Date("2026-10-10T19:00:00Z") };
function setup(level = 9) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(fighterId, catalog, level, "Indomitable Champion"),
    rulesPackage,
    options,
  );
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  return { rulesPackage, catalog, character, input, evaluation };
}
const request = (testId = "savingThrow.wisdom"): ActionUseRequest => ({
  actionId,
  failedSave: true,
  completedD20Test: { testId, appliedActionIds: [] },
});

describe("Fighter level 9 and source-driven failed-save rerolls", () => {
  it("creates a legal level-9 Fighter and grants a traced, one-use Indomitable", () => {
    const { evaluation, character, catalog } = setup();
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.resources.find(({ id }) => id === resourceId)).toMatchObject({
      maximum: 1,
      current: 1,
      expended: 0,
    });
    const action = evaluation.actions.find(({ id }) => id === actionId);
    expect(action).toMatchObject({
      available: true,
      actionEconomy: "failed-saving-throw-trigger",
      parameters: { spends: 1, resourceId, failedSaveReroll: { bonusFact: "classLevel.fighter" } },
    });
    expect(evaluation.traces[action?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 48 })]),
    );
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
  });

  it("advances 8→9 without rewriting feats, possessions, or expended play state", () => {
    const { character, catalog, rulesPackage } = setup(8);
    character.state.currentHitPoints = 13;
    character.state.temporaryHitPoints = 3;
    character.state.expendedResources["srd521.resource.fighter.second-wind"] = 2;
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(next.build.levels.slice(0, 8)).toEqual(character.build.levels);
    expect(next.build.featIds).toEqual(character.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(character.build.featAbilityScoreIncreases);
    expect(next.loadout).toEqual(character.loadout);
    expect(next.state).toEqual(character.state);
    expect(
      evaluateCharacter({ character: next, packages: [rulesPackage] }).resources.find(
        ({ id }) => id === resourceId,
      )?.current,
    ).toBe(1);
  });

  it.each(abilities)(
    "spends exactly one use for a declared failed %s save, without touching HP or conditions",
    (ability) => {
      const { input, character } = setup();
      const before = structuredClone(character);
      const proposal = proposeAction(input, request(`savingThrow.${ability}`));
      expect(proposal.applicable).toBe(true);
      expect(proposal.failedSaveReroll).toMatchObject({
        testId: `savingThrow.${ability}`,
        bonus: 9,
      });
      expect(proposal.nextState).toEqual({
        ...character.state,
        expendedResources: { ...character.state.expendedResources, [resourceId]: 1 },
      });
      expect(proposal.changes.map(({ path }) => path)).toEqual([
        `state.expendedResources.${resourceId}`,
      ]);
      expect(proposal.traces[proposal.failedSaveReroll?.traceId ?? ""]?.sourceReferences).toEqual(
        expect.arrayContaining([expect.objectContaining({ page: 48 })]),
      );
      expect(character).toEqual(before);
    },
  );

  it.each([
    "missing-test",
    "check",
    "fake-save",
    "success",
    "missing-failure",
    "already-used",
    "dice",
    "amount",
    "reaction-context",
  ])("rejects %s atomically", (kind) => {
    const { input, character } = setup();
    const candidate = request();
    if (kind === "missing-test") delete candidate.completedD20Test;
    if (kind === "check")
      candidate.completedD20Test = { testId: "skill.athletics", appliedActionIds: [] };
    if (kind === "fake-save")
      candidate.completedD20Test = { testId: "savingThrow.fake", appliedActionIds: [] };
    if (kind === "success") candidate.failedSave = false;
    if (kind === "missing-failure") delete candidate.failedSave;
    if (kind === "already-used")
      candidate.completedD20Test = { testId: "savingThrow.wisdom", appliedActionIds: [actionId] };
    if (kind === "dice") candidate.rolls = [20];
    if (kind === "amount") candidate.amount = 1;
    if (kind === "reaction-context")
      candidate.failedSavingThrow = {
        target: "self",
        ability: "wisdom",
        conditionId: "srd521.condition.charmed",
        failed: true,
        reactionAvailable: true,
      };
    const proposal = proposeAction(input, candidate);
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.changes).toEqual([]);
    expect(proposal.failedSaveReroll).toBeUndefined();
  });

  it("does not refund on failure, cannot overspend, and recharges only on a Long Rest", () => {
    const { input, character } = setup();
    character.state = proposeAction(input, request()).nextState;
    expect(proposeAction(input, request()).applicable).toBe(false);
    expect(
      proposeRest(input, { event: "short-rest" }).nextState.expendedResources[resourceId],
    ).toBe(1);
    character.state = proposeRest(input, { event: "long-rest" }).nextState;
    expect(character.state.expendedResources[resourceId]).toBe(0);
    expect(proposeAction(input, request()).applicable).toBe(true);
  });

  it("does not grant the action below level 9 or to other classes", () => {
    const { input, rulesPackage, catalog } = setup(8);
    expect(proposeAction(input, request()).applicable).toBe(false);
    const other = buildCharacter(
      defaultBuilderDraft(barbarianId, catalog, 8, "Not a Fighter"),
      rulesPackage,
      options,
    );
    expect(
      proposeAction({ character: other, packages: [rulesPackage] }, request()).applicable,
    ).toBe(false);
  });

  it.each(["normal", "advantage", "disadvantage"] as RollMode[])(
    "rerolls in %s mode, adding Fighter level without retaining consumable bonuses",
    (mode) => {
      const { evaluation } = setup();
      const action = evaluation.actions.find(({ id }) => id === actionId);
      const test = evaluation.d20Tests["savingThrow.wisdom"];
      if (action === undefined || test === undefined) throw new Error("Missing save/action");
      const previous = {
        ...rollD20(
          { testId: test.id, label: "Wisdom save", mode, modifier: test.modifier },
          () => 0.95,
        ),
        total: 999,
        appliedActionIds: ["action.dark-ones-own-luck"],
      };
      const reroll = failedSaveRerollRequest(action, evaluation, previous);
      expect(reroll.mode).toBe(mode);
      expect(reroll.modifier).toBe(test.modifier + 9);
      expect(
        failedSaveRerollRequest(action, evaluation, { ...previous, modifier: 2 }).modifier,
      ).toBe(11);
      const result = resolveD20Roll(reroll, mode === "normal" ? [2] : [2, 3]);
      expect(result.total).toBe(test.modifier + 9 + (mode === "advantage" ? 3 : 2));
      expect(result.total).toBeLessThan(previous.total);
      expect(rollD20(reroll, () => 0.05).total).toBe(test.modifier + 11);
      expect(() =>
        failedSaveRerollRequest(action, evaluation, { ...previous, appliedActionIds: [actionId] }),
      ).toThrow();
      expect(() => failedSaveRerollRequest(action, evaluation, undefined)).toThrow();
    },
  );

  it("offers Tactical Master only on mastered weapons, without changing damage or stacking properties", () => {
    const { character, evaluation, input } = setup();
    const mastered = evaluation.attacks.filter((attack) => attack.mastery?.enabled);
    expect(mastered.length).toBeGreaterThan(0);
    for (const attack of mastered) {
      expect(selectedAttackMastery(attack)).toBe(attack.mastery?.property);
      expect(selectedAttackMastery(attack, "sap")).toBe("sap");
      expect(selectedAttackMastery(attack, "invented-mastery")).toBe(attack.mastery?.property);
      expect(attack.mastery?.replacements).toEqual(["push", "sap", "slow"]);
      expect(evaluation.traces[attack.mastery?.replacementTraceId ?? ""]?.sourceReferences).toEqual(
        expect.arrayContaining([expect.objectContaining({ page: 48 })]),
      );
    }
    character.loadout.selectedWeaponMasteryIds = [];
    const withoutMastery = evaluateCharacter(input);
    expect(
      withoutMastery.attacks.every((attack) => attack.mastery?.replacements === undefined),
    ).toBe(true);
    expect(
      withoutMastery.attacks.every((attack) => selectedAttackMastery(attack, "push") === undefined),
    ).toBe(true);
    for (const attack of withoutMastery.attacks)
      expect(attack.damage).toEqual(evaluation.attacks.find(({ id }) => id === attack.id)?.damage);
    expect(
      setup(8).evaluation.attacks.every((attack) => attack.mastery?.replacements === undefined),
    ).toBe(true);
  });
});
