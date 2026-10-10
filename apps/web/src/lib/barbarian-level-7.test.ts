import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeAction } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  barbarianId,
  fighterId,
  rogueId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { actionDiceRequest, actionMovementMessage } from "./action-roll";
import { loadWebData } from "./server-data";

const options = { id: "barbarian-seven", now: new Date("2026-10-10T12:00:00Z") };
const feral = "srd521.class-feature.barbarian.feral-instinct";
const rage = "srd521.resource.barbarian.rage";
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(barbarianId, catalog, level, "Berserker"),
    rulesPackage,
    options,
  );
  return { character, catalog, rulesPackage };
}

describe("Barbarian level 7 and action movement enhancements", () => {
  it("grants source-linked Initiative advantage at level 7, not 6 or other checks", () => {
    for (const level of [6, 7]) {
      const { character, rulesPackage } = setup(level);
      const result = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(result.validations.filter(({ severity }) => severity === "error")).toEqual([]);
      expect(result.d20Tests.initiative?.rollMode).toBe(level === 7 ? "advantage" : "normal");
      expect(result.d20Tests["abilityCheck.dexterity"]?.rollMode).toBe("normal");
      expect(result.d20Tests.initiative?.advantageSources.includes(feral)).toBe(level === 7);
      if (level === 7)
        expect(result.traces.initiative?.sourceReferences).toEqual(
          expect.arrayContaining([expect.objectContaining({ page: 29 })]),
        );
    }
  });

  it("cancels Initiative advantage against surprise without stacking or requiring Rage", () => {
    const { character, rulesPackage } = setup();
    const result = evaluateCharacter({
      character,
      packages: [rulesPackage],
      context: {
        d20RollEffects: [{ testId: "initiative", kind: "disadvantage", source: "surprised" }],
      },
    });
    expect(result.d20Tests.initiative?.rollMode).toBe("normal");
    expect(character.state.activeEffectIds).not.toContain("srd521.effect.barbarian.rage");
    expect(result.d20Tests.initiative?.advantageSources).toContain(feral);
  });

  it.each([
    { name: "ordinary", condition: undefined, effect: undefined, exhaustion: 0, feet: 20 },
    { name: "Exhaustion 1", condition: undefined, effect: undefined, exhaustion: 1, feet: 17 },
    {
      name: "Grappled",
      condition: "srd521.condition.grappled",
      effect: undefined,
      exhaustion: 0,
      feet: 0,
    },
    {
      name: "Longstrider",
      condition: undefined,
      effect: "srd521.status.spell.longstrider",
      exhaustion: 0,
      feet: 25,
    },
    {
      name: "Haste",
      condition: undefined,
      effect: "srd521.status.spell.haste",
      exhaustion: 0,
      feet: 40,
    },
  ])("uses final adjusted Speed for $name movement", ({ condition, effect, exhaustion, feet }) => {
    const { character, rulesPackage } = setup();
    if (condition !== undefined) character.state.conditionIds.push(condition);
    if (effect !== undefined) character.state.activeEffectIds.push(effect);
    character.state.exhaustion = exhaustion;
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    const action = result.actions.find(({ id }) => id === "action.enter-rage");
    expect(action).toBeDefined();
    expect(action?.parameters?.movement).toMatchObject({
      speedFraction: 0.5,
      maximumFeet: feet,
      provokesOpportunityAttacks: true,
      traceId: "action.enter-rage.maximumMovement",
    });
    expect(result.traces["action.enter-rage.maximumMovement"]?.result).toBe(feet);
    expect(result.traces["action.enter-rage.maximumMovement"]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 29 })]),
    );
    if (action === undefined) throw new Error("Missing Enter Rage");
    expect(actionMovementMessage(action)).toContain(`up to ${String(feet)} ft.`);
    expect(actionMovementMessage(action)).toContain("Normal Opportunity Attack rules apply");
    expect(actionDiceRequest(action, result, "Enter Rage")).toBeUndefined();
  });

  it("enters Rage and ends Mindless Rage conditions atomically without auto-moving", () => {
    const { character, rulesPackage } = setup();
    character.state.conditionIds = ["srd521.condition.charmed", "srd521.condition.frightened"];
    const before = structuredClone(character);
    const proposal = proposeAction(
      { character, packages: [rulesPackage] },
      { actionId: "action.enter-rage" },
    );
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.expendedResources[rage]).toBe(1);
    expect(proposal.nextState.conditionIds).toEqual([]);
    expect(proposal.nextState.activeEffectIds).toContain("srd521.effect.barbarian.rage");
    expect(proposal.changes.some(({ path }) => path.includes("movement"))).toBe(false);
    expect(character).toEqual(before);
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    const action = result.actions.find(({ id }) => id === "action.enter-rage");
    expect(result.traces[action?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ page: 30 }),
        expect.objectContaining({ page: 29 }),
      ]),
    );
  });

  it("does not offer a separate pounce or enhance lower-level Rage", () => {
    const { character, rulesPackage } = setup(6);
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(
      result.actions.find(({ id }) => id === "action.enter-rage")?.parameters?.movement,
    ).toBeUndefined();
    expect(result.actions.some(({ id }) => id.includes("pounce"))).toBe(false);
  });

  it("derives movement fractions from content rather than Barbarian UI logic", () => {
    const { character, rulesPackage } = setup();
    const edited = structuredClone(rulesPackage);
    const feature = edited.entities.find(
      ({ id }) => id === "srd521.class-feature.barbarian.instinctive-pounce",
    );
    if (
      feature === undefined ||
      typeof feature.body !== "object" ||
      feature.body === null ||
      Array.isArray(feature.body)
    )
      throw new Error("Missing Pounce");
    feature.body = {
      ...feature.body,
      actionEnhancements: [
        {
          actionId: "action.enter-rage",
          movement: { speedFraction: 0.25, provokesOpportunityAttacks: false },
        },
      ],
    };
    const result = evaluateCharacter({ character, packages: [edited] });
    const action = result.actions.find(({ id }) => id === "action.enter-rage");
    expect(action?.parameters?.movement).toMatchObject({ maximumFeet: 10 });
    if (action === undefined) throw new Error("Missing Enter Rage");
    expect(actionMovementMessage(action)).toContain("does not provoke Opportunity Attacks");
  });

  it.each([
    [rogueId, 5, "action.cunning-strike.withdraw"],
    [fighterId, 6, "action.tactical-shift"],
  ] as const)("applies final Speed and rounding to %s movement", (classId, level, actionId) => {
    const { rulesPackage, catalog } = setup();
    const character = buildCharacter(
      defaultBuilderDraft(classId, catalog, level, "Movement test"),
      rulesPackage,
      options,
    );
    character.state.exhaustion = 1;
    const result = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(result.values["speed.walking"]?.value).toBe(25);
    expect(result.actions.find(({ id }) => id === actionId)?.parameters?.movement).toMatchObject({
      maximumFeet: 12,
      provokesOpportunityAttacks: false,
    });
  });

  it("cannot use Pounce to bypass exhausted Rage uses or an already active Rage", () => {
    for (const active of [false, true]) {
      const { character, rulesPackage } = setup();
      if (active) character.state.activeEffectIds.push("srd521.effect.barbarian.rage");
      else character.state.expendedResources[rage] = 4;
      const proposal = proposeAction(
        { character, packages: [rulesPackage] },
        { actionId: "action.enter-rage" },
      );
      expect(proposal.applicable).toBe(false);
      expect(proposal.changes).toEqual([]);
    }
  });

  it("advances level 6 to 7 preserving possessions, history, and mutable state", () => {
    const { character, catalog, rulesPackage } = setup(6);
    character.state.currentHitPoints = 13;
    character.state.expendedResources[rage] = 1;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(advanced.state).toEqual(character.state);
    expect(advanced.loadout).toEqual(character.loadout);
    expect(advanced.build.levels.slice(0, 6)).toEqual(character.build.levels);
    const result = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(result.d20Tests.initiative?.rollMode).toBe("advantage");
    expect(result.values["hitPoints.maximum"]?.value).toBe(68);
    expect(result.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: true, targetLevel: 8 });
  });
});
