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
  bardId,
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
  sorcererId,
  spellSelectionCounts,
  updateBuilderBackground,
  updateBuilderFeatureChoice,
  updateBuilderSpecies,
  warlockId,
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
    bardId,
    clericId,
    druidId,
    fighterId,
    monkId,
    paladinId,
    rangerId,
    rogueId,
    sorcererId,
    warlockId,
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
      if (classId === bardId) {
        expect(character.build.proficiencyChoices.expertise).toHaveLength(2);
        expect(character.loadout.preparedSpellIds).toHaveLength(9);
      }
      if (classId === sorcererId) {
        expect(character.build.levels[1]?.selectedFeatureChoices).toEqual([
          {
            choiceId: "srd521.choice.sorcerer.metamagic",
            optionIds: [
              "srd521.option.sorcerer.metamagic.quickened",
              "srd521.option.sorcerer.metamagic.subtle",
            ],
          },
        ]);
        expect(character.loadout.preparedSpellIds).toHaveLength(9);
      }
      if (classId === warlockId) {
        expect(
          character.build.levels.flatMap((level) =>
            level.selectedFeatureChoices.flatMap((choice) => choice.optionIds),
          ),
        ).toHaveLength(5);
        expect(character.loadout.preparedSpellIds).toHaveLength(6);
      }
    },
  );

  it("allows one Sorcerer spell and Metamagic replacement during level up", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const sorcerer = buildCharacter(
      defaultBuilderDraft(sorcererId, catalog, 2, "Changing Sorcerer"),
      rulesPackage,
      initialOptions,
    );
    let draft = createLevelUpDraft(sorcerer, catalog);
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.sorcerer.metamagic",
      "srd521.option.sorcerer.metamagic.quickened",
    );
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.sorcerer.metamagic",
      "srd521.option.sorcerer.metamagic.careful",
    );
    const replacedSpellId = sorcerer.loadout.preparedSpellIds[0];
    if (replacedSpellId === undefined) throw new Error("Expected a prepared Sorcerer spell.");
    const replacementSpell = catalog.classes[sorcererId].spellcasting?.spells.find(
      (spell) =>
        spell.level > 0 &&
        spell.level <= 2 &&
        !draft.preparedSpellIds.includes(spell.id) &&
        !spellSelectionCounts(draft, catalog)?.alwaysPreparedSpellIds.includes(spell.id),
    );
    if (replacementSpell === undefined) throw new Error("Expected a replacement Sorcerer spell.");
    draft.preparedSpellIds = [
      ...draft.preparedSpellIds.filter((spellId) => spellId !== replacedSpellId),
      replacementSpell.id,
    ];

    const preview = previewLevelUp(sorcerer, draft, rulesPackage, {
      id: sorcerer.id,
      now: new Date("2026-08-09T12:00:00.000Z"),
    });

    expect(preview.issues).toEqual([]);
    expect(preview.character?.build.levels[1]?.selectedFeatureChoices).toEqual([
      {
        choiceId: "srd521.choice.sorcerer.metamagic",
        optionIds: [
          "srd521.option.sorcerer.metamagic.subtle",
          "srd521.option.sorcerer.metamagic.careful",
        ],
      },
    ]);
    expect(preview.character?.loadout.preparedSpellIds).toContain(replacementSpell.id);
    expect(preview.character?.loadout.preparedSpellIds).not.toContain(replacedSpellId);
  });

  it("allows one Bard cantrip and prepared-spell replacement during level up", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const bard = buildCharacter(
      defaultBuilderDraft(bardId, catalog, 2, "Changing Bard"),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(bard, catalog);
    const replacedCantripId = bard.build.learnedSpellIds[0];
    const replacedSpellId = bard.loadout.preparedSpellIds[0];
    if (replacedCantripId === undefined || replacedSpellId === undefined) {
      throw new Error("Expected Bard spells to replace.");
    }
    const spellcasting = catalog.classes[bardId].spellcasting;
    const replacementCantrip = spellcasting?.spells.find(
      (spell) => spell.level === 0 && !draft.learnedSpellIds.includes(spell.id),
    );
    const replacementSpell = spellcasting?.spells.find(
      (spell) => spell.level > 0 && spell.level <= 2 && !draft.preparedSpellIds.includes(spell.id),
    );
    if (replacementCantrip === undefined || replacementSpell === undefined) {
      throw new Error("Expected replacement Bard spell options.");
    }
    draft.learnedSpellIds = [
      ...draft.learnedSpellIds.filter((id) => id !== replacedCantripId),
      replacementCantrip.id,
    ];
    draft.preparedSpellIds = [
      ...draft.preparedSpellIds.filter((id) => id !== replacedSpellId),
      replacementSpell.id,
    ];

    const preview = previewLevelUp(bard, draft, rulesPackage, {
      id: bard.id,
      now: new Date("2026-08-09T11:00:00.000Z"),
    });

    expect(preview.issues).toEqual([]);
    expect(preview.character?.build.learnedSpellIds).toContain(replacementCantrip.id);
    expect(preview.character?.build.learnedSpellIds).not.toContain(replacedCantripId);
    expect(preview.character?.loadout.preparedSpellIds).toContain(replacementSpell.id);
    expect(preview.character?.loadout.preparedSpellIds).not.toContain(replacedSpellId);
  });

  it("rejects replacing multiple Sorcerer spells or Metamagic options at one level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const sorcerer = buildCharacter(
      defaultBuilderDraft(sorcererId, catalog, 2, "Overchanging Sorcerer"),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(sorcerer, catalog);
    draft.featureChoiceSelections = {
      ...draft.featureChoiceSelections,
      "srd521.choice.sorcerer.metamagic": [
        "srd521.option.sorcerer.metamagic.careful",
        "srd521.option.sorcerer.metamagic.distant",
      ],
    };
    const alwaysPrepared = new Set(spellSelectionCounts(draft, catalog)?.alwaysPreparedSpellIds);
    const removedSpellIds = sorcerer.loadout.preparedSpellIds
      .filter((spellId) => !alwaysPrepared.has(spellId))
      .slice(0, 2);
    if (removedSpellIds.length !== 2) throw new Error("Expected two removable Sorcerer spells.");
    const replacements = catalog.classes[sorcererId].spellcasting?.spells
      .filter(
        (spell) =>
          spell.level > 0 &&
          spell.level <= 2 &&
          !draft.preparedSpellIds.includes(spell.id) &&
          !spellSelectionCounts(draft, catalog)?.alwaysPreparedSpellIds.includes(spell.id),
      )
      .slice(0, 2);
    if (replacements?.length !== 2) throw new Error("Expected two replacement Sorcerer spells.");
    draft.preparedSpellIds = [
      ...draft.preparedSpellIds.filter((spellId) => !removedSpellIds.includes(spellId)),
      ...replacements.map((spell) => spell.id),
    ];

    const preview = previewLevelUp(sorcerer, draft, rulesPackage, {
      id: sorcerer.id,
      now: new Date("2026-08-09T13:00:00.000Z"),
    });

    expect(preview.issues).toEqual(
      expect.arrayContaining([
        "Replace no more than 1 Sorcerer feature option during level up.",
        "Replace no more than 1 Sorcerer prepared spell during level up.",
      ]),
    );
  });

  it("allows one Warlock invocation, cantrip, and prepared-spell replacement", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const warlock = buildCharacter(
      defaultBuilderDraft(warlockId, catalog, 2, "Changing Warlock"),
      rulesPackage,
      initialOptions,
    );
    let draft = createLevelUpDraft(warlock, catalog);
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.warlock.eldritch-invocation",
      "srd521.option.warlock.invocation.pact-of-the-chain",
    );
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.warlock.eldritch-invocation",
      "srd521.option.warlock.invocation.armor-of-shadows",
    );
    const spellcasting = catalog.classes[warlockId].spellcasting;
    const replacedCantripId = warlock.build.learnedSpellIds[0];
    const replacementCantrip = spellcasting?.spells.find(
      (spell) => spell.level === 0 && !draft.learnedSpellIds.includes(spell.id),
    );
    const replacedSpellId = warlock.loadout.preparedSpellIds[0];
    const replacementSpell = spellcasting?.spells.find(
      (spell) =>
        spell.level > 0 &&
        spell.level <= 2 &&
        !draft.preparedSpellIds.includes(spell.id) &&
        !spellSelectionCounts(draft, catalog)?.alwaysPreparedSpellIds.includes(spell.id),
    );
    if (
      replacedCantripId === undefined ||
      replacementCantrip === undefined ||
      replacedSpellId === undefined ||
      replacementSpell === undefined
    ) {
      throw new Error("Expected Warlock replacement choices.");
    }
    draft.learnedSpellIds = [
      ...draft.learnedSpellIds.filter((spellId) => spellId !== replacedCantripId),
      replacementCantrip.id,
    ];
    draft.preparedSpellIds = [
      ...draft.preparedSpellIds.filter((spellId) => spellId !== replacedSpellId),
      replacementSpell.id,
    ];

    const preview = previewLevelUp(warlock, draft, rulesPackage, {
      id: warlock.id,
      now: new Date("2026-08-09T14:00:00.000Z"),
    });

    expect(preview.issues).toEqual([]);
    expect(preview.character?.build.learnedSpellIds).toContain(replacementCantrip.id);
    expect(preview.character?.build.learnedSpellIds).not.toContain(replacedCantripId);
    expect(preview.character?.loadout.preparedSpellIds).toContain(replacementSpell.id);
    expect(preview.character?.loadout.preparedSpellIds).not.toContain(replacedSpellId);
    expect(
      preview.character?.build.levels.flatMap((level) =>
        level.selectedFeatureChoices.flatMap((choice) => choice.optionIds),
      ),
    ).toEqual(
      expect.arrayContaining([
        "srd521.option.warlock.invocation.armor-of-shadows",
        "srd521.option.warlock.invocation.devil-s-sight",
        "srd521.option.warlock.invocation.fiendish-vigor",
      ]),
    );
  });

  it("rejects replacing multiple Warlock cantrips at one level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const warlock = buildCharacter(
      defaultBuilderDraft(warlockId, catalog, 2, "Overchanging Warlock"),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(warlock, catalog);
    const replacement = catalog.classes[warlockId].spellcasting?.spells.find(
      (spell) => spell.level === 0 && !draft.learnedSpellIds.includes(spell.id),
    );
    if (replacement === undefined) throw new Error("Expected a replacement cantrip.");
    draft.learnedSpellIds = [replacement.id];

    const preview = previewLevelUp(warlock, draft, rulesPackage, {
      id: warlock.id,
      now: new Date("2026-08-09T15:00:00.000Z"),
    });

    expect(preview.issues).toContain("Replace no more than 1 Warlock cantrip during level up.");
  });

  it("allows one Magic Initiate spell replacement per level and fixes its ability", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const featId = "srd521.feat.origin.magic-initiate.cleric";
    const original = buildCharacter(
      updateBuilderBackground(
        defaultBuilderDraft(fighterId, catalog, 1, "Advancing Initiate"),
        catalog,
        "srd521.background.acolyte",
      ),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(original, catalog);
    const definition = catalog.feats[featId]?.magicInitiate;
    const selection = draft.magicInitiateChoices[featId];
    if (definition === undefined || selection === undefined) {
      throw new Error("Expected Magic Initiate choices.");
    }
    const replacement = definition.cantrips.find(
      (spell) => !selection.cantripIds.includes(spell.id),
    );
    if (replacement === undefined) throw new Error("Expected a replacement cantrip.");
    draft.magicInitiateChoices = {
      ...draft.magicInitiateChoices,
      [featId]: {
        ...selection,
        cantripIds: [selection.cantripIds[1] ?? selection.cantripIds[0] ?? "", replacement.id],
      },
    };

    const accepted = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-09T16:00:00.000Z"),
    });
    expect(accepted.issues).toEqual([]);
    expect(accepted.character?.build.choices).toContainEqual({
      choiceId: `${featId}.choice.cantrips`,
      optionIds: draft.magicInitiateChoices[featId]?.cantripIds,
    });

    const invalid = structuredClone(draft);
    invalid.magicInitiateChoices = {
      ...invalid.magicInitiateChoices,
      [featId]: {
        ...selection,
        cantripIds: draft.magicInitiateChoices[featId]?.cantripIds ?? selection.cantripIds,
        ability: selection.ability === "wisdom" ? "charisma" : "wisdom",
        levelOneSpellId:
          definition.levelOneSpells.find((spell) => spell.id !== selection.levelOneSpellId)?.id ??
          selection.levelOneSpellId,
      },
    };
    const rejected = previewLevelUp(original, invalid, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-09T17:00:00.000Z"),
    });
    expect(rejected.issues).toEqual(
      expect.arrayContaining([
        "Magic Initiate (Cleric) cannot change its spellcasting ability.",
        "Replace no more than 1 Magic Initiate (Cleric) spell during level up.",
      ]),
    );
  });

  it("advances a Dwarf without requiring a Human species feat", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const original = buildCharacter(
      updateBuilderSpecies(
        defaultBuilderDraft(fighterId, catalog, 1, "Dwarf Veteran"),
        catalog,
        "srd521.species.dwarf",
      ),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-10T12:00:00.000Z"),
    });

    expect(draft.originFeatId).toBe("");
    expect(preview.issues).toEqual([]);
    expect(preview.character?.build.speciesId).toBe("srd521.species.dwarf");
    expect(preview.evaluation?.facts["hitPoints.maximum"]).toBe(
      Number(
        evaluateCharacter({ character: original, packages: [rulesPackage] }).facts[
          "hitPoints.maximum"
        ],
      ) + 9,
    );
  });

  it("preserves a Dragonborn's Draconic Ancestry during level up", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const choiceId = "srd521.species.dragonborn.choice.draconic-ancestry";
    const greenId = "srd521.species.dragonborn.ancestry.green";
    const redId = "srd521.species.dragonborn.ancestry.red";
    const originalDraft = updateBuilderSpecies(
      defaultBuilderDraft(fighterId, catalog, 1, "Green Dragonborn"),
      catalog,
      "srd521.species.dragonborn",
    );
    originalDraft.speciesChoiceSelections = { [choiceId]: [greenId] };
    const original = buildCharacter(originalDraft, rulesPackage, initialOptions);
    const draft = createLevelUpDraft(original, catalog);

    expect(draft.speciesChoiceSelections).toEqual({ [choiceId]: [greenId] });
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-10T13:00:00.000Z"),
      }).issues,
    ).toEqual([]);

    draft.speciesChoiceSelections = { [choiceId]: [redId] };
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-10T14:00:00.000Z"),
      }).issues,
    ).toContain("Choose a Draconic Ancestor cannot change during level up.");
  });

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
      classId: "srd521.class.artificer",
    };

    expect(levelUpEligibility(levelFive, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 5,
      reason: "Fighter advancement is currently reviewed through level 5.",
    });
    expect(levelUpEligibility(unsupported, catalog)).toMatchObject({
      eligible: false,
      reason:
        "Level-up support currently covers Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard.",
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
