import { describe, expect, it } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  bardId,
  monkId,
  updateAdvancementFeatSelection,
  updateBuilderBackground,
  type BuilderClassId,
} from "./character-builder";
import { loadWebData } from "./server-data";
import {
  legacyToolCandidates,
  legacyToolChoiceEditor,
  proposeLegacyToolChoices,
} from "./legacy-tool-choices";

const { rulesPackage, fixtures } = loadWebData();
const catalog = characterBuilderCatalog(rulesPackage);
const soldier = "srd521.background.soldier";
const skilled = "srd521.feat.origin.skilled";
const dice = "srd521.tool.dice";
const lute = "srd521.tool.lute";
const now = new Date("2026-11-16T12:00:00Z");
function legacy(classId: BuilderClassId = fighterId, level = 1) {
  const character = buildCharacter(
    defaultBuilderDraft(classId, catalog, level, "Legacy"),
    rulesPackage,
    { id: "legacy", now },
  );
  delete character.build.toolProficiencyChoices;
  return character;
}
describe("explicit legacy tool choices", () => {
  it("does not assume tools when inspecting a real older Fighter save", () => {
    const fixture = fixtures.find(({ filename }) => filename === "fighter-1.json");
    if (!fixture) throw new Error("Missing Fighter fixture");
    const character = fixture.character;
    const before = structuredClone(character);
    expect(legacyToolChoiceEditor(character, catalog).sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: soldier, minimum: 1, maximum: 1 }),
        expect.objectContaining({ sourceId: skilled, minimum: 0, maximum: 0 }),
      ]),
    );
    expect(
      proposeLegacyToolChoices(character, catalog, rulesPackage, {}).nextCharacter,
    ).toBeUndefined();
    expect(character).toEqual(before);
    expect(
      proposeLegacyToolChoices(character, catalog, rulesPackage, { [soldier]: [dice] }, now)
        .nextCharacter?.build.toolProficiencyChoices,
    ).toContainEqual({ sourceId: soldier, toolIds: [dice] });
  });
  it.each([fighterId, bardId, monkId] as const)(
    "resolves %s from metadata, without requiring advancement eligibility",
    (classId) => {
      const character = legacy(classId, catalog.classes[classId].builder.supportedLevelMaximum);
      character.state.currentHitPoints = 2;
      const before = structuredClone(character);
      const editor = legacyToolChoiceEditor(character, catalog);
      expect(editor.issues).toEqual([]);
      const selections: Record<string, string[]> = {};
      for (const source of editor.sources)
        selections[source.sourceId] = legacyToolCandidates(
          editor,
          selections,
          source.sourceId,
        ).slice(0, source.maximum);
      const proposal = proposeLegacyToolChoices(character, catalog, rulesPackage, selections, now);
      expect(proposal.issues).toEqual([]);
      const next = proposal.nextCharacter;
      if (!next) throw new Error(proposal.issues.join(" "));
      expect(next).toEqual({
        ...before,
        build: {
          ...before.build,
          toolProficiencyChoices: editor.sources.map(({ sourceId }) => ({
            sourceId,
            toolIds: selections[sourceId],
          })),
        },
        metadata: {
          ...before.metadata,
          updatedAt: now.toISOString(),
          revision: before.metadata.revision + 1,
        },
      });
      expect(
        evaluateCharacter({ character: next, packages: [rulesPackage] }).validations.filter(
          ({ severity }) => severity === "error",
        ),
      ).toEqual([]);
      expect(character).toEqual(before);
      expect(proposeLegacyToolChoices(next, catalog, rulesPackage, selections).issues).toContain(
        "Original tool choices are already recorded.",
      );
    },
  );
  it("keeps original skills and repeated feat acquisitions locked", () => {
    let draft = defaultBuilderDraft(fighterId, catalog, 5, "Repeated");
    draft = {
      ...draft,
      originFeatSkillIds: draft.originFeatSkillIds.slice(0, 2),
      toolProficiencySelections: { ...draft.toolProficiencySelections, [skilled]: [lute] },
    };
    draft = updateAdvancementFeatSelection(draft, catalog, 0, {
      featId: skilled,
      abilityScoreIncreases: {},
      skillIds: [],
      toolIds: ["srd521.tool.horn", "srd521.tool.flute", "srd521.tool.viol"],
    });
    const character = buildCharacter(draft, rulesPackage, { id: "repeated", now });
    delete character.build.toolProficiencyChoices;
    const before = structuredClone(character);
    expect(
      legacyToolChoiceEditor(character, catalog).sources.find(
        ({ sourceId }) => sourceId === skilled,
      ),
    ).toMatchObject({ minimum: 1, maximum: 1 });
    expect(
      legacyToolCandidates(legacyToolChoiceEditor(character, catalog), {}, skilled),
    ).not.toContain("srd521.tool.horn");
    const proposal = proposeLegacyToolChoices(
      character,
      catalog,
      rulesPackage,
      { [soldier]: [dice], [skilled]: [lute] },
      now,
    );
    expect(proposal.issues).toEqual([]);
    expect(proposal.nextCharacter?.build.levels).toEqual(before.build.levels);
    expect(proposal.nextCharacter?.build.proficiencyChoices).toEqual(
      before.build.proficiencyChoices,
    );
    expect(character).toEqual(before);
  });
  it.each([
    {},
    { [soldier]: [lute] },
    { [soldier]: [dice, dice] },
    { [soldier]: ["srd521.tool.fake"] },
    { [soldier]: [dice], [skilled]: [lute] },
    { [soldier]: [dice], "srd521.class.wizard": [lute] },
  ])("rejects incomplete, ineligible, over-budget or foreign selections: %j", (selections) => {
    expect(
      proposeLegacyToolChoices(legacy(), catalog, rulesPackage, selections).nextCharacter,
    ).toBeUndefined();
  });
  it("excludes fixed grants and prevents the same choice across sources", () => {
    const draft = updateBuilderBackground(
      defaultBuilderDraft(monkId, catalog, 1, "Monk"),
      catalog,
      "srd521.background.acolyte",
    );
    const character = buildCharacter(draft, rulesPackage, { id: "fixed", now });
    delete character.build.toolProficiencyChoices;
    expect(
      legacyToolCandidates(legacyToolChoiceEditor(character, catalog), {}, monkId),
    ).not.toContain("srd521.tool.calligraphers-supplies");
    const fighter = legacy();
    fighter.build.proficiencyChoices.skills = fighter.build.proficiencyChoices.skills.filter(
      ({ sourceId }) => sourceId !== skilled,
    );
    expect(
      proposeLegacyToolChoices(fighter, catalog, rulesPackage, {
        [soldier]: [dice],
        [skilled]: [dice, lute, "srd521.tool.horn"],
      }).nextCharacter,
    ).toBeUndefined();
  });
  it("can explicitly confirm that a fixed-grant background has no missing tool allowance", () => {
    const draft = updateBuilderBackground(
      defaultBuilderDraft(fighterId, catalog, 1, "Fixed"),
      catalog,
      "srd521.background.acolyte",
    );
    const character = buildCharacter(draft, rulesPackage, { id: "fixed-only", now });
    delete character.build.toolProficiencyChoices;
    const before = structuredClone(character);
    const proposal = proposeLegacyToolChoices(character, catalog, rulesPackage, {}, now);
    expect(proposal.issues).toEqual([]);
    expect(proposal.nextCharacter?.build.toolProficiencyChoices).toEqual([
      { sourceId: skilled, toolIds: [] },
    ]);
    expect(proposal.nextCharacter?.loadout).toEqual(before.loadout);
    expect(character).toEqual(before);
  });
  it("refuses ambiguous or incomplete acquisition histories without inventing records", () => {
    for (const incomplete of [true, false]) {
      const character = legacy(fighterId, 5);
      const acquisitionLevel = character.build.levels[3];
      if (!acquisitionLevel) throw new Error("Missing acquisition level");
      if (incomplete)
        acquisitionLevel.featSelections = [{ featId: skilled, abilityScoreIncreases: {} }];
      else delete acquisitionLevel.featSelections;
      const before = structuredClone(character);
      expect(
        proposeLegacyToolChoices(character, catalog, rulesPackage, { [soldier]: [dice] })
          .nextCharacter,
      ).toBeUndefined();
      expect(character).toEqual(before);
    }
  });
});
