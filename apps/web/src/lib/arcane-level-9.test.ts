import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import {
  evaluateCharacter,
  proposeRest,
  proposeSpellCast,
  spellPreparationEditor,
  proposePreparedSpellLoadout,
} from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  wizardId,
  sorcererId,
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

const options = { id: "arcane-nine", now: new Date("2026-10-11T11:00:00Z") };
const savant = "srd521.choice.wizard.evocation-savant.level-9";
const cone = "srd521.spell.cone-of-cold";
function setup(classId: BuilderClassId = wizardId, level = 9) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(classId, catalog, level, "Ninth-level caster");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, draft, character, input, evaluation: evaluateCharacter(input) };
}

describe.each([wizardId, sorcererId] as const)("%s level-9 progression", (classId) => {
  it("creates a legal caster with fifth-level access, source traces, and fourteen regular preparations", () => {
    const { evaluation, draft, catalog, character } = setup(classId);
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 14,
      cantripsKnown: classId === wizardId ? 4 : 5,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
        { level: 4, maximum: 3 },
        { level: 5, maximum: 1 },
      ],
    });
    expect(character.loadout.preparedSpellIds).toHaveLength(14);
    expect(character.build.levels).toHaveLength(9);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
    const fifth = evaluation.spellcasting?.slots.find(({ level }) => level === 5);
    expect(evaluation.traces[fifth?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: classId === wizardId ? 77 : 65 })]),
    );
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
  });

  it("advances 8→9 preserving earlier feats, cantrips, choices, equipment, and spent state", () => {
    const { character, rulesPackage, catalog } = setup(classId, 8);
    character.state.currentHitPoints = 12;
    character.state.expendedSpellSlots = { "1": 2, "3": 1, "4": 2 };
    character.state.expendedResources[
      classId === wizardId
        ? "srd521.resource.wizard.arcane-recovery"
        : "srd521.resource.sorcerer.sorcery-points"
    ] = 1;
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(next.state).toEqual(character.state);
    expect(next.build.levels.slice(0, 8)).toEqual(character.build.levels);
    expect(next.build.featIds).toEqual(character.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(character.build.featAbilityScoreIncreases);
    expect(next.loadout.inventory).toEqual(character.loadout.inventory);
    expect(next.loadout.currency).toEqual(character.loadout.currency);
    expect(character).toEqual(before);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 5)).toMatchObject({
      current: 1,
      expended: 0,
    });
  });

  it("casts a fifth-level spell once and rejects missing slots or undercasting atomically", () => {
    const { character, input } = setup(classId);
    if (classId === wizardId && !character.build.learnedSpellIds.includes(cone))
      character.build.learnedSpellIds.push(cone);
    character.loadout.preparedSpellIds[0] = cone;
    const before = structuredClone(character);
    const cast = proposeSpellCast(input, { spellId: cone, slotLevel: 5 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["5"]).toBe(1);
    expect(cast.nextState.expendedSpellSlots["4"] ?? 0).toBe(0);
    expect(character).toEqual(before);
    expect(proposeSpellCast(input, { spellId: cone, slotLevel: 4 }).applicable).toBe(false);
    character.state = cast.nextState;
    const rejected = proposeSpellCast(input, { spellId: cone, slotLevel: 5 });
    expect(rejected.applicable).toBe(false);
    expect(rejected.nextState).toEqual(character.state);
    expect(rejected.changes).toEqual([]);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedSpellSlots["5"]).toBe(0);
  });
});

describe("Evoker and Draconic Sorcery fifth-level distinctions", () => {
  it("adds two normal Wizard spells plus a separate Savant addition at level 9", () => {
    const { character, rulesPackage, catalog } = setup(wizardId, 8);
    const draft = createLevelUpDraft(character, catalog);
    expect(draft.featureChoiceSelections[savant]).toHaveLength(1);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(next.build.learnedSpellIds.length - character.build.learnedSpellIds.length).toBe(3);
    expect(next.build.learnedSpellIds).toHaveLength(31);
    expect(
      evaluateCharacter({ character: next, packages: [rulesPackage] }).spellcasting
        ?.spellbookMinimum,
    ).toBe(27);
    expect(next.build.levels[8]?.selectedFeatureChoices).toContainEqual({
      choiceId: savant,
      optionIds: draft.featureChoiceSelections[savant],
    });
    expect(next.loadout.preparedSpellIds).toHaveLength(14);
  });

  it.each([
    "srd521.spell.wall-of-ice",
    "srd521.spell.teleportation-circle",
    "srd521.spell.fire-bolt",
    "srd521.spell.flame-strike",
  ])("rejects ineligible Savant spell %s", (spellId) => {
    const { draft, catalog } = setup();
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [savant]: [spellId] };
    expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
  });

  it("requires the level-9 Savant choice and does not acquire it at level 8", () => {
    const { character, catalog, rulesPackage } = setup(wizardId, 8);
    expect(
      character.build.levels
        .flatMap(({ selectedFeatureChoices }) => selectedFeatureChoices)
        .some(({ choiceId }) => choiceId === savant),
    ).toBe(false);
    const draft = createLevelUpDraft(character, catalog);
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [savant]: [] };
    expect(previewLevelUp(character, draft, rulesPackage, options).issues.length).toBeGreaterThan(
      0,
    );
  });

  it("rejects a forged early level-9 Savant selection", () => {
    const { draft, catalog } = setup(wizardId, 8);
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [savant]: [cone] };
    expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
  });

  it("keeps a Savant spell unprepared unless selected in the Wizard loadout", () => {
    const { character, rulesPackage } = setup();
    const selected = character.build.levels[8]?.selectedFeatureChoices.find(
      ({ choiceId }) => choiceId === savant,
    )?.optionIds[0];
    if (selected === undefined) throw new Error("Missing Savant selection");
    if (character.loadout.preparedSpellIds.includes(selected)) {
      const replacement = character.build.learnedSpellIds.find(
        (id) =>
          !character.loadout.preparedSpellIds.includes(id) &&
          id !== selected &&
          (
            rulesPackage.entities.find((entity) => entity.id === id)?.body as
              { level?: number } | undefined
          )?.level !== 0,
      );
      if (replacement === undefined) throw new Error("Missing replacement");
      character.loadout.preparedSpellIds = character.loadout.preparedSpellIds.map((id) =>
        id === selected ? replacement : id,
      );
    }
    const spell = evaluateCharacter({ character, packages: [rulesPackage] }).spells.find(
      ({ id }) => id === selected,
    );
    expect(spell?.prepared).toBe(false);
    expect(
      proposeSpellCast({ character, packages: [rulesPackage] }, { spellId: selected, slotLevel: 5 })
        .applicable,
    ).toBe(false);
  });

  it("recovers a fifth-level slot with the five-level Arcane Recovery budget", () => {
    const { input, character, evaluation } = setup();
    const sourceId = "srd521.class-feature.wizard.arcane-recovery";
    expect(
      evaluation.spellSlotRecoveries?.find((source) => source.sourceId === sourceId),
    ).toMatchObject({ maximumCombinedLevel: 5, maximumSlotLevel: 5 });
    character.state.expendedSpellSlots["5"] = 1;
    const rest = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [{ sourceId, slots: [{ level: 5, count: 1 }] }],
    });
    expect(rest.applicable).toBe(true);
    expect(rest.nextState.expendedSpellSlots["5"]).toBe(0);
    expect(rest.nextState.expendedResources["srd521.resource.wizard.arcane-recovery"]).toBe(1);
  });

  it("grants two Draconic spells independently of the fourteen normal preparations", () => {
    const { input, character, evaluation } = setup(sorcererId);
    expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(10);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.sorcerer.sorcery-points"),
    ).toMatchObject({ maximum: 9, current: 9 });
    for (const spellId of ["srd521.spell.legend-lore", "srd521.spell.summon-dragon"]) {
      expect(character.loadout.preparedSpellIds).not.toContain(spellId);
      expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
        prepared: true,
        level: 5,
      });
      const cast = proposeSpellCast(input, { spellId, slotLevel: 5 });
      expect(cast.applicable).toBe(true);
      expect(cast.nextState.expendedSpellSlots["5"]).toBe(1);
      if (spellId.endsWith("summon-dragon"))
        expect(cast.nextState.concentrationSpellId).toBe(spellId);
    }
  });

  it("keeps Sorcerer preparation changes level-up-only while Wizard preparation remains editable", () => {
    for (const classId of [wizardId, sorcererId] as const) {
      const { character, rulesPackage } = setup(classId);
      const editor = spellPreparationEditor(character, rulesPackage);
      expect(editor?.requiredSelections).toBe(14);
      expect(
        proposePreparedSpellLoadout(character, rulesPackage, character.loadout.preparedSpellIds)
          .issues.length === 0,
      ).toBe(classId === wizardId);
    }
  });
});
