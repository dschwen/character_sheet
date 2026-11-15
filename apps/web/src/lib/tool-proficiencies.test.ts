import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { evaluateCharacter } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  bardId,
  monkId,
  rogueId,
  updateBuilderBackground,
  updateAdvancementFeatSelection,
  validateBuilderDraft,
  type BuilderClassId,
  type CharacterBuilderDraft,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, previewLevelUp } from "./character-level-up";
import { loadWebData } from "./server-data";
import { advancementToolCandidates, sourceToolCandidates } from "./tool-proficiencies";

const skilled = "srd521.feat.origin.skilled";
const options = { id: "tools", now: new Date("2026-11-14T12:00:00Z") };
function setup(classId: BuilderClassId = fighterId, level = 4) {
  const { rulesPackage, fixtures } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(classId, catalog, level, "Tool choices");
  const evaluate = (character: ReturnType<typeof buildCharacter>) =>
    evaluateCharacter({ character, packages: [rulesPackage] });
  return { rulesPackage, fixtures, catalog, draft, evaluate };
}
function mixedOrigin(draft: CharacterBuilderDraft, ids: string[]): CharacterBuilderDraft {
  return {
    ...draft,
    originFeatSkillIds: draft.originFeatSkillIds.slice(0, 3 - ids.length),
    toolProficiencySelections: { ...draft.toolProficiencySelections, [skilled]: ids },
  };
}
describe("source-driven tool proficiency choices", () => {
  it("loads 37 individual tools without treating generic variants as proficiencies", () => {
    const { catalog } = setup();
    expect(Object.keys(catalog.tools)).toHaveLength(37);
    expect(
      Object.values(catalog.tools).filter(({ category }) => category === "musical-instrument"),
    ).toHaveLength(10);
    expect(
      Object.values(catalog.tools).filter(({ category }) => category === "gaming-set"),
    ).toHaveLength(4);
    expect(catalog.tools["srd521.tool.musical-instrument"]).toBeUndefined();
    expect(catalog.tools["srd521.tool.gaming-set"]).toBeUndefined();
  });
  it.each([fighterId, bardId, monkId, rogueId] as const)(
    "builds legal source-specific default tools for %s",
    (id) => {
      const { catalog, draft, rulesPackage, evaluate } = setup(id);
      expect(validateBuilderDraft(draft, catalog)).toEqual([]);
      const character = buildCharacter(draft, rulesPackage, options);
      expect(
        evaluate(character).validations.filter(({ severity }) => severity === "error"),
      ).toEqual([]);
      expect(character.build.toolProficiencyChoices).toBeDefined();
      if (id === bardId)
        expect(
          character.build.toolProficiencyChoices?.find(({ sourceId }) => sourceId === id)?.toolIds,
        ).toHaveLength(3);
      if (id === monkId)
        expect(
          character.build.toolProficiencyChoices?.find(({ sourceId }) => sourceId === id)?.toolIds,
        ).toHaveLength(1);
    },
  );
  it.each([0, 1, 2, 3])(
    "supports Skilled with %s tools and the remaining allowance as skills",
    (count) => {
      const { catalog, draft, rulesPackage, evaluate } = setup();
      const tools = ["srd521.tool.lute", "srd521.tool.horn", "srd521.tool.flute"].slice(0, count);
      const selected = mixedOrigin(draft, tools);
      expect(validateBuilderDraft(selected, catalog)).toEqual([]);
      const character = buildCharacter(selected, rulesPackage, options);
      const evaluation = evaluate(character);
      expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
      for (const id of tools) {
        const test = evaluation.d20Tests[`tool.${id.split(".").at(-1) ?? ""}.charisma`];
        expect(test?.proficiency).toMatchObject({ level: "proficient", sources: [skilled] });
        expect(test?.modifier).toBe(
          Number(evaluation.facts["ability.charisma.modifier"]) +
            Number(evaluation.facts.proficiencyBonus),
        );
        expect(evaluation.traces[test?.traceId ?? ""]?.sourceReferences).toContainEqual(
          expect.objectContaining({ entityId: id, page: 94 }),
        );
        expect(evaluation.traces[test?.traceId ?? ""]?.sourceReferences).toContainEqual(
          expect.objectContaining({ entityId: "srd521.rule.tool-proficiency", page: 93 }),
        );
      }
      expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(
        character,
      );
    },
  );
  it("records repeated Skilled acquisitions separately and preserves them on advancement", () => {
    const { catalog, draft, rulesPackage, evaluate } = setup();
    let selected = mixedOrigin(draft, ["srd521.tool.lute"]);
    selected = updateAdvancementFeatSelection(selected, catalog, 0, {
      featId: skilled,
      abilityScoreIncreases: {},
      skillIds: [],
      toolIds: ["srd521.tool.horn", "srd521.tool.flute", "srd521.tool.viol"],
    });
    expect(validateBuilderDraft(selected, catalog)).toEqual([]);
    const character = buildCharacter(selected, rulesPackage, options);
    character.state.currentHitPoints = 2;
    const before = structuredClone(character);
    const next = createLevelUpDraft(character, catalog);
    expect(next.advancementFeats[0]?.toolIds).toEqual([
      "srd521.tool.horn",
      "srd521.tool.flute",
      "srd521.tool.viol",
    ]);
    const advanced = levelUpCharacter(character, next, rulesPackage, options);
    expect(evaluate(advanced).validations.filter(({ severity }) => severity === "error")).toEqual(
      [],
    );
    expect(advanced.build.toolProficiencyChoices).toEqual(before.build.toolProficiencyChoices);
    expect(advanced.build.levels.slice(0, 4)).toEqual(before.build.levels);
    expect(advanced.state).toEqual(before.state);
    expect(advanced.loadout.inventory).toEqual(before.loadout.inventory);
    next.advancementFeats[0] = {
      featId: skilled,
      abilityScoreIncreases: {},
      toolIds: ["srd521.tool.bagpipes", "srd521.tool.flute", "srd521.tool.viol"],
      skillIds: [],
    };
    expect(previewLevelUp(character, next, rulesPackage, options).issues.join(" ")).toMatch(
      /Earlier/,
    );
    expect(character).toEqual(before);
  });
  it("rejects unknown, foreign-category, duplicate, and over-budget tools", () => {
    const { draft, catalog, rulesPackage, evaluate } = setup(bardId);
    for (const ids of [
      ["srd521.tool.fake"],
      ["srd521.tool.lute", "srd521.tool.lute"],
      ["srd521.tool.lute", "srd521.tool.horn", "srd521.tool.flute", "srd521.tool.viol"],
    ]) {
      const invalid = mixedOrigin(draft, ids);
      expect(validateBuilderDraft(invalid, catalog).length).toBeGreaterThan(0);
    }
    const character = buildCharacter(draft, rulesPackage, options);
    const choice = character.build.toolProficiencyChoices?.find(
      ({ sourceId }) => sourceId === bardId,
    );
    if (!choice) throw new Error("Missing source");
    choice.toolIds[0] = "srd521.tool.thieves-tools";
    expect(evaluate(character).validations.map(({ code }) => code)).toContain(
      "TOOL_PROFICIENCY_NOT_ALLOWED",
    );
    choice.toolIds = [];
    expect(evaluate(character).validations.map(({ code }) => code)).toContain(
      "TOOL_PROFICIENCY_COUNT",
    );
    choice.toolIds = ["srd521.tool.lute", "srd521.tool.lute", "srd521.tool.lute"];
    expect(evaluate(character).validations.map(({ code }) => code)).toContain(
      "DUPLICATE_TOOL_PROFICIENCY",
    );
    choice.toolIds = ["srd521.skill.arcana", "srd521.tool.horn", "srd521.tool.flute"];
    expect(evaluate(character).validations.map(({ code }) => code)).toContain(
      "TOOL_PROFICIENCY_NOT_ALLOWED",
    );
    character.build.toolProficiencyChoices?.push({
      sourceId: "srd521.class.wizard",
      toolIds: ["srd521.tool.lute"],
    });
    expect(evaluate(character).validations.map(({ code }) => code)).toContain(
      "TOOL_PROFICIENCY_SOURCE_NOT_GRANTED",
    );
    character.build.toolProficiencyChoices?.push({ sourceId: bardId, toolIds: [] });
    expect(evaluate(character).validations.map(({ code }) => code)).toContain(
      "TOOL_PROFICIENCY_SOURCE_NOT_GRANTED",
    );
  });
  it("excludes fixed grants and other acquisitions and reconciles background switches", () => {
    const { draft, catalog } = setup(monkId);
    const acolyte = updateBuilderBackground(draft, catalog, "srd521.background.acolyte");
    expect(sourceToolCandidates(acolyte, catalog, monkId)).not.toContain(
      "srd521.tool.calligraphers-supplies",
    );
    expect(acolyte.toolProficiencySelections?.["srd521.background.soldier"]).toBeUndefined();
    let repeated = updateAdvancementFeatSelection(acolyte, catalog, 0, {
      featId: skilled,
      abilityScoreIncreases: {},
      toolIds: [],
    });
    expect(advancementToolCandidates(repeated, catalog, 0)).not.toContain(
      "srd521.tool.calligraphers-supplies",
    );
    repeated = mixedOrigin(repeated, ["srd521.tool.lute"]);
    expect(advancementToolCandidates(repeated, catalog, 0)).not.toContain("srd521.tool.lute");
  });
  it("keeps legacy tool choices absent through advancement without inventing grants", () => {
    const { fixtures, catalog, rulesPackage, evaluate } = setup();
    const fixture = fixtures.find(({ filename }) => filename === "fighter-1.json");
    if (!fixture) throw new Error("Missing fixture");
    const before = structuredClone(fixture.character);
    expect(before.build.toolProficiencyChoices).toBeUndefined();
    const advanced = levelUpCharacter(
      before,
      createLevelUpDraft(before, catalog),
      rulesPackage,
      options,
    );
    expect(advanced.build.toolProficiencyChoices).toBeUndefined();
    expect(evaluate(advanced).validations.filter(({ severity }) => severity === "error")).toEqual(
      [],
    );
    expect(Object.keys(evaluate(advanced).d20Tests).some((id) => id.startsWith("tool.dice."))).toBe(
      false,
    );
  });
});
