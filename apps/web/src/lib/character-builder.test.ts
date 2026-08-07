import { describe, expect, it } from "vitest";

import { evaluateCharacter } from "@dnd/rules-core";

import {
  buildCharacter,
  builderOriginChoiceDefinitions,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  updateBuilderLevel,
  validateBuilderDraft,
  wizardId,
} from "./character-builder";
import { loadWebData } from "./server-data";

const options = { id: "builder-test-character", now: new Date("2026-08-02T12:00:00.000Z") };

describe("guided character builder", () => {
  it("derives class, skill, mastery, and spell choices from the loaded content package", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);

    expect(catalog.classes[fighterId].name).toBe("Fighter");
    expect(catalog.classes[wizardId].name).toBe("Wizard");
    expect(catalog.classes[fighterId].skillIds).toContain("srd521.skill.perception");
    expect(catalog.classes[wizardId].skillIds).toContain("srd521.skill.arcana");
    expect(catalog.backgrounds["srd521.background.soldier"]?.skillIds).toEqual([
      "srd521.skill.athletics",
      "srd521.skill.intimidation",
    ]);
    expect(catalog.classes[fighterId].weaponMasteryCountByLevel).toMatchObject({
      1: 3,
      4: 4,
      5: 4,
    });
    expect(catalog.weaponIds).toHaveLength(38);
    expect(catalog.classes[fighterId].startingEquipment.options).toHaveLength(3);
    expect(catalog.classes[wizardId].startingEquipment.options).toHaveLength(2);
    expect(catalog.classes[wizardId].spellcasting?.countsByLevel[5]).toEqual({
      cantrips: 4,
      learnedLeveledSpells: 14,
      preparedSpells: 9,
      maximumSpellLevel: 3,
      alwaysPreparedSpellIds: [],
    });
    expect(
      catalog.classes[wizardId].spellcasting?.spells.find(
        (spell) => spell.id === "srd521.spell.fireball",
      ),
    ).toMatchObject({ name: "Fireball", level: 3 });
    expect(catalog.classes[wizardId]).toMatchObject({
      subclassId: "srd521.subclass.wizard.evoker",
      subclassLevel: 3,
      skillMinimum: 2,
      skillMaximum: 2,
    });
  });

  it("projects dependent species, background, feat, size, and ability choices", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(fighterId, catalog, 1, "Projected origins");
    const choices = builderOriginChoiceDefinitions(draft, catalog);
    const choice = (selection: (typeof choices)[number]["selection"]) =>
      choices.find((candidate) => candidate.selection === selection);

    expect(choices.map((candidate) => candidate.selection)).toEqual([
      "speciesId",
      "backgroundId",
      "speciesSize",
      "backgroundAbilityScoreIncreases",
      "originFeatId",
      "speciesSkillIds",
      "originFeatSkillIds",
    ]);
    expect(choice("speciesSize")?.options.map((option) => option.id)).toEqual(["medium", "small"]);
    expect(choice("backgroundAbilityScoreIncreases")?.options).toHaveLength(7);
    expect(choice("originFeatId")?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "srd521.feat.origin.skilled" }),
        expect.objectContaining({
          id: "srd521.feat.origin.savage-attacker",
          disabledReason: "Already granted by Soldier.",
        }),
      ]),
    );
  });

  it("persists projected origin selections into a rules-valid character", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(fighterId, catalog, 1, "Small soldier");
    draft.speciesSize = "small";
    draft.backgroundAbilityScoreIncreases = { strength: 2, constitution: 1 };

    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

    expect(character.build).toMatchObject({
      speciesId: "srd521.species.human",
      speciesSize: "small",
      backgroundId: "srd521.background.soldier",
      backgroundAbilityScoreIncreases: { strength: 2, constitution: 1 },
    });
    expect(character.build.featIds).toEqual(
      expect.arrayContaining(["srd521.feat.origin.savage-attacker", "srd521.feat.origin.skilled"]),
    );
    expect(evaluation.validations).toEqual([]);
  });

  it("materializes the selected source equipment package and records its choice", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const fighter = defaultBuilderDraft(fighterId, catalog, 1, "Equipped Fighter");
    const fighterCharacter = buildCharacter(fighter, rulesPackage, options);
    const wizard = defaultBuilderDraft(wizardId, catalog, 1, "Equipped Wizard");
    const wizardCharacter = buildCharacter(wizard, rulesPackage, options);

    expect(fighterCharacter.loadout.inventory.map((item) => item.entityId)).toEqual([
      "srd521.equipment.armor.heavy.chain-mail",
      "srd521.equipment.weapon.greatsword",
      "srd521.equipment.weapon.flail",
      "srd521.equipment.weapon.javelin",
    ]);
    expect(fighterCharacter.loadout.inventory.map((item) => item.entityId)).not.toContain(
      "srd521.equipment.weapon.longbow",
    );
    expect(fighterCharacter.loadout.equippedItemIds).toEqual(["chain-mail-1", "greatsword-1"]);
    expect(fighterCharacter.loadout.choices).toEqual([
      {
        choiceId: "srd521.choice.class.fighter.starting-equipment",
        optionIds: ["srd521.option.class.fighter.starting-equipment.a"],
      },
    ]);
    expect(wizardCharacter.loadout.inventory.map((item) => item.entityId)).toEqual([
      "srd521.equipment.weapon.dagger",
      "srd521.equipment.weapon.quarterstaff",
    ]);
    expect(wizardCharacter.loadout.equippedItemIds).toEqual(["quarterstaff-1"]);
  });

  it("supports gold-only equipment alternatives without class-specific assembly", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(fighterId, catalog, 1, "Gold Fighter");
    draft.startingEquipmentOptionId = "srd521.option.class.fighter.starting-equipment.c";

    const character = buildCharacter(draft, rulesPackage, options);

    expect(character.loadout.inventory).toEqual([]);
    expect(character.loadout.equippedItemIds).toEqual([]);
    expect(character.loadout.choices[0]?.optionIds).toEqual([
      "srd521.option.class.fighter.starting-equipment.c",
    ]);
  });

  it("uses package spellbook growth instead of a Wizard-specific formula", () => {
    const { rulesPackage } = loadWebData();
    const modifiedPackage = structuredClone(rulesPackage);
    const wizard = modifiedPackage.entities.find((entity) => entity.id === wizardId);
    if (wizard === undefined) throw new Error("Wizard fixture is missing.");
    const body = wizard.body as Record<string, unknown>;
    body.spellbookStartingSpells = 7;
    body.spellbookSpellsPerLevel = 3;

    const catalog = characterBuilderCatalog(modifiedPackage);
    expect(catalog.classes[wizardId].spellcasting?.countsByLevel[5]?.learnedLeveledSpells).toBe(19);
  });

  it("projects full-list preparation and always-prepared spells without class UI logic", () => {
    const { rulesPackage } = loadWebData();
    const modifiedPackage = structuredClone(rulesPackage);
    const wizard = modifiedPackage.entities.find((entity) => entity.id === wizardId);
    if (wizard === undefined) throw new Error("Wizard fixture is missing.");
    const body = wizard.body as Record<string, unknown>;
    body.spellPreparation = "full-list";
    body.alwaysPreparedSpells = { 1: ["srd521.spell.burning-hands"] };

    const catalog = characterBuilderCatalog(modifiedPackage);
    const draft = defaultBuilderDraft(wizardId, catalog, 1, "Full-list caster");
    const character = buildCharacter(draft, modifiedPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [modifiedPackage] });

    expect(draft.learnedSpellIds).toHaveLength(3);
    expect(draft.preparedSpellIds).toHaveLength(4);
    expect(draft.preparedSpellIds).not.toContain("srd521.spell.burning-hands");
    expect(evaluation.validations).toEqual([]);
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.burning-hands")?.prepared,
    ).toBe(true);
  });

  it("builds rules-valid Fighters at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [12, 20, 28, 36, 44];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(
        fighterId,
        catalog,
        level,
        `Level ${String(level)} Fighter`,
      );
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

      expect(
        evaluation.validations.filter((validation) => validation.severity === "error"),
        `level ${String(level)}`,
      ).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.fighter.champion" : undefined,
      );
    }
  });

  it("builds complete Wizard spellbooks at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [8, 14, 20, 26, 32];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(wizardId, catalog, level, `Level ${String(level)} Wizard`);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const counts = catalog.classes[wizardId].spellcasting?.countsByLevel[level];

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.learnedSpellIds).toHaveLength(
        (counts?.cantrips ?? 0) + (counts?.learnedLeveledSpells ?? 0),
      );
      expect(character.loadout.preparedSpellIds).toHaveLength(counts?.preparedSpells ?? 0);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.wizard.evoker" : undefined,
      );
      expect(character.build.proficiencyChoices.expertise).toHaveLength(level >= 2 ? 1 : 0);
    }
  });

  it("reconciles dependent choices when a draft changes level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelOne = defaultBuilderDraft(wizardId, catalog, 1, "Ascending Wizard");
    const levelFive = updateBuilderLevel(levelOne, catalog, 5);
    const returnedToOne = updateBuilderLevel(levelFive, catalog, 1);

    expect(levelFive.learnedSpellIds).toHaveLength(18);
    expect(levelFive.preparedSpellIds).toHaveLength(9);
    expect(levelFive.scholarSkillId).toBe("srd521.skill.arcana");
    expect(validateBuilderDraft(levelFive, catalog)).toEqual([]);
    expect(returnedToOne.learnedSpellIds).toHaveLength(9);
    expect(returnedToOne.preparedSpellIds).toHaveLength(4);
    expect(returnedToOne.scholarSkillId).toBe("");
    expect(validateBuilderDraft(returnedToOne, catalog)).toEqual([]);
  });

  it("rejects incomplete, duplicate, invalid-origin, and undersized spell choices", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const fighter = defaultBuilderDraft(fighterId, catalog);
    fighter.classSkillIds = ["srd521.skill.athletics"];
    fighter.speciesSkillIds = ["srd521.skill.athletics"];
    fighter.startingEquipmentOptionId = "srd521.option.class.fighter.starting-equipment.unknown";

    expect(validateBuilderDraft(fighter, catalog)).toEqual(
      expect.arrayContaining([
        "Enter a character name.",
        "Choose exactly 2 Fighter skill proficiencies.",
        "Each selected skill proficiency must be unique.",
        "Choose a Fighter starting-equipment package.",
      ]),
    );

    const invalidOrigin = defaultBuilderDraft(fighterId, catalog, 1, "Invalid origin");
    invalidOrigin.originFeatId = "srd521.feat.origin.savage-attacker";
    invalidOrigin.originFeatSkillIds = [];
    invalidOrigin.backgroundAbilityScoreIncreases = { charisma: 3 };
    expect(validateBuilderDraft(invalidOrigin, catalog)).toEqual(
      expect.arrayContaining([
        "Choose a valid ability-score allocation for Soldier.",
        "Choose an eligible Origin feat granted by your species.",
      ]),
    );

    const wizard = defaultBuilderDraft(wizardId, catalog, 5, "Sparse Wizard");
    wizard.learnedSpellIds = wizard.learnedSpellIds.slice(0, 5);
    wizard.preparedSpellIds = [];
    expect(validateBuilderDraft(wizard, catalog)).toEqual(
      expect.arrayContaining([
        "Choose 4 cantrips and 14 spellbook spells available at this level.",
        "Prepare exactly 9 Wizard spells.",
      ]),
    );
  });
});
