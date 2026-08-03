import { describe, expect, it } from "vitest";

import { evaluateCharacter } from "@dnd/rules-core";

import {
  buildCharacter,
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
    expect(catalog.backgroundSkillIds).toEqual([
      "srd521.skill.athletics",
      "srd521.skill.intimidation",
    ]);
    expect(catalog.masteryCountByLevel).toMatchObject({ 1: 3, 4: 4, 5: 4 });
    expect(catalog.wizardSpellCountsByLevel[5]).toEqual({
      cantrips: 4,
      spellbookSpells: 14,
      preparedSpells: 9,
      maximumSpellLevel: 3,
    });
    expect(
      catalog.wizardSpells.find((spell) => spell.id === "srd521.spell.fireball"),
    ).toMatchObject({ name: "Fireball", level: 3 });
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

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
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
      const counts = catalog.wizardSpellCountsByLevel[level];

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.learnedSpellIds).toHaveLength(
        (counts?.cantrips ?? 0) + (counts?.spellbookSpells ?? 0),
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

  it("rejects incomplete, duplicate, and undersized spell choices before creation", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const fighter = defaultBuilderDraft(fighterId, catalog);
    fighter.classSkillIds = ["srd521.skill.athletics"];
    fighter.speciesSkillId = "srd521.skill.athletics";

    expect(validateBuilderDraft(fighter, catalog)).toEqual(
      expect.arrayContaining([
        "Enter a character name.",
        "Choose exactly two Fighter skill proficiencies.",
        "Each selected skill proficiency must be unique.",
      ]),
    );

    const wizard = defaultBuilderDraft(wizardId, catalog, 5, "Sparse Wizard");
    wizard.learnedSpellIds = wizard.learnedSpellIds.slice(0, 5);
    wizard.preparedSpellIds = [];
    expect(validateBuilderDraft(wizard, catalog)).toEqual(
      expect.arrayContaining([
        "Choose 4 cantrips and 14 spellbook spells available at this level.",
        "Prepare exactly 9 spellbook spells.",
      ]),
    );
  });
});
