import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { movementCapabilitySchema, featureAutomationBodySchema } from "@dnd/content-schema";
import {
  evaluateCharacter,
  proposeAction,
  proposeRest,
  resolveSavingThrowDamage,
} from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  monkId,
  fighterId,
  validateBuilderDraft,
  type BuilderClassId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { actionDiceRequest } from "./action-roll";
import { loadWebData } from "./server-data";

const options = { id: "monk-nine", now: new Date("2026-10-11T21:00:00Z") };
const featureId = "srd521.class-feature.monk.acrobatic-movement";
const capabilityId = "srd521.movement.acrobatic-movement";
const focusId = "srd521.resource.monk.focus-points";
const wholenessId = "srd521.resource.monk.wholeness-of-body";
function setup(level = 9, classId: BuilderClassId = monkId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(classId, catalog, level, "Acrobatic Adept");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  return { rulesPackage, catalog, draft, character, input, evaluation };
}

describe("Monk level 9 and shared movement capabilities", () => {
  it("creates a legal Monk with nine Focus, d8 Martial Arts, and source-linked Acrobatic Movement", () => {
    const { character, draft, catalog, evaluation } = setup();
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.values["speed.walking"]?.value).toBe(45);
    expect(evaluation.values["speed.unarmoredMovement"]?.value).toBe(15);
    expect(evaluation.resources.find(({ id }) => id === focusId)).toMatchObject({
      maximum: 9,
      current: 9,
    });
    expect(
      evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike")?.damage,
    ).toMatchObject({ diceCount: 1, diceSize: 8, alternativeTypes: ["force"] });
    expect(evaluation.facts["attackAction.attacks"]).toBe(2);
    expect(evaluation.movementCapabilities).toHaveLength(1);
    const capability = evaluation.movementCapabilities?.[0];
    expect(capability).toMatchObject({
      id: capabilityId,
      sourceId: featureId,
      sourceName: "Acrobatic Movement",
      available: true,
      reasons: [],
      surfaces: ["vertical-surfaces", "liquids"],
      ownTurnOnly: true,
      preventsFallingDuringMovement: true,
      walkingSpeed: 45,
      speedTraceId: "speed.walking",
    });
    expect(evaluation.traces[capability?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featureId, page: 51 }),
    );
    expect(capability?.instructions.join(" ")).toContain("when you stop");
    for (const speed of ["speed.climb", "speed.swim", "speed.fly"])
      expect(evaluation.values[speed]).toBeUndefined();
    expect(evaluation.actions.some(({ id }) => id.includes("acrobatic"))).toBe(false);
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
  });

  it("advances 8→9 while preserving earlier records, possessions, and spent resources", () => {
    const { character, rulesPackage, catalog } = setup(8);
    character.state.currentHitPoints = 17;
    character.state.temporaryHitPoints = 3;
    character.state.expendedResources = { [focusId]: 8, [wholenessId]: 1 };
    const before = structuredClone(character);
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    expect(next.loadout).toEqual(before.loadout);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.resources.find(({ id }) => id === focusId)).toMatchObject({
      maximum: 9,
      expended: 8,
      current: 1,
    });
    expect(evaluation.resources.find(({ id }) => id === wholenessId)?.expended).toBe(1);
    expect(evaluation.movementCapabilities?.[0]?.available).toBe(true);
  });

  it.each([
    ["light armor", "srd521.equipment.armor.light.leather-armor"],
    ["medium armor", "srd521.equipment.armor.medium.hide-armor"],
    ["heavy armor", "srd521.equipment.armor.heavy.chain-mail"],
    ["Shield", "srd521.equipment.shield"],
  ])("blocks movement with equipped %s, but not merely carried equipment", (_name, entityId) => {
    if (!entityId) throw new Error("Missing equipment ID");
    const { character, input, rulesPackage } = setup();
    expect(rulesPackage.entities.some(({ id }) => id === entityId)).toBe(true);
    character.loadout.inventory.push({ id: "movement-test-gear", entityId, quantity: 1 });
    expect(evaluateCharacter(input).movementCapabilities?.[0]?.available).toBe(true);
    character.loadout.equippedItemIds.push("movement-test-gear");
    const blocked = evaluateCharacter(input).movementCapabilities?.[0];
    expect(blocked?.available).toBe(false);
    expect(blocked?.reasons.join(" ")).toContain(entityId.includes("shield") ? "Shield" : "armor");
    character.loadout.equippedItemIds = character.loadout.equippedItemIds.filter(
      (id) => id !== "movement-test-gear",
    );
    expect(evaluateCharacter(input).movementCapabilities?.[0]?.available).toBe(true);
  });

  it.each(["grappled", "restrained"])("does not bypass %s's zero Speed", (condition) => {
    const { character, input } = setup();
    character.state.conditionIds.push(`srd521.condition.${condition}`);
    const evaluation = evaluateCharacter(input);
    expect(evaluation.values["speed.walking"]?.value).toBe(0);
    expect(evaluation.movementCapabilities?.[0]).toMatchObject({
      available: false,
      walkingSpeed: 0,
      reasons: ["Current walking Speed permits no movement."],
    });
    expect(
      evaluation.traces[evaluation.movementCapabilities?.[0]?.traceId ?? ""]?.sourceReferences,
    ).toContainEqual(expect.objectContaining({ entityId: `srd521.condition.${condition}` }));
  });

  it.each([
    [1, 40],
    [3, 30],
    [5, 20],
  ])("uses final Exhaustion-adjusted Speed at level %i", (exhaustion, feet) => {
    const { character, input } = setup();
    character.state.exhaustion = exhaustion;
    const evaluation = evaluateCharacter(input);
    expect(evaluation.movementCapabilities?.[0]).toMatchObject({
      available: true,
      walkingSpeed: feet,
    });
    expect(evaluation.values["speed.walking"]?.value).toBe(feet);
  });

  it.each([
    ["longstrider", 55],
    ["haste", 90],
  ] as const)(
    "uses %s-adjusted movement without inventing additional movement modes",
    (spell, feet) => {
      const { character, input } = setup();
      character.state.activeEffectIds.push(`srd521.status.spell.${spell}`);
      const evaluation = evaluateCharacter(input);
      expect(evaluation.movementCapabilities?.[0]).toMatchObject({
        available: true,
        walkingSpeed: feet,
      });
      expect(evaluation.values["speed.climb"]).toBeUndefined();
      expect(evaluation.values["speed.swim"]).toBeUndefined();
    },
  );

  it.each([
    [8, monkId],
    [9, fighterId],
  ] as const)("does not grant the capability to level %i %s", (level, classId) => {
    expect(setup(level, classId).evaluation.movementCapabilities).toEqual([]);
  });

  it("does not require wielding only Monk weapons, unspent Focus, or action availability", () => {
    const { character, input } = setup();
    character.loadout.inventory.push({
      id: "non-monk-weapon",
      entityId: "srd521.equipment.weapon.longbow",
      quantity: 1,
    });
    character.loadout.equippedItemIds.push("non-monk-weapon");
    character.state.expendedResources[focusId] = 9;
    character.state.conditionIds.push("srd521.condition.incapacitated");
    const evaluation = evaluateCharacter(input);
    expect(evaluation.values["speed.walking"]?.value).toBe(45);
    expect(evaluation.movementCapabilities?.[0]?.available).toBe(true);
    expect(evaluation.actions.find(({ id }) => id === "action.flurry-of-blows")?.available).toBe(
      false,
    );
  });

  it("restores Focus without changing the passive capability or refreshing Wholeness on Short Rest", () => {
    const { character, input } = setup();
    character.state.expendedResources = { [focusId]: 9, [wholenessId]: 1 };
    const before = structuredClone(character);
    const short = proposeRest(input, { event: "short-rest" });
    expect(short.applicable).toBe(true);
    expect(short.nextState.expendedResources[focusId]).toBe(0);
    expect(short.nextState.expendedResources[wholenessId]).toBe(1);
    expect(
      proposeRest(input, { event: "long-rest" }).nextState.expendedResources[wholenessId],
    ).toBe(0);
    expect(character).toEqual(before);
    character.state = short.nextState;
    const use = proposeAction(input, { actionId: "action.flurry-of-blows" });
    expect(use.applicable).toBe(true);
    expect(use.nextState.expendedResources[focusId]).toBe(1);
    expect(evaluateCharacter(input).movementCapabilities?.[0]?.available).toBe(true);
  });

  it("keeps Wholeness at d8 and adds Wisdom healing, not level-10 Focus benefits", () => {
    const { character, input, evaluation } = setup();
    character.state.currentHitPoints = 1;
    const action = evaluation.actions.find(({ id }) => id === "action.wholeness-of-body");
    if (!action) throw new Error("Missing Wholeness action");
    expect(actionDiceRequest(action, evaluation, "Wholeness of Body")).toMatchObject({
      diceCount: 1,
      diceSize: 8,
      modifier: evaluation.facts["ability.wisdom.modifier"],
    });
    const proposal = proposeAction(input, { actionId: action.id, rolls: [8] });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(
      9 + Number(evaluation.facts["ability.wisdom.modifier"]),
    );
    expect(proposal.nextState.expendedResources[wholenessId]).toBe(1);
    expect(proposal.nextState.expendedResources[focusId] ?? 0).toBe(0);
    expect(
      evaluation.actions.find(({ id }) => id === "action.patient-defense")?.parameters
        ?.temporaryHitPoints,
    ).toBeUndefined();
  });

  it("keeps Evasion independent of Acrobatic Movement's armor restrictions", () => {
    const { character, input } = setup();
    character.loadout.inventory.push({
      id: "shield-test",
      entityId: "srd521.equipment.shield",
      quantity: 1,
    });
    character.loadout.equippedItemIds.push("shield-test");
    const evaluation = evaluateCharacter(input);
    expect(evaluation.movementCapabilities?.[0]?.available).toBe(false);
    expect(
      resolveSavingThrowDamage(evaluation, {
        ability: "dexterity",
        outcome: "success",
        damage: 21,
        damageOnSuccess: "half",
      }).damage,
    ).toBe(0);
    expect(
      resolveSavingThrowDamage(evaluation, {
        ability: "dexterity",
        outcome: "failure",
        damage: 21,
        damageOnSuccess: "half",
      }).damage,
    ).toBe(10);
  });

  it("derives capabilities from granted content, without a class-name branch", () => {
    const { rulesPackage, input } = setup(9, fighterId);
    const feature = rulesPackage.entities.find(
      ({ id }) => id === "srd521.class-feature.fighter.second-wind",
    );
    if (!feature) throw new Error("Missing granted feature");
    const annotation = featureAutomationBodySchema.parse({
      movementCapabilities: [
        {
          id: "test.movement.liquid-stride",
          surfaces: ["liquids"],
          instructions: ["Declared movement only."],
        },
      ],
    });
    feature.body = {
      ...featureAutomationBodySchema.parse(feature.body),
      movementCapabilities: annotation.movementCapabilities,
    };
    expect(evaluateCharacter(input).movementCapabilities).toEqual([
      expect.objectContaining({
        id: "test.movement.liquid-stride",
        sourceId: feature.id,
        surfaces: ["liquids"],
        available: true,
        ownTurnOnly: false,
      }),
    ]);
  });
});

describe("movement capability metadata validation", () => {
  it.each([
    { id: "test.movement", surfaces: [] },
    { id: "test.movement", surfaces: ["flight"] },
    { id: "test.movement", surfaces: ["liquids"], requiresNoArmor: "yes" },
    { id: "test.movement", surfaces: ["liquids"], speedBonus: 30 },
    { id: "test.movement", surfaces: ["liquids"], instructions: [""] },
  ])("rejects invalid metadata %j", (metadata) => {
    expect(movementCapabilitySchema.safeParse(metadata).success).toBe(false);
  });
});
