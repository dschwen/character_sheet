import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import {
  evaluateCharacter,
  proposeAction,
  proposeRest,
  proposeSpellCast,
  spellPreparationEditor,
} from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  paladinId,
  validateBuilderDraft,
  type BuilderClassId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { actionInstructions, actionTargeting, actionTargetingRequest } from "./action-targeting";
import { loadWebData } from "./server-data";

const options = { id: "paladin-nine", now: new Date("2026-10-11T20:00:00Z") };
const channel = "srd521.resource.paladin.channel-divinity";
const layOnHands = "srd521.resource.paladin.lay-on-hands";
const actionId = "action.abjure-foes";
const featureId = "srd521.class-feature.paladin.abjure-foes";
const automatic = ["srd521.spell.beacon-of-hope", "srd521.spell.dispel-magic"];
function setup(level = 9, classId: BuilderClassId = paladinId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(classId, catalog, level, "Devout Defender");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  const action = evaluation.actions.find(({ id }) => id === actionId);
  return { rulesPackage, catalog, draft, character, input, evaluation, action };
}

describe("Paladin level 9", () => {
  it("creates a legal Devotion Paladin with third-level slots and separate oath spells", () => {
    const { draft, catalog, character, evaluation, action, rulesPackage } = setup();
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 9,
      alwaysPreparedSpells: 8,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 2 },
      ],
    });
    expect(character.loadout.preparedSpellIds).toHaveLength(9);
    for (const spellId of automatic) {
      expect(character.loadout.preparedSpellIds).not.toContain(spellId);
      expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
        level: 3,
        prepared: true,
      });
      expect(spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds).toContain(
        spellId,
      );
    }
    expect(evaluation.resources.find(({ id }) => id === layOnHands)?.maximum).toBe(45);
    expect(evaluation.resources.find(({ id }) => id === channel)?.maximum).toBe(2);
    expect(evaluation.facts["attackAction.attacks"]).toBe(2);
    expect(action).toMatchObject({ actionEconomy: "magic-action", available: true });
    expect(evaluation.traces[action?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featureId, page: 55 }),
    );
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
    expect(
      evaluation.savingThrowAuras?.flatMap(
        (aura) => aura.conditionImmunities?.flatMap(({ conditionIds }) => conditionIds) ?? [],
      ),
    ).not.toContain("srd521.condition.frightened");
  });

  it("advances 8→9 without rewriting choices, possessions, HP, or expended state", () => {
    const { character, rulesPackage, catalog } = setup(8);
    character.state.currentHitPoints = 17;
    character.state.temporaryHitPoints = 3;
    character.state.expendedResources = { [channel]: 2, [layOnHands]: 21 };
    character.state.expendedSpellSlots = { "1": 3, "2": 2 };
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    expect(next.loadout.inventory).toEqual(before.loadout.inventory);
    expect(next.loadout.currency).toEqual(before.loadout.currency);
    expect(next.loadout.preparedSpellIds).toEqual(
      expect.arrayContaining(before.loadout.preparedSpellIds),
    );
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.resources.find(({ id }) => id === layOnHands)).toMatchObject({
      maximum: 45,
      expended: 21,
      current: 24,
    });
    expect(evaluation.resources.find(({ id }) => id === channel)).toMatchObject({
      maximum: 2,
      expended: 2,
      current: 0,
    });
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 3)).toMatchObject({
      maximum: 2,
      expended: 0,
      current: 2,
    });
    expect(evaluation.actions.find(({ id }) => id === actionId)?.available).toBe(false);
  });

  it.each(automatic)(
    "casts automatic %s with third-level slots, but not under-level or exhausted slots",
    (spellId) => {
      const { character, input } = setup();
      const before = structuredClone(character);
      expect(proposeSpellCast(input, { spellId, slotLevel: 2 })).toMatchObject({
        applicable: false,
        changes: [],
        nextState: character.state,
      });
      const cast = proposeSpellCast(input, { spellId, slotLevel: 3 });
      expect(cast.applicable).toBe(true);
      expect(cast.nextState.expendedSpellSlots["3"]).toBe(1);
      if (spellId.endsWith("beacon-of-hope"))
        expect(cast.nextState.concentrationSpellId).toBe(spellId);
      expect(character).toEqual(before);
      character.state.expendedSpellSlots["3"] = 2;
      expect(proposeSpellCast(input, { spellId, slotLevel: 3 })).toMatchObject({
        applicable: false,
        changes: [],
        nextState: character.state,
      });
      expect(proposeRest(input, { event: "short-rest" }).nextState.expendedSpellSlots["3"]).toBe(2);
      expect(proposeRest(input, { event: "long-rest" }).nextState.expendedSpellSlots["3"]).toBe(0);
    },
  );

  it.each([8, 9])("does not grant level-9 oath spells or Abjure Foes early (level %i)", (level) => {
    const { evaluation, character, rulesPackage } = setup(level);
    for (const id of automatic)
      expect(
        spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds.includes(id),
      ).toBe(level === 9);
    expect(evaluation.actions.some(({ id }) => id === actionId)).toBe(level === 9);
  });
});

describe("Abjure Foes and shared declared targeting", () => {
  it.each(["incapacitated", "unconscious"])("cannot spend an action while %s", (condition) => {
    const { character, input } = setup();
    character.state.conditionIds.push(`srd521.condition.${condition}`);
    expect(
      proposeAction(input, { actionId, targeting: { count: 1, eligibilityConfirmed: true } }),
    ).toMatchObject({ applicable: false, changes: [], nextState: character.state });
  });
  it("resolves the current Charisma target limit, save DC, and source-linked instructions", () => {
    const { evaluation, action } = setup();
    if (!action) throw new Error("Missing Abjure Foes");
    const targeting = actionTargeting(action);
    expect(targeting).toMatchObject({
      maximum: evaluation.facts["ability.charisma.modifier"],
      rangeFeet: 60,
      requiresSight: true,
    });
    expect(action.parameters?.savingThrow).toEqual({
      ability: "wisdom",
      difficultyClass: evaluation.spellcasting?.saveDifficultyClass,
    });
    expect(evaluation.traces[targeting?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featureId, page: 55 }),
    );
    expect(actionInstructions(action).join(" ")).toContain("set Frightened on that target's sheet");
    expect(actionInstructions(action).join(" ")).toContain("until it takes any damage");
    expect(actionInstructions(action).join(" ")).toContain("does not require Concentration");
    expect(actionInstructions(action).join(" ")).toContain(
      "move, take an action, or take a Bonus Action",
    );
  });

  it.each([3, 8, 10, 16])(
    "recomputes target capacity from actual Charisma (base score %i)",
    (score) => {
      const { character, input } = setup();
      character.build.abilityScores.charisma = score;
      const evaluation = evaluateCharacter(input);
      expect(evaluation.validations).toEqual([]);
      const action = evaluation.actions.find(({ id }) => id === actionId);
      if (!action) throw new Error("Missing action");
      expect(actionTargeting(action)?.maximum).toBe(
        Math.max(1, Number(evaluation.facts["ability.charisma.modifier"])),
      );
      expect(action.parameters?.savingThrow).toEqual({
        ability: "wisdom",
        difficultyClass: evaluation.spellcasting?.saveDifficultyClass,
      });
    },
  );

  it("spends exactly one shared Channel Divinity use with a traced declaration and target guidance", () => {
    const { character, input, action } = setup();
    if (!action) throw new Error("Missing action");
    character.state.expendedResources[channel] = 1;
    character.state.concentrationSpellId = "srd521.spell.shield-of-faith";
    const before = structuredClone(character);
    const targeting = actionTargetingRequest(action, "1", true);
    if (!targeting) throw new Error("Missing target declaration");
    const proposal = proposeAction(input, { actionId, targeting });
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState).toEqual({
      ...before.state,
      expendedResources: { ...before.state.expendedResources, [channel]: 2 },
    });
    expect(character).toEqual(before);
    expect(proposal.targeting).toMatchObject({ count: 1, rangeFeet: 60, requiresSight: true });
    expect(proposal.guidance?.join(" ")).toContain("wisdom saving throw against DC");
    expect(proposal.guidance?.join(" ")).toContain("set Frightened on that target's sheet");
    expect(proposal.traces[proposal.targeting?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ entityId: featureId, page: 55 }),
    );
    expect(proposal.changes).toHaveLength(1);
    character.state = proposal.nextState;
    expect(proposeAction(input, { actionId, targeting })).toMatchObject({
      applicable: false,
      changes: [],
      nextState: character.state,
    });
    expect(proposeAction(input, { actionId: "action.divine-sense" }).applicable).toBe(false);
    expect(proposeAction(input, { actionId: "action.sacred-weapon" }).applicable).toBe(false);
    const short = proposeRest(input, { event: "short-rest" });
    expect(short.nextState.expendedResources[channel]).toBe(1);
    character.state = short.nextState;
    expect(proposeAction(input, { actionId, targeting }).applicable).toBe(true);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedResources[channel]).toBe(0);
  });

  it.each(["missing", "over-limit", "not-confirmed", "extra-rolls", "extra-amount"])(
    "rejects %s declarations without spending",
    (invalid) => {
      const { character, input, action } = setup();
      if (!action) throw new Error("Missing action");
      const targeting = {
        count: invalid === "over-limit" ? (actionTargeting(action)?.maximum ?? 1) + 1 : 1,
        eligibilityConfirmed: invalid !== "not-confirmed",
      };
      const before = structuredClone(character);
      const proposal = proposeAction(input, {
        actionId,
        ...(invalid === "missing" ? {} : { targeting }),
        ...(invalid === "extra-rolls" ? { rolls: [1] } : {}),
        ...(invalid === "extra-amount" ? { amount: 1 } : {}),
      });
      expect(proposal).toMatchObject({ applicable: false, changes: [], nextState: before.state });
      expect(proposal.targeting).toBeUndefined();
      expect(proposal.guidance).toBeUndefined();
      expect(character).toEqual(before);
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity])(
    "rejects malformed count %s before changing state",
    (count) => {
      const { character, input } = setup();
      const before = structuredClone(character);
      expect(() =>
        proposeAction(input, { actionId, targeting: { count, eligibilityConfirmed: true } }),
      ).toThrow();
      expect(character).toEqual(before);
    },
  );

  it.each(["", "0", "1.5", "100", "nope"])("validates UI target count %s", (count) => {
    const { action } = setup();
    if (!action) throw new Error("Missing action");
    expect(() => actionTargetingRequest(action, count, true)).toThrow();
  });

  it("requires the UI range/sight declaration and does not add targeting to unrelated actions", () => {
    const { action, input, evaluation } = setup();
    if (!action) throw new Error("Missing action");
    expect(() => actionTargetingRequest(action, "1", false)).toThrow("Confirm");
    const sense = evaluation.actions.find(({ id }) => id === "action.divine-sense");
    if (!sense) throw new Error("Missing Divine Sense");
    expect(actionTargetingRequest(sense, "100", false)).toBeUndefined();
    const proposal = proposeAction(input, {
      actionId: sense.id,
      targeting: { count: 1, eligibilityConfirmed: true },
    });
    expect(proposal.applicable).toBe(false);
    expect(proposal.validations.map(({ code }) => code)).toContain("ACTION_TARGETING_NOT_EXPECTED");
  });

  it.each([
    [8, paladinId],
    [9, fighterId],
  ] as const)("does not authorize Abjure Foes for level %i %s", (level, classId) => {
    const { character, input } = setup(level, classId);
    expect(
      proposeAction(input, { actionId, targeting: { count: 1, eligibilityConfirmed: true } }),
    ).toMatchObject({ applicable: false, changes: [], nextState: character.state });
  });
});
