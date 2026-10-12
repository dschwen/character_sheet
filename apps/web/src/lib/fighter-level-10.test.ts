import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { heroicInspirationGrantSchema } from "@dnd/content-schema";
import { evaluateCharacter, proposeAction, proposeRest } from "@dnd/rules-core";
import type { ActionUseRequest } from "@dnd/rules-api";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  barbarianId,
  updateBuilderSpecies,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import { heroicInspirationGrant, heroicInspirationTrigger } from "./heroic-inspiration";
import { actionDiceRequest } from "./action-roll";
import { abilityScoreImprovementId } from "./ability-score-improvements";

const actionId = "action.heroic-warrior";
const featureId = "srd521.subclass-feature.fighter.champion.heroic-warrior";
const windId = "srd521.resource.fighter.second-wind";
const options = { id: "fighter-ten", now: new Date("2026-10-12T15:00:00Z") };
const trigger = { inCombat: true, startingTurn: true };
function setup(level = 10) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(fighterId, catalog, level, "Heroic Champion"),
    rulesPackage,
    options,
  );
  character.state.heroicInspiration = false;
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  return { rulesPackage, catalog, character, input, evaluation };
}

describe("Fighter level 10 and declared Heroic Inspiration grants", () => {
  it("creates a legal Champion with four Second Wind uses, five masteries and source-linked Heroic Warrior", () => {
    const { character, evaluation, catalog } = setup();
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.resources.find(({ id }) => id === windId)).toMatchObject({
      maximum: 4,
      current: 4,
    });
    expect(character.loadout.selectedWeaponMasteryIds).toHaveLength(5);
    expect(character.build.featIds.filter((id) => id === abilityScoreImprovementId)).toHaveLength(
      3,
    );
    expect(
      character.build.featIds.filter((id) => id.startsWith("srd521.feat.fighting-style.")),
    ).toHaveLength(2);
    expect(evaluation.facts["attackAction.attacks"]).toBe(2);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.fighter.indomitable")?.maximum,
    ).toBe(1);
    const action = evaluation.actions.find(({ id }) => id === actionId);
    expect(action).toMatchObject({
      available: true,
      actionEconomy: "no-action",
      parameters: {
        grantsHeroicInspiration: { trigger: "start-of-turn-in-combat", requiresMissing: true },
      },
    });
    expect(evaluation.traces[action?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featureId, page: 49 }),
    );
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 10,
    });
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
  });

  it("advances 9→10 preserving prior choices and spent state while adding one mastery", () => {
    const { character, catalog, rulesPackage } = setup(9);
    character.state.currentHitPoints = 13;
    character.state.temporaryHitPoints = 3;
    character.state.expendedResources = {
      [windId]: 3,
      "srd521.resource.fighter.indomitable": 1,
      "srd521.resource.fighter.action-surge": 1,
    };
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.build.levels.slice(0, 9)).toEqual(before.build.levels);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    expect(next.loadout.inventory).toEqual(before.loadout.inventory);
    expect(next.loadout.equippedItemIds).toEqual(before.loadout.equippedItemIds);
    expect(next.loadout.currency).toEqual(before.loadout.currency);
    expect(next.loadout.selectedWeaponMasteryIds).toHaveLength(5);
    expect(next.loadout.selectedWeaponMasteryIds).toEqual(
      expect.arrayContaining(before.loadout.selectedWeaponMasteryIds),
    );
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.resources.find(({ id }) => id === windId)).toMatchObject({
      maximum: 4,
      expended: 3,
      current: 1,
    });
  });

  it("grants exactly the boolean state atomically without dice or resource spending", () => {
    const { input, character, evaluation } = setup();
    const before = structuredClone(character);
    const proposal = proposeAction(input, { actionId, turnStart: trigger });
    expect(proposal.applicable).toBe(true);
    expect(proposal.validations).toEqual([]);
    expect(proposal.nextState).toEqual({ ...character.state, heroicInspiration: true });
    expect(proposal.changes).toEqual([
      expect.objectContaining({ path: "state.heroicInspiration", before: false, after: true }),
    ]);
    const trace = proposal.traces[proposal.changes[0]?.traceId ?? ""];
    expect(trace?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featureId, page: 49 }),
    );
    expect(trace?.nodes[0]?.inputs).toEqual([true, true, false]);
    expect(proposal.guidance?.join(" ")).toContain("Wait for another eligible turn start");
    const action = evaluation.actions.find(({ id }) => id === actionId);
    if (action === undefined) throw new Error("Missing Heroic Warrior");
    expect(actionDiceRequest(action, evaluation, "Heroic Warrior")).toBeUndefined();
    expect(character).toEqual(before);
  });

  it.each([
    undefined,
    { inCombat: false, startingTurn: false },
    { inCombat: true, startingTurn: false },
    { inCombat: false, startingTurn: true },
  ])("rejects missing or ineligible timing %j without state changes", (turnStart) => {
    const { input, character } = setup();
    const proposal = proposeAction(input, {
      actionId,
      ...(turnStart === undefined ? {} : { turnStart }),
    });
    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.validations.some(({ code }) => code === "ACTION_TURN_START_REQUIRED")).toBe(
      true,
    );
  });

  it("does not stack or transfer held Inspiration and becomes available again after spending", () => {
    const { character, input } = setup();
    character.state.heroicInspiration = true;
    expect(evaluateCharacter(input).actions.find(({ id }) => id === actionId)?.available).toBe(
      false,
    );
    const proposal = proposeAction(input, { actionId, turnStart: trigger });
    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
    expect(
      proposal.validations.some(({ code }) => code === "HEROIC_INSPIRATION_ALREADY_HELD"),
    ).toBe(true);
    character.state.heroicInspiration = false;
    expect(evaluateCharacter(input).actions.find(({ id }) => id === actionId)?.available).toBe(
      true,
    );
    expect(proposeAction(input, { actionId }).applicable).toBe(false);
    expect(proposeAction(input, { actionId, turnStart: trigger }).applicable).toBe(true);
  });

  it.each([3, 7, 9])("does not grant Heroic Warrior at level %i", (level) => {
    const { input, evaluation } = setup(level);
    expect(evaluation.actions.some(({ id }) => id === actionId)).toBe(false);
    expect(proposeAction(input, { actionId, turnStart: trigger }).applicable).toBe(false);
  });

  it("does not grant the subclass feature to another class", () => {
    const { rulesPackage, catalog } = setup();
    const character = buildCharacter(
      defaultBuilderDraft(barbarianId, catalog, 9, "Not a Champion"),
      rulesPackage,
      options,
    );
    expect(
      proposeAction({ character, packages: [rulesPackage] }, { actionId, turnStart: trigger })
        .applicable,
    ).toBe(false);
  });

  it.each(["incapacitated", "unconscious", "stunned", "paralyzed"])(
    "requires no action, so %s alone doesn't prevent the grant",
    (condition) => {
      const { input, character } = setup();
      character.state.conditionIds.push(`srd521.condition.${condition}`);
      const proposal = proposeAction(input, { actionId, turnStart: trigger });
      expect(proposal.applicable).toBe(true);
      expect(proposal.nextState.conditionIds).toEqual(character.state.conditionIds);
      expect(proposal.nextState.heroicInspiration).toBe(true);
    },
  );

  it("does not revive or grant Inspiration to a dead character", () => {
    const { input, character } = setup();
    character.state.dead = true;
    character.state.currentHitPoints = 0;
    const proposal = proposeAction(input, { actionId, turnStart: trigger });
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
  });

  it.each([
    { rolls: [6] },
    { amount: 1 },
    { targeting: { count: 1, eligibilityConfirmed: true } },
    { failedSave: false },
    { completedD20Test: { testId: "savingThrow.dexterity", appliedActionIds: [] } },
  ])("rejects unrelated request payloads %j", (patch) => {
    const { input, character } = setup();
    const proposal = proposeAction(input, { actionId, turnStart: trigger, ...patch });
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.changes).toEqual([]);
  });

  it("rejects a turn-start declaration on an ordinary resource action", () => {
    const { input, character } = setup();
    const proposal = proposeAction(input, { actionId: "action.action-surge", turnStart: trigger });
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.validations.some(({ code }) => code === "ACTION_TURN_START_NOT_EXPECTED")).toBe(
      true,
    );
  });

  it("recharges four Second Wind uses without making Heroic Warrior a rest grant", () => {
    const { rulesPackage, catalog } = setup();
    const draft = updateBuilderSpecies(
      defaultBuilderDraft(fighterId, catalog, 10, "Dwarf Champion"),
      catalog,
      "srd521.species.dwarf",
    );
    const character = buildCharacter(draft, rulesPackage, options);
    character.state.heroicInspiration = false;
    character.state.expendedResources[windId] = 4;
    for (const event of ["short-rest", "long-rest"] as const) {
      const proposal = proposeRest({ character, packages: [rulesPackage] }, { event });
      expect(proposal.applicable).toBe(true);
      expect(proposal.nextState.expendedResources[windId]).toBe(event === "short-rest" ? 3 : 0);
      expect(proposal.nextState.heroicInspiration).toBe(false);
    }
  });

  it("shares trigger metadata between UI and engine without a class-ID switch", () => {
    const { input, evaluation } = setup();
    const action = evaluation.actions.find(({ id }) => id === actionId);
    const ordinary = evaluation.actions.find(({ id }) => id === "action.action-surge");
    if (action === undefined || ordinary === undefined) throw new Error("Missing actions");
    expect(heroicInspirationGrant(action)).toEqual({
      trigger: "start-of-turn-in-combat",
      requiresMissing: true,
    });
    expect(heroicInspirationTrigger(action, true, true)).toEqual(trigger);
    expect(() => heroicInspirationTrigger(action, false, true)).toThrow("combat");
    expect(() => heroicInspirationTrigger(action, true, false)).toThrow("combat");
    expect(heroicInspirationTrigger(ordinary, true, true)).toBeUndefined();
    const turnStart = heroicInspirationTrigger(action, true, true);
    if (turnStart === undefined) throw new Error("Missing turn trigger");
    expect(proposeAction(input, { actionId, turnStart }).applicable).toBe(true);
  });

  it("uses authored grant metadata on another class without a Fighter-specific engine branch", () => {
    const { rulesPackage, catalog } = setup();
    const ir = rulesPackage.authoringIr?.find(({ id }) => id === featureId);
    if (ir === undefined) throw new Error("Missing Heroic Warrior IR");
    ir.id = "srd521.class-feature.barbarian.rage";
    ir.parentId = barbarianId;
    ir.level = 1;
    const character = buildCharacter(
      defaultBuilderDraft(barbarianId, catalog, 9, "Authored Grant"),
      rulesPackage,
      options,
    );
    character.state.heroicInspiration = false;
    const proposal = proposeAction(
      { character, packages: [rulesPackage] },
      { actionId, turnStart: trigger },
    );
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.heroicInspiration).toBe(true);
  });

  it("rejects an incompatible resource cost on the free grant without partial mutation", () => {
    const { rulesPackage, input, character } = setup();
    const ir = rulesPackage.authoringIr?.find(({ id }) => id === featureId);
    const rule = ir?.proposedRules[0];
    if (rule === undefined) throw new Error("Missing grant rule");
    rule.parameters = { ...rule.parameters, resourceId: windId, spends: 1 };
    const proposal = proposeAction(input, { actionId, turnStart: trigger });
    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
    expect(
      proposal.validations.some(({ code }) => code === "HEROIC_INSPIRATION_COST_UNSUPPORTED"),
    ).toBe(true);
  });

  it.each([
    { trigger: "long-rest", requiresMissing: true },
    { trigger: "start-of-turn-in-combat", requiresMissing: false },
    { trigger: "start-of-turn-in-combat", requiresMissing: true, stacks: true },
  ])("rejects unsupported authored grant semantics %j", (body) => {
    expect(heroicInspirationGrantSchema.safeParse(body).success).toBe(false);
  });

  it("rejects malformed turn-start requests before changing state", () => {
    const { input } = setup();
    expect(() =>
      proposeAction(input, {
        actionId,
        turnStart: { inCombat: "true", startingTurn: true },
      } as unknown as ActionUseRequest),
    ).toThrow();
  });
});
