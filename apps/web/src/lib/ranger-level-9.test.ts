import { describe, expect, it } from "vitest";
import { characterDocumentSchema } from "@dnd/character-model";
import { classBuilderMetadataSchema } from "@dnd/content-schema";
import {
  evaluateCharacter,
  proposeAction,
  proposeRest,
  proposeSpellCast,
  spellPreparationEditor,
} from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  expertiseCount,
  expertiseSelectionSources,
  expertiseSkillCandidates,
  rangerId,
  validateBuilderDraft,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { loadWebData } from "./server-data";

const options = { id: "ranger-nine", now: new Date("2026-10-11T19:00:00Z") };
const deft = "srd521.class-feature.ranger.deft-explorer";
const expertise = "srd521.class-feature.ranger.expertise";
const favored = "srd521.resource.ranger.favored-enemy";
function setup(level = 9) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(rangerId, catalog, level, "Expert Hunter");
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, draft, character, input, evaluation: evaluateCharacter(input) };
}

describe("Ranger level 9 and distinct Expertise grants", () => {
  it("creates a legal Ranger with three expert skills, third-level slots, and source-linked values", () => {
    const { draft, catalog, character, evaluation } = setup();
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);
    expect(evaluation.validations).toEqual([]);
    expect(expertiseCount(draft, catalog)).toBe(3);
    expect(expertiseSelectionSources(draft, catalog)).toEqual([deft, expertise, expertise]);
    expect(character.build.proficiencyChoices.expertise.map(({ sourceId }) => sourceId)).toEqual([
      deft,
      expertise,
      expertise,
    ]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 9,
      alwaysPreparedSpells: 1,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 2 },
      ],
    });
    expect(character.loadout.preparedSpellIds).toHaveLength(9);
    expect(character.loadout.preparedSpellIds).not.toContain("srd521.spell.hunter-s-mark");
    const slot = evaluation.spellcasting?.slots.find(({ level }) => level === 3);
    expect(evaluation.traces[slot?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: 58 })]),
    );
    for (const { skillId, sourceId } of character.build.proficiencyChoices.expertise) {
      const test = evaluation.d20Tests[`skill.${skillId.replace("srd521.skill.", "")}`];
      expect(test?.proficiency).toMatchObject({ level: "expertise", bonus: 8 });
      expect(evaluation.traces[test?.traceId ?? ""]?.sourceReferences).toEqual(
        expect.arrayContaining([expect.objectContaining({ entityId: sourceId, page: 59 })]),
      );
    }
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 9,
    });
  });

  it("advances 8→9 with two new choices without relabeling Deft Explorer or refreshing state", () => {
    const { character, catalog, rulesPackage } = setup(8);
    character.state.currentHitPoints = 17;
    character.state.temporaryHitPoints = 2;
    character.state.expendedResources[favored] = 3;
    character.state.expendedSpellSlots = { "1": 2, "2": 3 };
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    expect(draft.expertiseSkillIds).toHaveLength(3);
    const previous = before.build.proficiencyChoices.expertise[0];
    if (!previous) throw new Error("Missing earlier Expertise");
    expect(draft.expertiseSkillIds[0]).toBe(previous.skillId);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(character).toEqual(before);
    expect(next.state).toEqual(before.state);
    expect(next.build.levels.slice(0, 8)).toEqual(before.build.levels);
    expect(next.build.proficiencyChoices.expertise).toContainEqual(previous);
    expect(
      next.build.proficiencyChoices.expertise.filter(({ sourceId }) => sourceId === deft),
    ).toHaveLength(1);
    expect(
      next.build.proficiencyChoices.expertise.filter(({ sourceId }) => sourceId === expertise),
    ).toHaveLength(2);
    expect(next.build.featIds).toEqual(before.build.featIds);
    expect(next.build.featAbilityScoreIncreases).toEqual(before.build.featAbilityScoreIncreases);
    expect(next.loadout.inventory).toEqual(before.loadout.inventory);
    expect(next.loadout.currency).toEqual(before.loadout.currency);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.slots.find(({ level }) => level === 3)).toMatchObject({
      current: 2,
      expended: 0,
    });
    expect(evaluation.resources.find(({ id }) => id === favored)).toMatchObject({
      maximum: 4,
      expended: 3,
      current: 1,
    });
  });

  it("allows different newly proficient origin skills while preserving the initial source", () => {
    const { character, catalog, rulesPackage } = setup(8);
    const draft = createLevelUpDraft(character, catalog);
    const previous = draft.expertiseSkillIds[0];
    if (!previous) throw new Error("Missing earlier skill");
    const candidates = expertiseSkillCandidates(draft, catalog).filter((id) => id !== previous);
    const origin = candidates.find((id) => !draft.classSkillIds.includes(id));
    const other = candidates.find((id) => id !== origin);
    if (!origin || !other) throw new Error("Missing proficient candidates");
    draft.expertiseSkillIds = [previous, origin, other];
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    expect(next.build.proficiencyChoices.expertise).toContainEqual({
      skillId: origin,
      sourceId: expertise,
    });
    expect(evaluateCharacter({ character: next, packages: [rulesPackage] }).validations).toEqual(
      [],
    );
  });

  it.each(["missing", "duplicate", "unproficient", "early"])(
    "rejects %s Expertise selections in the builder",
    (invalid) => {
      const { draft, catalog } = setup(invalid === "early" ? 8 : 9);
      if (invalid === "missing") draft.expertiseSkillIds.pop();
      if (invalid === "duplicate") draft.expertiseSkillIds[2] = draft.expertiseSkillIds[0] ?? "";
      if (invalid === "unproficient") {
        const missing = catalog.classes[rangerId].builder.expertiseChoice?.eligibleSkillIds.find(
          (id) => !expertiseSkillCandidates(draft, catalog).includes(id),
        );
        if (!missing) throw new Error("Missing unproficient skill");
        draft.expertiseSkillIds[2] = missing;
      }
      if (invalid === "early")
        draft.expertiseSkillIds.push(
          ...expertiseSkillCandidates(draft, catalog)
            .filter((id) => !draft.expertiseSkillIds.includes(id))
            .slice(0, 2),
        );
      expect(validateBuilderDraft(draft, catalog).length).toBeGreaterThan(0);
    },
  );

  it.each(["replace", "relabel"])(
    "rejects an attempted %s of earlier Deft Explorer during advancement",
    (invalid) => {
      const { character, catalog, rulesPackage } = setup(8);
      const draft = createLevelUpDraft(character, catalog);
      if (invalid === "relabel") draft.expertiseSkillIds.reverse();
      else {
        const replacement = expertiseSkillCandidates(draft, catalog).find(
          (id) => !draft.expertiseSkillIds.includes(id),
        );
        if (!replacement) throw new Error("Missing replacement skill");
        draft.expertiseSkillIds[0] = replacement;
      }
      const before = structuredClone(character);
      const preview = previewLevelUp(character, draft, rulesPackage, options);
      expect(preview.issues).toContain(
        "Earlier Expertise selections cannot change during level up.",
      );
      expect(preview.character).toBeUndefined();
      expect(character).toEqual(before);
    },
  );

  it.each(["duplicate", "missing", "early", "wrong-source"])(
    "validates forged persisted choices: %s",
    (invalid) => {
      const { character, input } = setup();
      const original = character.build.proficiencyChoices.expertise[0];
      const later = character.build.proficiencyChoices.expertise[1];
      if (!original || !later) throw new Error("Missing test choices");
      if (invalid === "duplicate") later.skillId = original.skillId;
      if (invalid === "missing") character.build.proficiencyChoices.expertise.pop();
      if (invalid === "early") character.build.levels.pop();
      if (invalid === "wrong-source") later.sourceId = deft;
      expect(evaluateCharacter(input).validations.map(({ code }) => code)).toContain(
        invalid === "duplicate" ? "DUPLICATE_EXPERTISE_SKILL" : "RANGER_EXPERTISE_COUNT",
      );
    },
  );

  it("casts third-level spells and recovers slots without altering the Expertise grants", () => {
    const { character, input, rulesPackage } = setup();
    const spellId = "srd521.spell.protection-from-energy";
    character.loadout.preparedSpellIds[0] = spellId;
    expect(
      spellPreparationEditor(character, rulesPackage)?.options.find(({ id }) => id === spellId)
        ?.level,
    ).toBe(3);
    expect(proposeSpellCast(input, { spellId, slotLevel: 2 }).applicable).toBe(false);
    const before = structuredClone(character);
    const cast = proposeSpellCast(input, { spellId, slotLevel: 3 });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots["3"]).toBe(1);
    expect(cast.nextState.concentrationSpellId).toBe(spellId);
    expect(character).toEqual(before);
    character.state = cast.nextState;
    character.state.expendedSpellSlots["3"] = 2;
    expect(proposeSpellCast(input, { spellId, slotLevel: 3 })).toMatchObject({
      applicable: false,
      changes: [],
      nextState: character.state,
    });
    expect(proposeRest(input, { event: "short-rest" }).nextState.expendedSpellSlots["3"]).toBe(2);
    expect(proposeRest(input, { event: "long-rest" }).nextState.expendedSpellSlots["3"]).toBe(0);
    expect(character.build.proficiencyChoices.expertise).toEqual(
      before.build.proficiencyChoices.expertise,
    );
  });

  it("raises Favored Enemy to four free uses without raising attacks or granting Tireless early", () => {
    const { evaluation, character, input } = setup();
    expect(evaluation.resources.find(({ id }) => id === favored)).toMatchObject({
      maximum: 4,
      current: 4,
    });
    character.state.expendedResources[favored] = 3;
    const action = proposeAction(input, { actionId: "action.free-hunters-mark" });
    expect(action.applicable).toBe(true);
    expect(action.nextState.expendedResources[favored]).toBe(4);
    expect(action.nextState.concentrationSpellId).toBe("srd521.spell.hunter-s-mark");
    expect(evaluation.facts["attackAction.attacks"]).toBe(2);
    expect(evaluation.actions.some(({ id }) => id.includes("tireless"))).toBe(false);
  });
});

describe("source-aware Expertise builder metadata", () => {
  it.each(["ambiguous", "wrong-first-source", "wrong-first-level", "unordered", "empty", "zero"])(
    "rejects %s grants",
    (invalid) => {
      const { catalog } = setup();
      const metadata = structuredClone(catalog.classes[rangerId].builder);
      const choice = metadata.expertiseChoice;
      if (!choice?.grants) throw new Error("Missing source-aware grants");
      if (invalid === "ambiguous") choice.countByLevel = { "9": 3 };
      if (invalid === "wrong-first-source" && choice.grants[0])
        choice.grants[0].sourceId = expertise;
      if (invalid === "wrong-first-level" && choice.grants[0]) choice.grants[0].level = 3;
      if (invalid === "unordered") choice.grants.reverse();
      if (invalid === "empty") choice.grants = [];
      if (invalid === "zero" && choice.grants[1]) choice.grants[1].count = 0;
      expect(classBuilderMetadataSchema.safeParse(metadata).success).toBe(false);
    },
  );
});
