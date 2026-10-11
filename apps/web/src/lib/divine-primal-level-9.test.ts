import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { evaluateCharacter, proposeRest, proposeSpellCast } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  clericId,
  defaultBuilderDraft,
  druidId,
  updateBuilderFeatureChoice,
  validateBuilderDraft,
  type BuilderClassId,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";
import { proposePreparedSpellLoadout, spellPreparationEditor } from "./spell-preparation";

const options = { id: "divine-primal-nine", now: new Date("2026-10-11T13:00:00Z") };
const landChoice = "srd521.choice.druid.circle-of-land";
const recoverySource = "srd521.subclass-feature.druid.circle-of-the-land.natural-recovery";
const recoveryResource = "srd521.resource.druid.natural-recovery";
const freeResource = "srd521.resource.druid.natural-recovery-free-cast";
const lands = [
  ["arid", "wall-of-stone"],
  ["polar", "cone-of-cold"],
  ["temperate", "tree-stride"],
  ["tropical", "insect-plague"],
] as const;

function setup(classId: BuilderClassId = clericId, level = 9, land = "arid") {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  let draft = defaultBuilderDraft(classId, catalog, level, "Divine caster nine");
  if (classId === druidId && level >= 3)
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      landChoice,
      `srd521.option.druid.land.${land}`,
    );
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, draft, character, input, evaluation: evaluateCharacter(input) };
}

describe.each([clericId, druidId] as const)("%s level 9", (classId) => {
  it("creates a legal fifth-level caster with source-linked slots and fourteen regular preparations", () => {
    const { character, evaluation, draft, catalog } = setup(classId);
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 14,
      cantripsKnown: 4, // Default Druid Magician adds one to the table's three.
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
        { level: 4, maximum: 3 },
        { level: 5, maximum: 1 },
      ],
    });
    expect(character.loadout.preparedSpellIds).toHaveLength(14);
    const fifth = evaluation.spellcasting?.slots.find(({ level }) => level === 5);
    expect(evaluation.traces[fifth?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: classId === clericId ? 36 : 41 })]),
    );
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(
      evaluation.resources.find(
        ({ id }) =>
          id ===
          (classId === clericId
            ? "srd521.resource.cleric.channel-divinity"
            : "srd521.resource.druid.wild-shape"),
      ),
    ).toMatchObject({ maximum: 3 });
  });

  it("advances 8→9 without refreshing play state or changing earlier acquisitions", () => {
    const { character, rulesPackage, catalog } = setup(classId, 8);
    character.state.currentHitPoints = 11;
    character.state.temporaryHitPoints = 2;
    character.state.expendedSpellSlots = { "1": 2, "4": 2 };
    character.state.expendedResources[
      classId === clericId
        ? "srd521.resource.cleric.channel-divinity"
        : "srd521.resource.druid.wild-shape"
    ] = 2;
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    expect(next.build.learnedSpellIds).toEqual(before.build.learnedSpellIds);
    expect(next.loadout.inventory).toEqual(before.loadout.inventory);
    expect(next.loadout.equippedItemIds).toEqual(before.loadout.equippedItemIds);
    expect(next.loadout.currency).toEqual(before.loadout.currency);
    expect(next.loadout.preparedSpellIds).toHaveLength(14);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 5)).toMatchObject({
      current: 1,
    });
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 4)).toMatchObject({
      current: 1,
      expended: 2,
    });
  });

  it("permits full-list fifth-level preparation without spellbook learning and rejects illegal loadouts", () => {
    const { character, rulesPackage } = setup(classId);
    const editor = spellPreparationEditor(character, rulesPackage);
    expect(editor).toMatchObject({ mode: "full-list", editable: true, requiredSelections: 14 });
    const selected = editor?.options.find(
      ({ level, alwaysPrepared, selected }) => level === 5 && !alwaysPrepared && !selected,
    );
    if (!selected) throw new Error("Missing fifth-level preparation option");
    expect(character.build.learnedSpellIds).not.toContain(selected.id);
    const preparations = [selected.id, ...character.loadout.preparedSpellIds.slice(1)];
    const proposal = proposePreparedSpellLoadout(character, rulesPackage, preparations);
    expect(proposal.applicable).toBe(true);
    if (!proposal.nextCharacter) throw new Error("Missing prepared character");
    expect(
      evaluateCharacter({ character: proposal.nextCharacter, packages: [rulesPackage] })
        .validations,
    ).toEqual([]);
    expect(
      proposeSpellCast(
        { character: proposal.nextCharacter, packages: [rulesPackage] },
        { spellId: selected.id, slotLevel: 5 },
      ).applicable,
    ).toBe(true);
    const duplicate = preparations[1];
    const automatic = editor?.alwaysPreparedSpellIds[0];
    if (!duplicate || !automatic) throw new Error("Missing invalid-loadout test candidates");
    for (const invalid of [
      preparations.slice(1),
      [duplicate, ...preparations.slice(1)],
      ["srd521.spell.wish", ...preparations.slice(1)],
      ["srd521.spell.magic-missile", ...preparations.slice(1)],
      [automatic, ...preparations.slice(1)],
    ])
      expect(proposePreparedSpellLoadout(character, rulesPackage, invalid).applicable).toBe(false);
  });

  it("spends the fifth-level slot once, rejects undercasting atomically, and restores it on Long Rest", () => {
    const { character, input } = setup(classId);
    const spellId =
      classId === clericId ? "srd521.spell.mass-cure-wounds" : "srd521.spell.wall-of-stone";
    const before = structuredClone(character);
    expect(proposeSpellCast(input, { spellId, slotLevel: 4 }).applicable).toBe(false);
    const cast = proposeSpellCast(input, { spellId, slotLevel: 5 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["5"]).toBe(1);
    expect(character).toEqual(before);
    character.state = cast.nextState;
    const rejected = proposeSpellCast(input, { spellId, slotLevel: 5 });
    expect(rejected).toMatchObject({ applicable: false, changes: [], nextState: character.state });
    expect(proposeRest(input, { event: "short-rest" }).nextState.expendedSpellSlots["5"]).toBe(1);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedSpellSlots["5"]).toBe(0);
  });
});

describe("level-9 domain and land grants", () => {
  it("keeps the Druid's three table cantrips separate from Magician's additional cantrip", () => {
    const { draft, catalog, rulesPackage } = setup(druidId);
    const warden = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.druid.primal-order",
      "srd521.option.druid.primal-order.warden",
    );
    const character = buildCharacter(warden, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.cantripsKnown).toBe(3);
    expect(evaluation.spellcasting?.preparedSpellLimit).toBe(14);
  });

  it("does not replace existing Concentration when freely casting instantaneous Cone of Cold", () => {
    const { character, input } = setup(druidId, 9, "polar");
    character.state.concentrationSpellId = "srd521.spell.entangle";
    const cast = proposeSpellCast(input, {
      spellId: "srd521.spell.cone-of-cold",
      useFreeCast: true,
      castingSourceId: recoverySource,
    });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.concentrationSpellId).toBe("srd521.spell.entangle");
  });

  it.each(["greater-restoration", "mass-cure-wounds"])(
    "grants Life Domain %s automatically, but not at level 8",
    (slug) => {
      const { character, input, evaluation, rulesPackage } = setup();
      const spellId = `srd521.spell.${slug}`;
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(10);
      expect(character.loadout.preparedSpellIds).not.toContain(spellId);
      expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
        prepared: true,
        level: 5,
      });
      expect(spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds).toContain(
        spellId,
      );
      expect(proposeSpellCast(input, { spellId, slotLevel: 5 }).applicable).toBe(true);
      expect(
        setup(clericId, 8).evaluation.spells.find(({ id }) => id === spellId)?.prepared,
      ).not.toBe(true);
    },
  );

  it.each(lands)(
    "grants the %s fifth-level Circle spell and spends only the Natural Recovery free-cast use",
    (land, slug) => {
      const { character, input, evaluation, rulesPackage } = setup(druidId, 9, land);
      const spellId = `srd521.spell.${slug}`;
      expect(evaluation.validations).toEqual([]);
      expect(character.loadout.preparedSpellIds).not.toContain(spellId);
      expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
        prepared: true,
        level: 5,
      });
      expect(spellPreparationEditor(character, rulesPackage)?.alwaysPreparedSpellIds).toContain(
        spellId,
      );
      expect(
        setup(druidId, 8, land).evaluation.spells.find(({ id }) => id === spellId)?.prepared,
      ).not.toBe(true);
      const cast = proposeSpellCast(input, {
        spellId,
        useFreeCast: true,
        castingSourceId: recoverySource,
      });
      expect(cast.applicable).toBe(true);
      expect(cast.nextState.expendedSpellSlots).toEqual({});
      expect(cast.nextState.expendedResources[freeResource]).toBe(1);
      expect(cast.nextState.expendedResources[recoveryResource] ?? 0).toBe(0);
      expect(cast.nextState.concentrationSpellId).toBe(land === "polar" ? undefined : spellId);
      character.state = cast.nextState;
      expect(
        proposeSpellCast(input, { spellId, useFreeCast: true, castingSourceId: recoverySource })
          .applicable,
      ).toBe(false);
      expect(proposeSpellCast(input, { spellId, slotLevel: 5 }).applicable).toBe(true);
      expect(
        proposeRest(input, { event: "short-rest" }).nextState.expendedResources[freeResource],
      ).toBe(1);
      expect(
        proposeRest(input, { event: "long-rest" }).nextState.expendedResources[freeResource],
      ).toBe(0);
    },
  );

  it("recovers a fifth-level slot once independently of the free-cast resource", () => {
    const { character, input, evaluation } = setup(druidId);
    const recovery = evaluation.spellSlotRecoveries?.find(
      ({ sourceId }) => sourceId === recoverySource,
    );
    expect(recovery).toMatchObject({ maximumCombinedLevel: 5, maximumSlotLevel: 5 });
    expect(evaluation.traces[recovery?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 46 })]),
    );
    character.state.expendedSpellSlots["5"] = 1;
    character.state.expendedResources[freeResource] = 1;
    const request = {
      event: "short-rest" as const,
      spellSlotRecoveries: [{ sourceId: recoverySource, slots: [{ level: 5, count: 1 }] }],
    };
    const before = structuredClone(character);
    const rest = proposeRest(input, request);
    expect(rest.applicable).toBe(true);
    expect(rest.nextState.expendedSpellSlots["5"]).toBe(0);
    expect(rest.nextState.expendedResources[recoveryResource]).toBe(1);
    expect(rest.nextState.expendedResources[freeResource]).toBe(1);
    expect(character).toEqual(before);
    character.state = rest.nextState;
    character.state.expendedSpellSlots["5"] = 1;
    expect(proposeRest(input, request)).toMatchObject({
      applicable: false,
      changes: [],
      nextState: character.state,
    });
  });

  it("rejects Natural Recovery over budget or above fifth-level slots", () => {
    const { character, input } = setup(druidId);
    character.state.expendedSpellSlots = { "1": 1, "5": 1, "6": 1 };
    for (const slots of [
      [
        { level: 5, count: 1 },
        { level: 1, count: 1 },
      ],
      [{ level: 6, count: 1 }],
    ]) {
      const rest = proposeRest(input, {
        event: "short-rest",
        spellSlotRecoveries: [{ sourceId: recoverySource, slots }],
      });
      expect(rest).toMatchObject({ applicable: false, changes: [], nextState: character.state });
    }
  });

  it("does not free-cast an ordinary prepared spell through Natural Recovery", () => {
    const { character, input } = setup(druidId);
    const before = structuredClone(character);
    const spellId = character.loadout.preparedSpellIds[0];
    if (!spellId) throw new Error("Missing ordinary prepared spell");
    const rejected = proposeSpellCast(input, {
      spellId,
      useFreeCast: true,
      castingSourceId: recoverySource,
    });
    expect(rejected.applicable).toBe(false);
    expect(rejected.nextState).toEqual(character.state);
    expect(character).toEqual(before);
  });
});
