import { describe, expect, it } from "vitest";

import { evaluateCharacter } from "@dnd/rules-core";

import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import {
  barbarianId,
  buildCharacter,
  characterBuilderCatalog,
  clericId,
  defaultBuilderDraft,
  druidId,
  fighterId,
  monkId,
  paladinId,
  rangerId,
  rogueId,
  wizardId,
} from "./character-builder";
import { loadWebData } from "./server-data";

const initialOptions = {
  id: "level-up-test-character",
  now: new Date("2026-08-08T12:00:00.000Z"),
};

describe("guided character level up", () => {
  it.each([
    barbarianId,
    clericId,
    druidId,
    fighterId,
    monkId,
    paladinId,
    rangerId,
    rogueId,
    wizardId,
  ] as const)(
    "advances %s from level 1 through 5 without replacing play state or possessions",
    (classId) => {
      const { rulesPackage } = loadWebData();
      const catalog = characterBuilderCatalog(rulesPackage);
      const original = buildCharacter(
        defaultBuilderDraft(classId, catalog, 1, "Ascending hero"),
        rulesPackage,
        initialOptions,
      );
      let character = {
        ...original,
        state: {
          ...original.state,
          currentHitPoints: 1,
          temporaryHitPoints: 3,
          heroicInspiration: true,
        },
      };
      const possessions = {
        inventory: character.loadout.inventory,
        currency: character.loadout.currency,
        equippedItemIds: character.loadout.equippedItemIds,
        attunedItemIds: character.loadout.attunedItemIds,
        choices: character.loadout.choices,
      };

      for (let targetLevel = 2; targetLevel <= 5; targetLevel += 1) {
        const previousState = character.state;
        const previousLearnedSpells = character.build.learnedSpellIds;
        const draft = createLevelUpDraft(character, catalog);
        if (targetLevel === 4) draft.asiAbility = "dexterity";
        const options = {
          id: character.id,
          now: new Date(`2026-08-0${String(targetLevel + 3)}T12:00:00.000Z`),
        };
        const preview = previewLevelUp(character, draft, rulesPackage, options);

        expect(draft.level).toBe(targetLevel);
        expect(draft.learnedSpellIds).toEqual(expect.arrayContaining(previousLearnedSpells));
        expect(preview.issues, `level ${String(targetLevel)}`).toEqual([]);
        character = levelUpCharacter(character, draft, rulesPackage, options);

        expect(character.id).toBe(original.id);
        expect(character.name).toBe(original.name);
        expect(character.build.levels).toHaveLength(targetLevel);
        expect(character.build.levels.at(-1)).toMatchObject({
          characterLevel: targetLevel,
          classId,
          hitPointChoice: "fixed",
        });
        expect(character.state).toEqual(previousState);
        expect(character.loadout).toMatchObject(possessions);
        expect(character.metadata.createdAt).toBe(original.metadata.createdAt);
        expect(character.metadata.revision).toBe(targetLevel - 1);
        expect(
          evaluateCharacter({ character, packages: [rulesPackage] }).validations.filter(
            (validation) => validation.severity === "error",
          ),
        ).toEqual([]);
      }

      expect(character.build.subclassId).toBe(catalog.classes[classId].subclassId);
      expect(character.build.featAbilityScoreIncreases).toEqual({ dexterity: 2 });
      if (classId === barbarianId) {
        expect(
          character.build.proficiencyChoices.skills.filter(
            (choice) => choice.sourceId === barbarianId,
          ),
        ).toHaveLength(3);
      }
      if (classId === clericId) {
        expect(character.build.levels[0]?.selectedFeatureChoices).toEqual([
          {
            choiceId: "srd521.choice.cleric.divine-order",
            optionIds: ["srd521.option.cleric.divine-order.protector"],
          },
        ]);
      }
      if (classId === druidId) {
        expect(character.build.levels[2]?.selectedFeatureChoices).toEqual([
          {
            choiceId: "srd521.choice.druid.circle-of-land",
            optionIds: ["srd521.option.druid.land.arid"],
          },
        ]);
      }
      if (classId === paladinId) {
        expect(character.build.levels[1]?.selectedFeatureChoices).toEqual([
          {
            choiceId: "srd521.choice.paladin.fighting-style",
            optionIds: ["srd521.feat.fighting-style.defense"],
          },
        ]);
        expect(character.build.featIds).toContain("srd521.feat.fighting-style.defense");
      }
      if (classId === rangerId) {
        expect(character.build.levels[2]?.selectedFeatureChoices).toEqual([
          {
            choiceId: "srd521.choice.ranger.hunters-prey",
            optionIds: ["srd521.option.ranger.hunters-prey.colossus-slayer"],
          },
        ]);
        expect(character.build.proficiencyChoices.expertise).toHaveLength(1);
        expect(character.build.featIds).toContain("srd521.feat.fighting-style.defense");
      }
      if (classId === rogueId) {
        expect(character.build.proficiencyChoices.expertise).toHaveLength(2);
      }
    },
  );

  it("explains unsupported and fully reviewed advancement limits", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelFive = buildCharacter(
      defaultBuilderDraft(fighterId, catalog, 5, "Max Fighter"),
      rulesPackage,
      initialOptions,
    );
    const unsupported = structuredClone(levelFive);
    unsupported.build.levels = unsupported.build.levels.slice(0, 1);
    const firstLevel = unsupported.build.levels[0];
    if (firstLevel === undefined) throw new Error("Expected a first character level.");
    unsupported.build.levels[0] = {
      ...firstLevel,
      classId: "srd521.class.sorcerer",
    };

    expect(levelUpEligibility(levelFive, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 5,
      reason: "Fighter advancement is currently reviewed through level 5.",
    });
    expect(levelUpEligibility(unsupported, catalog)).toMatchObject({
      eligible: false,
      reason:
        "Level-up support currently covers Barbarian, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, and Wizard.",
    });
    expect(() => createLevelUpDraft(levelFive, catalog)).toThrow(
      "Fighter advancement is currently reviewed through level 5.",
    );
  });

  it.each(["barbarian-1.json", "fighter-1.json"])(
    "advances the reviewed %s fixture without requiring builder-only document fields",
    (filename) => {
      const { fixtures, rulesPackage } = loadWebData();
      const catalog = characterBuilderCatalog(rulesPackage);
      const fixture = fixtures.find((candidate) => candidate.filename === filename);
      if (fixture === undefined) throw new Error(`Missing ${filename}.`);

      const draft = createLevelUpDraft(fixture.character, catalog);
      const next = levelUpCharacter(fixture.character, draft, rulesPackage, {
        id: fixture.character.id,
        now: new Date("2026-08-08T18:00:00.000Z"),
      });

      expect(next.build.levels).toHaveLength(2);
      expect(next.loadout.inventory).toEqual(fixture.character.loadout.inventory);
      expect(next.state).toEqual(fixture.character.state);
      expect(evaluateCharacter({ character: next, packages: [rulesPackage] }).validations).toEqual(
        [],
      );
    },
  );
});
