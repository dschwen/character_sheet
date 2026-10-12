import { describe, expect, it } from "vitest";
import { z } from "zod";
import { evaluateCharacter, proposeSpellCast } from "@dnd/rules-core";
import { characterDocumentSchema } from "@dnd/character-model";
import {
  buildCharacter,
  builderClassIds,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  barbarianId,
  wizardId,
  warlockId,
  bardId,
  clericId,
  druidId,
  sorcererId,
  paladinId,
  rangerId,
  monkId,
  spellSelectionCounts,
} from "./character-builder";
import {
  createLevelUpDraft,
  levelUpCharacter,
  levelUpEligibility,
  previewLevelUp,
} from "./character-level-up";
import { abilityScoreImprovementId } from "./ability-score-improvements";
import { asiFeatSelection, featIncreases } from "./advancement-feats";
import { loadWebData } from "./server-data";

const options = { id: "level-eight", now: new Date("2026-10-10T18:00:00Z") };

describe.each(builderClassIds)("%s level-8 progression", (classId) => {
  it("creates a legal level-8 character with source-linked repeated ASI grants", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(classId, catalog, 8, "Level Eight");
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(character.build.levels).toHaveLength(8);
    expect(character.build.featIds.filter((id) => id === abilityScoreImprovementId)).toHaveLength(
      classId === fighterId ? 3 : 2,
    );
    expect(character.build.levels[7]?.featSelections).toHaveLength(1);
    expect(character.build.featAbilityScoreIncreases).toEqual(
      featIncreases(draft.advancementFeats),
    );
    expect(evaluation.values.proficiencyBonus?.value).toBe(3);
    expect(levelUpEligibility(character, catalog)).toMatchObject({
      eligible: [
        fighterId,
        barbarianId,
        wizardId,
        sorcererId,
        clericId,
        druidId,
        bardId,
        warlockId,
        rangerId,
        paladinId,
        monkId,
      ].some((id) => id === classId),
      currentLevel: 8,
    });
    expect(characterDocumentSchema.parse(JSON.parse(JSON.stringify(character)))).toEqual(character);
    const classEntity = rulesPackage.entities.find(({ id }) => id === classId);
    const { progression: rows } = z
      .object({
        progression: z.array(
          z.object({
            level: z.number().int(),
            features: z.array(z.object({ name: z.string(), entityId: z.string().nullable() })),
          }),
        ),
      })
      .parse(classEntity?.body);
    for (const row of rows) {
      for (const feature of row.features.filter(
        ({ name }) => name === "Ability Score Improvement",
      )) {
        expect(feature.entityId, `${classId} level ${String(row.level)}`).not.toBeNull();
        const source = rulesPackage.entities.find(({ id }) => id === feature.entityId);
        expect(source?.source.length).toBeGreaterThan(0);
      }
    }
  });

  it("advances 7→8 preserving acquisitions, inventory, and expended state", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const character = buildCharacter(
      defaultBuilderDraft(classId, catalog, 7, "Advancing Eight"),
      rulesPackage,
      options,
    );
    const previous = evaluateCharacter({ character, packages: [rulesPackage] });
    character.state.currentHitPoints = 11;
    character.state.temporaryHitPoints = 2;
    const resource = previous.resources.find(({ maximum }) => maximum > 0);
    if (resource) character.state.expendedResources[resource.id] = 1;
    const slot = previous.spellcasting?.slots[0];
    if (slot) character.state.expendedSpellSlots[String(slot.level)] = 1;
    const before = structuredClone(character);
    const draft = createLevelUpDraft(character, catalog);
    const asiIndex = catalog.classes[classId].abilityScoreImprovementLevels.indexOf(8);
    draft.advancementFeats[asiIndex] = asiFeatSelection(["dexterity", "constitution"]);
    const next = levelUpCharacter(character, draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(character).toEqual(before);
    expect(next.build.levels.slice(0, 7)).toEqual(before.build.levels);
    expect(next.build.levels[7]?.featSelections).toEqual([
      {
        featId: abilityScoreImprovementId,
        abilityScoreIncreases: { dexterity: 1, constitution: 1 },
      },
    ]);
    expect(next.state).toEqual(before.state);
    expect(next.loadout.inventory).toEqual(before.loadout.inventory);
    expect(next.loadout.equippedItemIds).toEqual(before.loadout.equippedItemIds);
    expect(next.loadout.currency).toEqual(before.loadout.currency);
    expect(evaluation.facts["ability.dexterity.score"]).toBe(
      Number(previous.facts["ability.dexterity.score"]) + 1,
    );
    expect(evaluation.facts["ability.constitution.score"]).toBe(
      Number(previous.facts["ability.constitution.score"]) + 1,
    );
    expect(next.metadata.revision).toBe(before.metadata.revision + 1);
    expect(previewLevelUp(next, draft, rulesPackage, options).issues.length).toBeGreaterThan(0);
  });
});

describe("level-8 class-specific progression data", () => {
  it.each([bardId, clericId, druidId, sorcererId, wizardId] as const)(
    "updates %s full-caster preparation and slots without a new spell tier",
    (classId) => {
      const { rulesPackage } = loadWebData();
      const catalog = characterBuilderCatalog(rulesPackage);
      const draft = defaultBuilderDraft(classId, catalog, 8, "Full Caster Eight");
      const counts = spellSelectionCounts(draft, catalog);
      const spells = catalog.classes[classId].spellcasting?.spells ?? [];
      const selected = spells.find(
        ({ level, id }) => level === 4 && !counts?.alwaysPreparedSpellIds.includes(id),
      );
      if (!selected) throw new Error("Missing eligible fourth-level spell");
      if (classId === wizardId && !draft.learnedSpellIds.includes(selected.id)) {
        const grants = new Set(Object.values(draft.featureChoiceSelections).flat());
        const replace = draft.learnedSpellIds.findIndex(
          (id) =>
            !grants.has(id) &&
            !draft.preparedSpellIds.includes(id) &&
            spells.some((spell) => spell.id === id && spell.level > 0),
        );
        if (replace < 0) throw new Error("Missing ordinary spellbook addition");
        draft.learnedSpellIds[replace] = selected.id;
      }
      draft.preparedSpellIds = [
        selected.id,
        ...draft.preparedSpellIds.filter((id) => id !== selected.id),
      ].slice(0, 12);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(evaluation.spellcasting).toMatchObject({
        preparedSpellLimit: 12,
        slots: [
          { level: 1, maximum: 4 },
          { level: 2, maximum: 3 },
          { level: 3, maximum: 3 },
          { level: 4, maximum: 2 },
        ],
      });
      const spell = evaluation.spells.find(({ level, prepared }) => level === 4 && prepared);
      if (!spell) throw new Error("Missing fourth-level spell");
      expect(
        proposeSpellCast(
          { character, packages: [rulesPackage] },
          { spellId: spell.id, slotLevel: 4 },
        ).applicable,
      ).toBe(true);
      if (classId === wizardId) {
        // Six starting, fourteen ordinary additions, four Savant additions, four cantrips.
        expect(character.build.learnedSpellIds).toHaveLength(28);
        expect(
          character.build.levels[7]?.selectedFeatureChoices.some(({ choiceId }) =>
            choiceId.includes("evocation-savant"),
          ),
        ).toBe(false);
      }
      if (classId === sorcererId)
        expect(
          evaluation.resources.find(({ id }) => id === "srd521.resource.sorcerer.sorcery-points")
            ?.maximum,
        ).toBe(8);
    },
  );

  it.each([paladinId, rangerId] as const)(
    "retains %s half-caster level-7 preparation and slots",
    (classId) => {
      const { rulesPackage } = loadWebData();
      const catalog = characterBuilderCatalog(rulesPackage);
      const character = buildCharacter(
        defaultBuilderDraft(classId, catalog, 8, "Half Caster Eight"),
        rulesPackage,
        options,
      );
      expect(evaluateCharacter({ character, packages: [rulesPackage] }).spellcasting).toMatchObject(
        {
          preparedSpellLimit: 7,
          slots: [
            { level: 1, maximum: 4 },
            { level: 2, maximum: 3 },
          ],
        },
      );
    },
  );

  it("adds a Warlock prepared spell without adding an invocation or refilling Pact slots", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const character = buildCharacter(
      defaultBuilderDraft(warlockId, catalog, 7, "Pact Eight"),
      rulesPackage,
      options,
    );
    character.state.expendedSpellSlots["4"] = 2;
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 9,
      slots: [{ level: 4, maximum: 2, current: 0, expended: 2 }],
    });
    expect(
      next.build.levels
        .flatMap(({ selectedFeatureChoices }) => selectedFeatureChoices)
        .find(({ choiceId }) => choiceId.includes("eldritch-invocation")),
    ).toBeDefined();
    expect(
      next.build.levels[7]?.selectedFeatureChoices.filter(({ choiceId }) =>
        choiceId.includes("eldritch-invocation"),
      ),
    ).toEqual([]);
  });

  it("increases Monk Focus to eight without restoring spent Focus", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const character = buildCharacter(
      defaultBuilderDraft(monkId, catalog, 7, "Focus Eight"),
      rulesPackage,
      options,
    );
    character.state.expendedResources["srd521.resource.monk.focus-points"] = 5;
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(
      evaluateCharacter({ character: next, packages: [rulesPackage] }).resources,
    ).toContainEqual(
      expect.objectContaining({
        id: "srd521.resource.monk.focus-points",
        maximum: 8,
        current: 3,
        expended: 5,
      }),
    );
  });
});
