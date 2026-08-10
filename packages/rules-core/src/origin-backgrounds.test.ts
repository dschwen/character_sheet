import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

import { evaluateCharacter } from "./character-evaluator.js";

const packageRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
const fixturesRoot = new URL("../../test-fixtures/", import.meta.url);

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function loadRulesPackage(): LoadedRulesPackage {
  return {
    manifest: packageManifestSchema.parse(readJson(new URL("manifest.json", packageRoot))),
    entities: contentEntitySchema.array().parse(readJson(new URL("entities.json", packageRoot))),
    authoringIr: [
      authoringIrSchema.parse(readJson(new URL("authoring-ir/origin.alert.json", packageRoot))),
    ],
  };
}

function loadCriminal(): CharacterDocument {
  const character = characterDocumentSchema.parse(
    readJson(new URL("characters/barbarian-1.json", fixturesRoot)),
  );
  character.build.backgroundId = "srd521.background.criminal";
  character.build.backgroundAbilityScoreIncreases = {
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
  };
  character.build.featIds = ["srd521.feat.origin.alert", "srd521.feat.origin.skilled"];
  const skilledStealth = character.build.proficiencyChoices.skills.find(
    (choice) =>
      choice.sourceId === "srd521.feat.origin.skilled" && choice.skillId === "srd521.skill.stealth",
  );
  if (skilledStealth === undefined) throw new Error("Expected the Skilled Stealth selection.");
  skilledStealth.skillId = "srd521.skill.intimidation";
  return character;
}

describe("SRD backgrounds and Origin feats", () => {
  it("grants Criminal skills and Alert Initiative proficiency from content", () => {
    const evaluation = evaluateCharacter({
      character: loadCriminal(),
      packages: [loadRulesPackage()],
    });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.proficiencies.skills["sleight-of-hand"]?.level).toBe("proficient");
    expect(evaluation.proficiencies.skills.stealth?.level).toBe("proficient");
    expect(evaluation.d20Tests.initiative).toMatchObject({
      modifier: 4,
      proficiency: { level: "none", bonus: 0 },
    });
    expect(evaluation.traces.initiative?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "srd521.feat.origin.alert", page: 87 }),
      ]),
    );
  });
});
