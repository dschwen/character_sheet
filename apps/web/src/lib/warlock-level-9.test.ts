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
  featureChoiceOptionsForLevel,
  validateBuilderDraft,
  warlockId,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "warlock-nine", now: new Date("2026-10-11T17:00:00Z") };
const choiceId = "srd521.choice.warlock.eldritch-invocation";
const invocation = (slug: string) => `srd521.option.warlock.invocation.${slug}`;
const contact = "srd521.spell.contact-other-plane";
const contactSource = "srd521.class-feature.warlock.contact-patron";
const contactResource = "srd521.resource.warlock.contact-patron";
const eye = "srd521.spell.arcane-eye";
const visions = invocation("visions-of-distant-realms");
function setup(level = 9) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(warlockId, catalog, level, "Ninth-level Warlock");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, draft, character, input, evaluation: evaluateCharacter(input) };
}

describe("Warlock level 9 Pact Magic and invocation advancement", () => {
  it("creates a legal caster with seven invocations, ten ordinary preparations, and two fifth-level slots", () => {
    const { character, evaluation, draft, catalog, rulesPackage } = setup();
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations).toEqual([]);
    expect(draft.featureChoiceSelections[choiceId]).toHaveLength(7);
    expect(character.loadout.preparedSpellIds).toHaveLength(10);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.spellcasting).toMatchObject({
      model: "pact-magic",
      cantripsKnown: 3,
      preparedSpellLimit: 10,
      alwaysPreparedSpells: 13,
      slots: [{ level: 5, maximum: 2, current: 2 }],
    });
    const slot = evaluation.spellcasting?.slots[0];
    expect(evaluation.traces[slot?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 71 })]),
    );
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
    for (const spellId of [contact, eye, "srd521.spell.geas", "srd521.spell.insect-plague"]) {
      expect(character.loadout.preparedSpellIds).not.toContain(spellId);
      expect(evaluation.spells.find(({ id }) => id === spellId)?.prepared).toBe(true);
      expect(spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds).toContain(
        spellId,
      );
    }
  });

  it.each([0, 1, 2])(
    "advances spent Pact slots (%s) into the fifth-level pool without refreshing state",
    (spent) => {
      const { character, catalog, rulesPackage } = setup(8);
      character.state.currentHitPoints = 11;
      character.state.temporaryHitPoints = 2;
      character.state.expendedSpellSlots = { "4": spent };
      character.state.expendedResources["srd521.resource.warlock.dark-ones-own-luck"] = 1;
      const before = structuredClone(character);
      const draft = createLevelUpDraft(character, catalog);
      const next = levelUpCharacter(character, draft, rulesPackage, options);
      expect(character).toEqual(before);
      expect(next.state).toEqual({ ...before.state, expendedSpellSlots: { "5": spent } });
      expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
      expect(next.build.levels[8]?.selectedFeatureChoices).toContainEqual({
        choiceId,
        optionIds: [visions],
      });
      expect(next.build.featIds).toEqual(before.build.featIds);
      expect(next.loadout.inventory).toEqual(before.loadout.inventory);
      expect(next.loadout.currency).toEqual(before.loadout.currency);
      const input = { character: next, packages: [rulesPackage] };
      const evaluation = evaluateCharacter(input);
      expect(evaluation.validations).toEqual([]);
      expect(evaluation.spellcasting?.slots).toMatchObject([
        { level: 5, maximum: 2, expended: spent, current: 2 - spent },
      ]);
      expect(
        proposeSpellCast(input, { spellId: "srd521.spell.geas", slotLevel: 5 }).applicable,
      ).toBe(spent < 2);
      for (const event of ["short-rest", "long-rest"] as const)
        expect(proposeRest(input, { event }).nextState.expendedSpellSlots["5"]).toBe(0);
    },
  );

  it("uses fifth-level Pact slots for lower-level spells and Magical Cunning restores one", () => {
    const { character, input } = setup();
    expect(
      proposeSpellCast(input, { spellId: "srd521.spell.command", slotLevel: 1 }).applicable,
    ).toBe(false);
    expect(
      proposeSpellCast(input, { spellId: "srd521.spell.command", slotLevel: 4 }).applicable,
    ).toBe(false);
    const cast = proposeSpellCast(input, { spellId: "srd521.spell.command", slotLevel: 5 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots).toEqual({ "5": 1 });
    character.state.expendedSpellSlots["5"] = 2;
    const cunning = proposeAction(input, { actionId: "action.magical-cunning" });
    expect(cunning.applicable).toBe(true);
    expect(cunning.nextState.expendedSpellSlots["5"]).toBe(1);
    expect(cunning.nextState.expendedResources[contactResource] ?? 0).toBe(0);
  });

  it.each(["missing", "duplicate", "level-12", "prerequisite", "early"])(
    "rejects %s invocation choices",
    (reason) => {
      const { draft, catalog } = setup(reason === "early" ? 8 : 9);
      const selected = [...(draft.featureChoiceSelections[choiceId] ?? [])];
      if (reason === "missing") selected.pop();
      if (reason === "duplicate") selected[6] = selected[0] ?? "";
      if (reason === "level-12") selected[6] = invocation("devouring-blade");
      if (reason === "prerequisite") selected[6] = invocation("lifedrinker");
      if (reason === "early") selected[5] = visions;
      draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [choiceId]: selected };
      expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
    },
  );

  it("allows one invocation replacement alongside the new seventh selection, not two replacements", () => {
    const { character, catalog, rulesPackage } = setup(8);
    const draft = createLevelUpDraft(character, catalog);
    const selected = [...(draft.featureChoiceSelections[choiceId] ?? [])];
    const replace = selected.indexOf(invocation("fiendish-vigor"));
    selected[replace] = invocation("armor-of-shadows");
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [choiceId]: [...selected] };
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    selected[selected.indexOf(invocation("devil-s-sight"))] = invocation("otherworldly-leap");
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [choiceId]: selected };
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toContain(
      "Replace no more than 1 Warlock feature option during level up.",
    );
    const choice = catalog.classes[warlockId].featureChoices.find(({ id }) => id === choiceId);
    if (!choice) throw new Error("Missing invocation choice");
    expect(
      featureChoiceOptionsForLevel(choice, 8).find(({ id }) => id === visions)?.minimumClassLevel,
    ).toBe(9);
    expect(featureChoiceOptionsForLevel(choice, 9).map(({ id }) => id)).toContain(visions);
  });
});

describe("Contact Patron and resource-free invocation casting", () => {
  it("reads free-cast instructions from authored data, not a Warlock UI branch", () => {
    const { rulesPackage, character } = setup();
    const modified = structuredClone(rulesPackage);
    const feature = modified.entities.find(({ id }) => id === contactSource);
    if (!feature) throw new Error("Missing Contact Patron feature");
    feature.body = {
      ...(feature.body as Record<string, unknown>),
      freeSpellCasting: {
        classId: warlockId,
        resourceId: contactResource,
        spellIds: [contact],
        guidance: ["Authored alternate instruction"],
      },
    };
    expect(
      proposeSpellCast(
        { character, packages: [modified] },
        { spellId: contact, useFreeCast: true, castingSourceId: contactSource },
      ).guidance,
    ).toEqual(["Authored alternate instruction"]);
  });

  it("removes at-will spell access when Visions of Distant Realms is not selected", () => {
    const { draft, rulesPackage } = setup();
    draft.featureChoiceSelections = {
      ...draft.featureChoiceSelections,
      [choiceId]: (draft.featureChoiceSelections[choiceId] ?? []).map((id) =>
        id === visions ? invocation("armor-of-shadows") : id,
      ),
    };
    const character = buildCharacter(draft, rulesPackage, options);
    const input = { character, packages: [rulesPackage] };
    expect(evaluateCharacter(input).validations).toEqual([]);
    expect(spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds).not.toContain(
      eye,
    );
    expect(
      proposeSpellCast(input, { spellId: eye, useFreeCast: true, castingSourceId: visions })
        .applicable,
    ).toBe(false);
  });

  it("spends Contact Patron once, without a Pact slot, with free-cast-only automatic save guidance", () => {
    const { character, input, evaluation } = setup();
    character.state.expendedSpellSlots["5"] = 2;
    const before = structuredClone(character);
    expect(evaluation.resources.find(({ id }) => id === contactResource)).toMatchObject({
      maximum: 1,
      current: 1,
    });
    const cast = proposeSpellCast(input, {
      spellId: contact,
      useFreeCast: true,
      castingSourceId: contactSource,
    });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedResources[contactResource]).toBe(1);
    expect(cast.nextState.expendedSpellSlots).toEqual({ "5": 2 });
    expect(cast.guidance?.join(" ")).toContain("automatically succeed");
    expect(cast.guidance?.join(" ")).toContain("contact your patron");
    expect(Object.values(cast.traces).flatMap(({ sourceReferences }) => sourceReferences)).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: contactSource, page: 72 })]),
    );
    expect(character).toEqual(before);
    character.state = cast.nextState;
    expect(
      proposeSpellCast(input, {
        spellId: contact,
        useFreeCast: true,
        castingSourceId: contactSource,
      }),
    ).toMatchObject({ applicable: false, changes: [], nextState: character.state });
    expect(
      proposeRest(input, { event: "short-rest" }).nextState.expendedResources[contactResource],
    ).toBe(1);
    expect(
      proposeRest(input, { event: "long-rest" }).nextState.expendedResources[contactResource],
    ).toBe(0);
    character.state.expendedSpellSlots["5"] = 0;
    expect(proposeSpellCast(input, { spellId: contact, slotLevel: 5 }).applicable).toBe(true);
    expect(proposeSpellCast(input, { spellId: contact, asRitual: true }).applicable).toBe(true);
    expect(proposeSpellCast(input, { spellId: contact, slotLevel: 5 }).guidance ?? []).toEqual([]);
    expect(proposeSpellCast(input, { spellId: contact, asRitual: true }).guidance ?? []).toEqual(
      [],
    );
  });

  it("does not grant Contact Patron or its use before level 9", () => {
    const { evaluation, input } = setup(8);
    expect(evaluation.resources.some(({ id }) => id === contactResource)).toBe(false);
    expect(evaluation.spells.find(({ id }) => id === contact)?.prepared).not.toBe(true);
    expect(
      proposeSpellCast(input, {
        spellId: contact,
        useFreeCast: true,
        castingSourceId: contactSource,
      }).applicable,
    ).toBe(false);
  });

  it("casts Arcane Eye repeatedly at will, starts Concentration, and spends no resource or slot", () => {
    const { character, input, evaluation, rulesPackage } = setup();
    character.state.expendedSpellSlots["5"] = 2;
    character.state.expendedResources[contactResource] = 1;
    const option = evaluation.spells
      .find(({ id }) => id === eye)
      ?.castingOptions?.find(({ sourceId }) => sourceId === visions);
    expect(option).toMatchObject({ freeCastAtWill: true, freeCastAvailable: true });
    expect(option?.freeCastResourceId).toBeUndefined();
    expect(proposeSpellCast(input, { spellId: eye, useFreeCast: true }).applicable).toBe(true);
    expect(spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds).toContain(eye);
    for (let index = 0; index < 3; index++) {
      const before = structuredClone(character);
      const cast = proposeSpellCast(input, {
        spellId: eye,
        useFreeCast: true,
        castingSourceId: visions,
      });
      expect(cast.applicable).toBe(true);
      expect(cast.freeCastAtWill).toBe(true);
      expect(cast.nextState.expendedSpellSlots).toEqual(before.state.expendedSpellSlots);
      expect(cast.nextState.expendedResources).toEqual(before.state.expendedResources);
      expect(cast.nextState.concentrationSpellId).toBe(eye);
      expect(character).toEqual(before);
      character.state = cast.nextState;
    }
  });

  it.each(["slot", "ritual", "wrong-spell", "wrong-source", "incapacitated"])(
    "rejects invalid free-cast request: %s",
    (reason) => {
      const { character, input } = setup();
      if (reason === "incapacitated")
        character.state.conditionIds = ["srd521.condition.incapacitated"];
      const request = {
        spellId: eye,
        useFreeCast: true,
        castingSourceId: visions,
        ...(reason === "slot" ? { slotLevel: 5 } : {}),
        ...(reason === "ritual" ? { asRitual: true } : {}),
      };
      if (reason === "wrong-spell") request.spellId = contact;
      if (reason === "wrong-source") request.castingSourceId = contactSource;
      const cast = proposeSpellCast(input, request);
      expect(cast).toMatchObject({ applicable: false, changes: [], nextState: character.state });
      expect(cast.guidance).toBeUndefined();
    },
  );

  it("does not authorize at-will casting from a forged early invocation", () => {
    const { character, input } = setup(8);
    const selection = character.build.levels
      .flatMap(({ selectedFeatureChoices }) => selectedFeatureChoices)
      .find(({ choiceId: id }) => id === choiceId);
    if (!selection) throw new Error("Missing test selection");
    selection.optionIds[0] = visions;
    expect(
      evaluateCharacter(input).validations.some(
        ({ code }) => code === "WARLOCK_ELDRITCH_INVOCATION_LEVEL_REQUIRED",
      ),
    ).toBe(true);
    expect(
      proposeSpellCast(input, { spellId: eye, useFreeCast: true, castingSourceId: visions })
        .applicable,
    ).toBe(false);
  });
});
