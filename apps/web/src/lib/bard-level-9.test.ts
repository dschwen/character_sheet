import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { evaluateCharacter, proposeRest, proposeSpellCast } from "@dnd/rules-core";
import {
  bardId,
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  expertiseCount,
  expertiseSkillCandidates,
  featureChoiceOptionsForLevel,
  rangerId,
  rogueId,
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

const options = { id: "bard-nine", now: new Date("2026-10-11T15:00:00Z") };
const expertiseSource = "srd521.class-feature.bard.expertise";
const discoveryChoice = "srd521.choice.bard.magical-discoveries";
const hold = "srd521.spell.hold-monster";
function setup(level = 9, classId: BuilderClassId = bardId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(classId, catalog, level, "Expert Bard");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, draft, character, input, evaluation: evaluateCharacter(input) };
}

describe("Bard level 9 and additional Expertise", () => {
  it("creates a legal caster with four Expertise selections and source-linked fifth-level slots", () => {
    const { draft, character, catalog, evaluation, rulesPackage } = setup();
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations).toEqual([]);
    expect(expertiseCount(draft, catalog)).toBe(4);
    expect(character.build.proficiencyChoices.expertise).toHaveLength(4);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 14,
      alwaysPreparedSpells: 2,
      cantripsKnown: 3,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
        { level: 4, maximum: 3 },
        { level: 5, maximum: 1 },
      ],
    });
    expect(character.loadout.preparedSpellIds).toHaveLength(14);
    const slot = evaluation.spellcasting?.slots.find(({ level }) => level === 5);
    expect(evaluation.traces[slot?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 31 })]),
    );
    const body = rulesPackage.entities.find(({ id }) => id === bardId)?.body as {
      progression: { level: number; features: { entityId: string }[] }[];
    };
    expect(body.progression.find(({ level }) => level === 9)?.features).toContainEqual(
      expect.objectContaining({ entityId: expertiseSource }),
    );
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
  });

  it("advances 8→9 with two new Expertise picks while preserving previous choices and spent state", () => {
    const { character, catalog, rulesPackage } = setup(8);
    character.state.currentHitPoints = 13;
    character.state.temporaryHitPoints = 3;
    character.state.expendedSpellSlots = { "1": 2, "4": 2 };
    character.state.expendedResources["srd521.resource.bard.bardic-inspiration"] = 1;
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    expect(draft.expertiseSkillIds).toHaveLength(4);
    expect(draft.expertiseSkillIds).toEqual(
      expect.arrayContaining(
        before.build.proficiencyChoices.expertise.map(({ skillId }) => skillId),
      ),
    );
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
    expect(next.build.proficiencyChoices.expertise).toEqual(
      expect.arrayContaining(before.build.proficiencyChoices.expertise),
    );
    expect(next.build.proficiencyChoices.expertise).toHaveLength(4);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    expect(next.loadout.inventory).toEqual(before.loadout.inventory);
    expect(next.loadout.currency).toEqual(before.loadout.currency);
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

  it("uses double proficiency (+8) for four expert skills and half proficiency (+2) for untrained skills", () => {
    const { character, evaluation } = setup();
    for (const { skillId } of character.build.proficiencyChoices.expertise) {
      const skill = skillId.replace("srd521.skill.", "");
      const test = evaluation.d20Tests[`skill.${skill}`];
      expect(test?.proficiency).toMatchObject({ level: "expertise", bonus: 8 });
      expect(evaluation.traces[test?.traceId ?? ""]?.sourceReferences).toEqual(
        expect.arrayContaining([expect.objectContaining({ entityId: expertiseSource, page: 32 })]),
      );
    }
    expect(evaluation.d20Tests["skill.medicine"]).toMatchObject({
      modifier: 2,
      proficiency: { level: "none", bonus: 0 },
    });
    expect(evaluation.d20Tests["abilityCheck.wisdom"]?.modifier).toBe(0);
  });

  it("allows the player to choose different new Expertise skills without changing the earlier pair", () => {
    const { character, catalog, rulesPackage } = setup(8);
    const draft = createLevelUpDraft(character, catalog);
    const previous = character.build.proficiencyChoices.expertise.map(({ skillId }) => skillId);
    const alternatives = expertiseSkillCandidates(draft, catalog)
      .filter((id) => !draft.expertiseSkillIds.includes(id))
      .slice(0, 2);
    expect(alternatives).toHaveLength(2);
    draft.expertiseSkillIds = [...previous, ...alternatives];
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(next.build.proficiencyChoices.expertise.map(({ skillId }) => skillId)).toEqual(
      expect.arrayContaining([...previous, ...alternatives]),
    );
    expect(next.build.proficiencyChoices.expertise).toHaveLength(4);
    expect(evaluateCharacter({ character: next, packages: [rulesPackage] }).validations).toEqual(
      [],
    );
  });

  it("allows Expertise in a proficient origin skill, not just class selections", () => {
    const { draft, catalog, rulesPackage } = setup();
    const candidates = expertiseSkillCandidates(draft, catalog);
    const origin = candidates.find(
      (id) => !draft.classSkillIds.includes(id) && !draft.expertiseSkillIds.includes(id),
    );
    if (!origin) throw new Error("Missing nonclass proficient skill");
    draft.expertiseSkillIds[3] = origin;
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(
      evaluation.d20Tests[`skill.${origin.replace("srd521.skill.", "")}`]?.proficiency,
    ).toMatchObject({ level: "expertise", bonus: 8 });
  });

  it.each(["missing", "duplicate", "unproficient", "early"])(
    "rejects %s Expertise selections",
    (invalid) => {
      const { draft, catalog } = setup(invalid === "early" ? 8 : 9);
      if (invalid === "missing") draft.expertiseSkillIds.pop();
      if (invalid === "duplicate") draft.expertiseSkillIds[3] = draft.expertiseSkillIds[0] ?? "";
      if (invalid === "unproficient") draft.expertiseSkillIds[3] = "srd521.skill.medicine";
      if (invalid === "early")
        draft.expertiseSkillIds.push(
          ...expertiseSkillCandidates(draft, catalog)
            .filter((id) => !draft.expertiseSkillIds.includes(id))
            .slice(0, 2),
        );
      expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
    },
  );

  it.each([
    [bardId, 8],
    [rogueId, 5],
    [rangerId, 2],
  ] as const)("directly rejects replacing an earlier %s Expertise selection", (classId, level) => {
    const { character, catalog, rulesPackage } = setup(level, classId);
    const draft = createLevelUpDraft(character, catalog);
    const replacement = expertiseSkillCandidates(draft, catalog).find(
      (id) => !draft.expertiseSkillIds.includes(id),
    );
    if (!replacement) throw new Error("Missing replacement candidate");
    draft.expertiseSkillIds[0] = replacement;
    const before = structuredClone(character);
    const preview = previewLevelUp(character, draft, rulesPackage, options);
    expect(preview.issues).toContain("Earlier Expertise selections cannot change during level up.");
    expect(preview.character).toBeUndefined();
    expect(() => levelUpCharacter(character, draft, rulesPackage, options)).toThrow(
      "Earlier Expertise",
    );
    expect(character).toEqual(before);
  });

  it("casts fifth-level Bard spells once and restores their slot on Long Rest", () => {
    const { character, input } = setup();
    character.loadout.preparedSpellIds[0] = hold;
    const before = structuredClone(character);
    expect(proposeSpellCast(input, { spellId: hold, slotLevel: 4 }).applicable).toBe(false);
    const cast = proposeSpellCast(input, { spellId: hold, slotLevel: 5 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["5"]).toBe(1);
    expect(cast.nextState.concentrationSpellId).toBe(hold);
    expect(character).toEqual(before);
    character.state = cast.nextState;
    expect(proposeSpellCast(input, { spellId: hold, slotLevel: 5 })).toMatchObject({
      applicable: false,
      changes: [],
      nextState: character.state,
    });
    expect(proposeRest(input, { event: "short-rest" }).nextState.expendedSpellSlots["5"]).toBe(1);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedSpellSlots["5"]).toBe(0);
  });

  it("retains two separate Discoveries and permits one fifth-level replacement, not two", () => {
    const { character, catalog, rulesPackage } = setup(8);
    const draft = createLevelUpDraft(character, catalog);
    const discoveries = catalog.classes[bardId].featureChoices.find(
      ({ id }) => id === discoveryChoice,
    );
    if (!discoveries) throw new Error("Missing Discoveries choice");
    expect(featureChoiceOptionsForLevel(discoveries, 9).map(({ id }) => id)).toContain(
      "srd521.spell.cone-of-cold",
    );
    expect(draft.featureChoiceSelections[discoveryChoice]).toHaveLength(2);
    draft.featureChoiceSelections = {
      ...draft.featureChoiceSelections,
      [discoveryChoice]: ["srd521.spell.cone-of-cold", "srd521.spell.spiritual-weapon"],
    };
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 14,
      alwaysPreparedSpells: 2,
    });
    expect(next.loadout.preparedSpellIds).not.toContain("srd521.spell.cone-of-cold");
    expect(
      proposeSpellCast(
        { character: next, packages: [rulesPackage] },
        { spellId: "srd521.spell.cone-of-cold", slotLevel: 5 },
      ).applicable,
    ).toBe(true);
    draft.featureChoiceSelections = {
      ...draft.featureChoiceSelections,
      [discoveryChoice]: ["srd521.spell.cone-of-cold", "srd521.spell.wall-of-stone"],
    };
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toContain(
      "Replace no more than 1 Bard feature option during level up.",
    );
  });

  it("allows two new ordinary preparations and at most one prior replacement during advancement", () => {
    const { character, catalog, rulesPackage } = setup(8);
    const draft = createLevelUpDraft(character, catalog);
    expect(draft.preparedSpellIds).toHaveLength(14);
    const candidates =
      catalog.classes[bardId].spellcasting?.spells.filter(
        ({ id, level }) => level === 5 && !draft.preparedSpellIds.includes(id),
      ) ?? [];
    const [one, two] = candidates;
    if (!one || !two) throw new Error("Missing fifth-level spells");
    draft.preparedSpellIds[0] = one.id;
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toEqual([]);
    draft.preparedSpellIds[1] = two.id;
    expect(previewLevelUp(character, draft, rulesPackage, options).issues).toContain(
      "Replace no more than 1 Bard prepared spell during level up.",
    );
    expect(spellPreparationEditor(character, rulesPackage)).toMatchObject({ editable: false });
    expect(
      proposePreparedSpellLoadout(character, rulesPackage, character.loadout.preparedSpellIds)
        .applicable,
    ).toBe(false);
  });

  it("keeps Bardic Inspiration at d8 rather than prematurely gaining the level-10 die", () => {
    const { evaluation } = setup();
    const resource = evaluation.resources.find(
      ({ id }) => id === "srd521.resource.bard.bardic-inspiration",
    );
    expect(resource).toMatchObject({ maximum: 4 });
    expect(
      evaluation.actions.find(({ id }) => id === "action.bardic-inspiration")?.parameters,
    ).toMatchObject({ checkBonus: { diceCount: 1, diceSize: 8 } });
    expect(
      evaluation.actions.find(({ id }) => id === "action.cutting-words")?.parameters,
    ).toMatchObject({ checkBonus: { diceCount: 1, diceSize: 8, mode: "subtract" } });
  });
});
