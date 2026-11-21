import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeRest } from "@dnd/rules-core";
import { validateExpertiseChoices } from "../../../../packages/rules-core/src/expertise-choices";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  expertiseSkillCandidates,
  updateBuilderBackground,
  wizardId,
  druidId,
  rogueId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { loadWebData } from "./server-data";
import { spellPreparationEditor, proposePreparedSpellLoadout } from "./spell-preparation";

const { rulesPackage } = loadWebData();
const catalog = characterBuilderCatalog(rulesPackage);
const options = { id: "scholar-land", now: new Date("2026-11-20T18:00:00Z") };
const scholar = "srd521.class-feature.wizard.scholar";
const history = "srd521.skill.history";
const landChoice = "srd521.choice.druid.circle-of-land";
const land = (name: string) => `srd521.option.druid.land.${name}`;
const errors = (character: ReturnType<typeof buildCharacter>, pack = rulesPackage) =>
  evaluateCharacter({ character, packages: [pack] }).validations.filter(
    ({ severity }) => severity === "error",
  );

describe("shared Expertise grants and Scholar", () => {
  it.each(["feat", "species", "background"])(
    "offers a proficient Scholar skill from %s without restricting it to class skills",
    (source) => {
      let draft = defaultBuilderDraft(wizardId, catalog, 2, "Scholar");
      if (source === "background")
        draft = updateBuilderBackground(draft, catalog, "srd521.background.sage");
      if (source === "species")
        draft = {
          ...draft,
          speciesSkillIds: [history],
          originFeatSkillIds: draft.originFeatSkillIds.map((id) =>
            id === history ? "srd521.skill.perception" : id,
          ),
        };
      expect(draft.classSkillIds).not.toContain(history);
      expect(expertiseSkillCandidates(draft, catalog)).toContain(history);
      draft = { ...draft, expertiseSkillIds: [history] };
      const character = buildCharacter(draft, rulesPackage, options);
      expect(errors(character)).toEqual([]);
      const check = evaluateCharacter({ character, packages: [rulesPackage] }).d20Tests[
        "skill.history"
      ];
      expect(check?.proficiency.level).toBe("expertise");
      expect(check?.proficiency.sources).toContain(scholar);
    },
  );
  it.each([
    { ids: [], code: "EXPERTISE_CHOICE_COUNT" },
    { ids: ["srd521.skill.arcana", "srd521.skill.investigation"], code: "EXPERTISE_CHOICE_COUNT" },
    { ids: ["srd521.skill.athletics"], code: "EXPERTISE_CHOICE_NOT_ALLOWED" },
    { ids: ["srd521.skill.religion"], code: "EXPERTISE_REQUIRES_PROFICIENCY" },
  ])("rejects imported Scholar choices $ids", ({ ids, code }) => {
    const character = buildCharacter(
      defaultBuilderDraft(wizardId, catalog, 2, "Scholar"),
      rulesPackage,
      options,
    );
    character.build.proficiencyChoices.expertise = ids.map((skillId) => ({
      skillId,
      sourceId: scholar,
    }));
    expect(errors(character).map(({ code }) => code)).toContain(code);
  });
  it("rejects Scholar before its grant, including on another class", () => {
    for (const classId of [wizardId, rogueId] as const) {
      const character = buildCharacter(
        defaultBuilderDraft(classId, catalog, 1, "Early"),
        rulesPackage,
        options,
      );
      character.build.proficiencyChoices.expertise.push({
        skillId: "srd521.skill.arcana",
        sourceId: scholar,
      });
      expect(errors(character).map(({ code }) => code)).toContain("EXPERTISE_CHOICE_COUNT");
    }
  });
  it("rejects duplicate Scholar selections at the document boundary", () => {
    const character = buildCharacter(
      defaultBuilderDraft(wizardId, catalog, 2, "Duplicate"),
      rulesPackage,
      options,
    );
    character.build.proficiencyChoices.expertise = Array.from({ length: 2 }, () => ({
      skillId: "srd521.skill.arcana",
      sourceId: scholar,
    }));
    expect(() => errors(character)).toThrow("Skill expertise choices must be unique per source");
  });
  it("preserves older Expertise selections on advancement", () => {
    const draft = {
      ...defaultBuilderDraft(wizardId, catalog, 2, "History Scholar"),
      expertiseSkillIds: [history],
    };
    const character = buildCharacter(draft, rulesPackage, options);
    const next = createLevelUpDraft(character, catalog);
    expect(next.expertiseSkillIds).toEqual([history]);
    const advanced = levelUpCharacter(character, next, rulesPackage, options);
    expect(advanced.build.proficiencyChoices.expertise).toEqual(
      character.build.proficiencyChoices.expertise,
    );
    expect(advanced.build.levels.slice(0, 2)).toEqual(character.build.levels);
    expect(errors(advanced)).toEqual([]);
    expect(
      previewLevelUp(
        character,
        { ...next, expertiseSkillIds: ["srd521.skill.arcana"] },
        rulesPackage,
        options,
      ).issues,
    ).toContain("Earlier Expertise selections cannot change during level up.");
  });
  it.each([1, 2])(
    "does not repair missing or early Expertise silently while advancing from level %s",
    (level) => {
      const character = buildCharacter(
        defaultBuilderDraft(wizardId, catalog, level, "Legacy Scholar"),
        rulesPackage,
        options,
      );
      character.build.proficiencyChoices.expertise =
        level === 1 ? [{ skillId: "srd521.skill.arcana", sourceId: scholar }] : [];
      const before = structuredClone(character);
      const draft = createLevelUpDraft(character, catalog);
      expect(previewLevelUp(character, draft, rulesPackage, options).issues).toContain(
        "Existing Expertise records must match their granted counts before leveling up. Record missing choices explicitly.",
      );
      expect(() => levelUpCharacter(character, draft, rulesPackage, options)).toThrow();
      expect(character).toEqual(before);
    },
  );
  it("derives pool rules from authored metadata, not a Wizard-specific branch", () => {
    const pack = structuredClone(rulesPackage);
    const entity = pack.entities.find(({ id }) => id === wizardId);
    if (!entity) throw new Error("Missing Wizard");
    const body = entity.body as { builder: { expertiseChoice: { eligibleSkillIds: string[] } } };
    body.builder.expertiseChoice.eligibleSkillIds = ["srd521.skill.athletics"];
    const customCatalog = characterBuilderCatalog(pack);
    const character = buildCharacter(
      defaultBuilderDraft(wizardId, customCatalog, 2, "Custom Scholar"),
      pack,
      options,
    );
    expect(character.build.proficiencyChoices.expertise).toContainEqual({
      skillId: "srd521.skill.athletics",
      sourceId: scholar,
    });
    expect(errors(character, pack)).toEqual([]);
  });
  it("retains count thresholds beyond the current guided builder maximum", () => {
    const character = buildCharacter(
      defaultBuilderDraft(rogueId, catalog, 9, "Rogue"),
      rulesPackage,
      options,
    );
    character.build.levels = Array.from({ length: 20 }, (_, index) => ({
      ...character.build.levels[0],
      characterLevel: index + 1,
      classId: rogueId,
      hitPointChoice: "fixed" as const,
      selectedFeatureChoices: [],
    }));
    expect(
      validateExpertiseChoices(
        character,
        rulesPackage.entities,
        new Set(["srd521.class-feature.rogue.expertise"]),
      ),
    ).toEqual([]);
  });
});

describe("source-driven Circle of the Land rest choices", () => {
  it.each([3, 5])("switches all four level-%s land spell pools in an atomic Long Rest", (level) => {
    const character = buildCharacter(
      defaultBuilderDraft(druidId, catalog, level, "Land"),
      rulesPackage,
      options,
    );
    // Choose an ordinary loadout that stays ordinary under every terrain, explicitly for this test.
    const subclass = rulesPackage.entities.find(({ id }) => id === character.build.subclassId);
    const pools = (
      subclass?.body as { alwaysPreparedSpellChoices: Record<string, Record<string, string[]>> }
    ).alwaysPreparedSpellChoices;
    const landSpells = new Set(Object.values(pools).flatMap((pool) => Object.values(pool).flat()));
    const preparation = spellPreparationEditor(character, rulesPackage);
    if (!preparation) throw new Error("Missing preparation editor");
    character.loadout.preparedSpellIds = preparation.options
      .filter((spell) => !spell.alwaysPrepared && !landSpells.has(spell.id))
      .slice(0, preparation.requiredSelections)
      .map(({ id }) => id);
    character.state.currentHitPoints = 2;
    character.state.expendedResources["srd521.resource.druid.wild-shape"] = 1;
    const before = structuredClone(character);
    const ordinary = proposeRest({ character, packages: [rulesPackage] }, { event: "long-rest" });
    for (const name of ["arid", "polar", "temperate", "tropical"]) {
      const rest = proposeRest(
        { character, packages: [rulesPackage] },
        {
          event: "long-rest",
          featureChoiceReplacements: [{ choiceId: landChoice, optionIds: [land(name)] }],
        },
      );
      expect(rest.applicable).toBe(true);
      expect(rest.nextState).toEqual(ordinary.nextState);
      const nextBuild = rest.nextBuild;
      if (!nextBuild) throw new Error("Missing updated choice");
      const next = { ...character, build: nextBuild, state: rest.nextState };
      expect(errors(next)).toEqual([]);
      const selected = nextBuild.levels
        .flatMap((entry) => entry.selectedFeatureChoices)
        .find(({ choiceId }) => choiceId === landChoice);
      expect(selected?.optionIds).toEqual([land(name)]);
      const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
      const expected = [
        "srd521.spell.speak-with-animals",
        ...Object.entries(pools[land(name)] ?? {}).flatMap(([at, ids]) =>
          Number(at) <= level ? ids : [],
        ),
      ];
      expect(spellPreparationEditor(next, rulesPackage)?.alwaysPreparedSpellIds.sort()).toEqual(
        expected.sort(),
      );
      for (const id of expected)
        expect(evaluation.spells.find((spell) => spell.id === id)?.prepared).toBe(true);
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(expected.length);
      expect({ ...nextBuild, levels: before.build.levels }).toEqual(before.build);
      expect(nextBuild.levels.filter((_, index) => index !== 2)).toEqual(
        before.build.levels.filter((_, index) => index !== 2),
      );
    }
    expect(character).toEqual(before);
  });
  it.each([
    { event: "short-rest" as const, ids: [land("tropical")] },
    { event: "long-rest" as const, ids: ["srd521.option.cleric.divine-order.protector"] },
    { event: "long-rest" as const, ids: [land("tropical"), land("arid")] },
    { event: "long-rest" as const, ids: [land("tropical"), land("tropical")] },
  ])("rejects ineligible land replacement $event $ids without mutation", ({ event, ids }) => {
    const character = buildCharacter(
      defaultBuilderDraft(druidId, catalog, 3, "Land"),
      rulesPackage,
      options,
    );
    const before = structuredClone(character);
    const rest = proposeRest(
      { character, packages: [rulesPackage] },
      { event, featureChoiceReplacements: [{ choiceId: landChoice, optionIds: ids }] },
    );
    expect(rest.applicable).toBe(false);
    expect(rest.nextBuild).toBeUndefined();
    expect(character).toEqual(before);
  });
  it("rejects land choices before the subclass grant", () => {
    const character = buildCharacter(
      defaultBuilderDraft(druidId, catalog, 2, "Early Land"),
      rulesPackage,
      options,
    );
    const rest = proposeRest(
      { character, packages: [rulesPackage] },
      {
        event: "long-rest",
        featureChoiceReplacements: [{ choiceId: landChoice, optionIds: [land("tropical")] }],
      },
    );
    expect(rest.applicable).toBe(false);
  });
  it("requires explicit preparation repair when a new terrain would make ordinary spells always prepared", () => {
    const character = buildCharacter(
      defaultBuilderDraft(druidId, catalog, 5, "Conflict"),
      rulesPackage,
      options,
    );
    const before = structuredClone(character);
    const request = {
      event: "long-rest" as const,
      featureChoiceReplacements: [{ choiceId: landChoice, optionIds: [land("polar")] }],
    };
    const conflict = proposeRest({ character, packages: [rulesPackage] }, request);
    expect(conflict.applicable).toBe(false);
    expect(conflict.validations.map(({ code }) => code)).toContain("REST_PREPARED_SPELL_CONFLICT");
    expect(conflict.nextState).toEqual(before.state);
    expect(conflict.nextBuild).toBeUndefined();
    expect(character).toEqual(before);
    const editor = spellPreparationEditor(character, rulesPackage);
    if (!editor) throw new Error("Missing editor");
    const polar = new Set([
      "srd521.spell.fog-cloud",
      "srd521.spell.hold-person",
      "srd521.spell.sleet-storm",
    ]);
    const selected = editor.options
      .filter((spell) => !spell.alwaysPrepared && !polar.has(spell.id))
      .slice(0, editor.requiredSelections)
      .map(({ id }) => id);
    const repaired = proposePreparedSpellLoadout(
      character,
      rulesPackage,
      selected,
      options.now,
    ).nextCharacter;
    if (!repaired) throw new Error("Invalid explicit preparation");
    const rest = proposeRest({ character: repaired, packages: [rulesPackage] }, request);
    expect(rest.applicable).toBe(true);
    if (!rest.nextBuild) throw new Error("Missing choice change");
    expect(errors({ ...repaired, build: rest.nextBuild, state: rest.nextState })).toEqual([]);
  });
});
