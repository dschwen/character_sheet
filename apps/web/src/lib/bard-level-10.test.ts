import { describe, expect, it } from "vitest";
import {
  evaluateCharacter,
  preparedSpellLists,
  proposeSpellCast,
  proposeRest,
  spellPreparationEditor,
  proposePreparedSpellLoadout,
} from "@dnd/rules-core";
import { preparedSpellListExpansionSchema } from "@dnd/content-schema";
import {
  bardId,
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  spellSelectionCounts,
  validateBuilderDraft,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "bard-ten", now: new Date("2026-10-12T19:00:00Z") };
const extras = [
  "srd521.spell.fireball",
  "srd521.spell.revivify",
  "srd521.spell.pass-without-trace",
] as const;
function setup(level = 10) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(bardId, catalog, level, "Secret Keeper");
  const character = buildCharacter(draft, rulesPackage, options);
  return {
    rulesPackage,
    catalog,
    draft,
    character,
    evaluation: evaluateCharacter({ character, packages: [rulesPackage] }),
  };
}
function withExtras(draft: ReturnType<typeof defaultBuilderDraft>, count: number) {
  return {
    ...draft,
    preparedSpellIds: [...draft.preparedSpellIds.slice(count), ...extras.slice(0, count)],
  };
}

describe("Bard level 10 and source-driven prepared spell list expansion", () => {
  it("creates a legal Bard with d10 Inspiration, four cantrips and fifteen ordinary preparations", () => {
    const { character, evaluation, draft, catalog } = setup();
    expect(evaluation.validations).toEqual([]);
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(character.build.proficiencyChoices.expertise).toHaveLength(4);
    expect(character.build.learnedSpellIds).toHaveLength(4);
    expect(character.loadout.preparedSpellIds).toHaveLength(15);
    expect(evaluation.spellcasting).toMatchObject({
      cantripsKnown: 4,
      preparedSpellLimit: 15,
      alwaysPreparedSpells: 2,
    });
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 5)).toMatchObject({
      maximum: 2,
    });
    const action = evaluation.actions.find(({ id }) => id === "action.bardic-inspiration");
    if (!action) throw new Error("Missing Inspiration action");
    expect(action.parameters).toMatchObject({ checkBonus: { diceCount: 1, diceSize: 10 } });
    expect(
      evaluation.actions.find(({ id }) => id === "action.cutting-words")?.parameters,
    ).toMatchObject({ checkBonus: { diceCount: 1, diceSize: 10, mode: "subtract" } });
    expect(levelUpEligibility(character, catalog).eligible).toBe(true);
    expect(
      evaluation.traces["spellcasting.bard.expandedPreparations"]?.sourceReferences,
    ).toContainEqual(expect.objectContaining({ page: 33 }));
  });
  it.each([1, 9])("does not expand preparations early at level %i", (level) => {
    const { catalog, draft, character, rulesPackage } = setup(level);
    expect(spellSelectionCounts(draft, catalog)?.eligiblePreparedSpellIds).not.toContain(extras[0]);
    character.loadout.preparedSpellIds[0] = extras[0];
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.some(
        ({ code }) => code === "SPELL_NOT_ON_BARD_LIST",
      ),
    ).toBe(true);
  });
  it.each([1, 2])(
    "allows %i off-list preparations, counted normally and cast with Charisma",
    (count) => {
      const { draft, catalog, rulesPackage } = setup();
      const chosen = withExtras(draft, count);
      expect(validateBuilderDraft(chosen, catalog)).toEqual([]);
      const character = buildCharacter(chosen, rulesPackage, options);
      const input = { character, packages: [rulesPackage] };
      const evaluation = evaluateCharacter(input);
      expect(evaluation.validations).toEqual([]);
      const fireball = evaluation.spells.find(({ id }) => id === extras[0]);
      expect(fireball).toMatchObject({ prepared: true });
      expect(spellSelectionCounts(chosen, catalog)?.alwaysPreparedSpellIds).not.toContain(
        extras[0],
      );
      expect(evaluation.spellcasting?.ability).toBe("charisma");
      const cast = proposeSpellCast(input, { spellId: extras[0], slotLevel: 3 });
      expect(cast.applicable).toBe(true);
      expect(cast.nextState.expendedSpellSlots["3"]).toBe(1);
    },
  );
  it("rejects a wholesale rewrite into off-list spells in both builder and core", () => {
    const { draft, catalog, rulesPackage, character } = setup();
    const chosen = withExtras(draft, 3);
    expect(validateBuilderDraft(chosen, catalog).join(" ")).toMatch(/no more than 2 off-list/);
    character.loadout.preparedSpellIds = chosen.preparedSpellIds;
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.some(
        ({ code }) => code === "EXPANDED_PREPARED_SPELL_LIMIT",
      ),
    ).toBe(true);
  });
  it("adds the new preparation and one replacement at 9→10 without changing spent state", () => {
    const { character, catalog, rulesPackage } = setup(9);
    character.state.currentHitPoints = 9;
    character.state.expendedSpellSlots = { "3": 2, "5": 1 };
    character.state.expendedResources["srd521.resource.bard.bardic-inspiration"] = 2;
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    draft.preparedSpellIds = [
      ...character.loadout.preparedSpellIds.slice(1),
      ...extras.slice(0, 2),
    ];
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    const advanced = levelUpCharacter(character, draft, rulesPackage, options);
    expect(character).toEqual(before);
    expect(advanced.state).toEqual(before.state);
    expect(advanced.build.levels.slice(0, 9)).toEqual(before.build.levels);
    expect(advanced.loadout.inventory).toEqual(before.loadout.inventory);
    expect(advanced.build.featIds).toEqual(before.build.featIds);
    expect(advanced.build.proficiencyChoices).toEqual(before.build.proficiencyChoices);
    expect(
      evaluateCharacter({ character: advanced, packages: [rulesPackage] }).spellcasting?.slots.find(
        ({ level }) => level === 5,
      ),
    ).toMatchObject({ current: 1, expended: 1 });
  });
  it("rejects replacing two prior preparations during a single level up", () => {
    const { character, catalog, rulesPackage } = setup(9);
    const draft = createLevelUpDraft(character, catalog);
    draft.preparedSpellIds = [...character.loadout.preparedSpellIds.slice(2), ...extras];
    expect(previewLevelUp(character, draft, rulesPackage, options).issues.join(" ")).toMatch(
      /Replace no more than 1/,
    );
  });
  it("does not expand cantrips or grant Paladin-only spells", () => {
    const { catalog, draft, character, rulesPackage } = setup();
    expect(
      catalog.classes[bardId].spellcasting?.spells.some(
        ({ id }) => id === "srd521.spell.fire-bolt",
      ),
    ).toBe(false);
    expect(spellSelectionCounts(draft, catalog)?.eligiblePreparedSpellIds).not.toContain(
      "srd521.spell.find-steed",
    );
    character.build.learnedSpellIds[0] = "srd521.spell.fire-bolt";
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.some(
        ({ code }) => code === "SPELL_NOT_ON_BARD_LIST",
      ),
    ).toBe(true);
  });
  it("shows expanded options in preparation view but keeps changes level-up-only", () => {
    const { character, rulesPackage } = setup();
    const editor = spellPreparationEditor(character, rulesPackage);
    expect(editor?.options.some(({ id }) => id === extras[0])).toBe(true);
    expect(editor?.editable).toBe(false);
    expect(
      proposePreparedSpellLoadout(character, rulesPackage, character.loadout.preparedSpellIds)
        .applicable,
    ).toBe(false);
    const rest = proposeRest({ character, packages: [rulesPackage] }, { event: "long-rest" });
    expect(rest.applicable).toBe(true);
    expect(character.loadout.preparedSpellIds).toHaveLength(15);
  });
  it("derives expansion from metadata without a Bard ID branch", () => {
    const { rulesPackage } = setup();
    const entity = rulesPackage.entities.find(({ id }) => id === bardId);
    if (!entity) throw new Error("Missing Bard");
    const result = preparedSpellLists(
      { ...entity, id: "test.class.custom" },
      10,
      rulesPackage.entities,
    );
    expect(result.preparedSpellIds).toContain(extras[0]);
    expect(result.maximumExpandedSelections).toBe(2);
    expect(
      preparedSpellListExpansionSchema.safeParse({
        sourceFeatureId: "test.feature",
        minimumLevel: 10,
        minimumSpellLevel: 0,
        sourceClassIds: [bardId],
      }).success,
    ).toBe(false);
  });
  it.each([
    [10, 2],
    [11, 4],
    [12, 5],
  ])(
    "counts growth and replacements at level %i, including a no-growth level",
    (level, maximum) => {
      const { rulesPackage } = setup();
      const entity = rulesPackage.entities.find(({ id }) => id === bardId);
      if (!entity) throw new Error("Missing Bard");
      expect(
        preparedSpellLists(entity, level, rulesPackage.entities).maximumExpandedSelections,
      ).toBe(maximum);
    },
  );
  it("requires every declared source list to be loaded", () => {
    const { rulesPackage } = setup();
    const entity = rulesPackage.entities.find(({ id }) => id === bardId);
    if (!entity) throw new Error("Missing Bard");
    expect(() =>
      preparedSpellLists(
        entity,
        10,
        rulesPackage.entities.filter(({ id }) => id !== "srd521.class.cleric"),
      ),
    ).toThrow(/Missing spell-list source/);
  });
});
