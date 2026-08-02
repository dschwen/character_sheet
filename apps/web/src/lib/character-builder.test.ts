import { describe, expect, it } from "vitest";

import { evaluateCharacter } from "@dnd/rules-core";

import {
  buildFighterCharacter,
  defaultFighterDraft,
  fighterBuilderCatalog,
  validateFighterDraft,
} from "./character-builder";
import { loadWebData } from "./server-data";

const options = { id: "builder-test-fighter", now: new Date("2026-08-02T12:00:00.000Z") };

describe("Fighter character builder", () => {
  it("derives its supported choices from the loaded content package", () => {
    const { rulesPackage } = loadWebData();
    const catalog = fighterBuilderCatalog(rulesPackage);

    expect(catalog.className).toBe("Fighter");
    expect(catalog.classSkillIds).toContain("srd521.skill.perception");
    expect(catalog.backgroundSkillIds).toEqual([
      "srd521.skill.athletics",
      "srd521.skill.intimidation",
    ]);
    expect(catalog.masteryCountByLevel).toMatchObject({ 1: 3, 4: 4, 5: 4 });
  });

  it("builds rules-valid Fighters at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const expectedHitPoints = [12, 20, 28, 36, 44];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultFighterDraft();
      draft.name = `Level ${String(level)} Fighter`;
      draft.level = level;
      if (level >= 4) draft.weaponMasteryIds.push("srd521.equipment.weapon.longbow");
      const character = buildFighterCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.fighter.champion" : undefined,
      );
    }
  });

  it("rejects incomplete and duplicate choices before creation", () => {
    const { rulesPackage } = loadWebData();
    const catalog = fighterBuilderCatalog(rulesPackage);
    const draft = defaultFighterDraft();
    draft.classSkillIds = ["srd521.skill.athletics"];
    draft.speciesSkillId = "srd521.skill.athletics";

    expect(validateFighterDraft(draft, catalog)).toEqual(
      expect.arrayContaining([
        "Enter a character name.",
        "Choose exactly two Fighter skill proficiencies.",
        "Each selected skill proficiency must be unique.",
      ]),
    );
  });
});
