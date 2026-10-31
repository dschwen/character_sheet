import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeSpellCast } from "@dnd/rules-core";
import {
  bardId,
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  validateBuilderDraft,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "bard-eleven", now: new Date("2026-10-31T09:00:00Z") };
const extras = [
  "srd521.spell.fireball",
  "srd521.spell.revivify",
  "srd521.spell.pass-without-trace",
  "srd521.spell.heal",
  "srd521.spell.harm",
] as const;
const onListSixth = "srd521.spell.guards-and-wards";

function setup(level = 11) {
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
function withReplacements(
  draft: ReturnType<typeof defaultBuilderDraft>,
  count: number,
  spellIds: readonly string[],
) {
  return {
    ...draft,
    preparedSpellIds: [...draft.preparedSpellIds.slice(count), ...spellIds],
  };
}

describe("Bard level 11 preparation growth and sixth-level expanded casting", () => {
  it("creates a legal Bard with sixteen preparations and one sixth-level slot", () => {
    const { character, evaluation, draft, catalog } = setup();
    expect(evaluation.validations).toEqual([]);
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(character.build.learnedSpellIds).toHaveLength(4);
    expect(character.loadout.preparedSpellIds).toHaveLength(16);
    expect(evaluation.spellcasting).toMatchObject({
      cantripsKnown: 4,
      preparedSpellLimit: 16,
      alwaysPreparedSpells: 2,
    });
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 6)).toMatchObject({
      maximum: 1,
    });
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 5)).toMatchObject({
      maximum: 2,
    });
    const action = evaluation.actions.find(({ id }) => id === "action.bardic-inspiration");
    if (!action) throw new Error("Missing Inspiration action");
    expect(action.parameters).toMatchObject({ checkBonus: { diceCount: 1, diceSize: 10 } });
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      reason: "Bard advancement is currently reviewed through level 11.",
    });
    expect(
      evaluation.traces["spellcasting.bard.expandedPreparations"]?.sourceReferences,
    ).toContainEqual(expect.objectContaining({ page: 33 }));
  });
  it("keeps sixth-level spells out of reach at level 10 and opens them at level 11", () => {
    const { draft, catalog, character, rulesPackage } = setup(10);
    expect(catalog.classes[bardId].spellcasting?.countsByLevel[10]?.maximumSpellLevel).toBe(5);
    expect(catalog.classes[bardId].spellcasting?.countsByLevel[11]?.maximumSpellLevel).toBe(6);
    const chosen = withReplacements(draft, 1, [extras[3]]);
    expect(validateBuilderDraft(chosen, catalog).length).toBeGreaterThan(0);
    character.loadout.preparedSpellIds[0] = extras[3];
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.some(
        ({ code }) => code === "BARD_SPELL_LEVEL_UNAVAILABLE",
      ),
    ).toBe(true);
  });
  it.each([1, 2, 4])(
    "allows %i off-list preparations at level 11, including sixth-level Cleric spells",
    (count) => {
      const { draft, catalog, rulesPackage } = setup();
      const chosen = withReplacements(draft, count, extras.slice(0, count));
      expect(validateBuilderDraft(chosen, catalog)).toEqual([]);
      const character = buildCharacter(chosen, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(evaluation.validations).toEqual([]);
      expect(
        evaluation.spells.some(({ id, prepared }) => id === extras[count - 1] && prepared),
      ).toBe(true);
    },
  );
  it("rejects five off-list preparations in both builder and core", () => {
    const { draft, catalog, rulesPackage, character } = setup();
    const chosen = withReplacements(draft, 5, extras);
    expect(validateBuilderDraft(chosen, catalog).join(" ")).toMatch(/no more than 4 off-list/);
    character.loadout.preparedSpellIds = chosen.preparedSpellIds;
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.some(
        ({ code }) => code === "EXPANDED_PREPARED_SPELL_LIMIT",
      ),
    ).toBe(true);
  });
  it("casts an expanded-list sixth-level spell in the new slot, once", () => {
    const { draft, catalog, rulesPackage } = setup();
    const chosen = withReplacements(draft, 2, [extras[3], onListSixth]);
    expect(validateBuilderDraft(chosen, catalog)).toEqual([]);
    const character = buildCharacter(chosen, rulesPackage, options);
    const input = { character, packages: [rulesPackage] };
    const evaluation = evaluateCharacter(input);
    expect(evaluation.validations).toEqual([]);
    const cast = proposeSpellCast(input, { spellId: extras[3], slotLevel: 6 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["6"]).toBe(1);
    const second = proposeSpellCast(
      { ...input, character: { ...character, state: cast.nextState } },
      {
        spellId: onListSixth,
        slotLevel: 6,
      },
    );
    expect(second.applicable).toBe(false);
  });
  it("adds the new preparation and one replacement at 10→11 without changing spent state", () => {
    const { character, catalog, rulesPackage } = setup(10);
    character.state.currentHitPoints = 21;
    character.state.expendedSpellSlots = { "4": 1, "5": 1 };
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
    expect(advanced.build.levels.slice(0, 10)).toEqual(before.build.levels);
    expect(advanced.loadout.inventory).toEqual(before.loadout.inventory);
    expect(advanced.build.proficiencyChoices).toEqual(before.build.proficiencyChoices);
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 6)).toMatchObject({
      current: 1,
      expended: 0,
      maximum: 1,
    });
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 5)).toMatchObject({
      current: 1,
      expended: 1,
    });
  });
  it("rejects replacing two prior preparations during the 10→11 level up", () => {
    const { character, catalog, rulesPackage } = setup(10);
    const draft = createLevelUpDraft(character, catalog);
    draft.preparedSpellIds = [
      ...character.loadout.preparedSpellIds.slice(2),
      ...extras.slice(0, 3),
    ];
    expect(previewLevelUp(character, draft, rulesPackage, options).issues.join(" ")).toMatch(
      /Replace no more than 1/,
    );
  });
});
