import { describe, expect, it } from "vitest";

import { evaluateCharacter, proposeAction } from "@dnd/rules-core";

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
  it("advances a Paladin to level 6 with a traced saving-throw aura", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const character = buildCharacter(
      defaultBuilderDraft(paladinId, catalog, 5, "Protective Paladin"),
      rulesPackage,
      initialOptions,
    );
    character.state.currentHitPoints = 10;
    const original = evaluateCharacter({ character, packages: [rulesPackage] });
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      initialOptions,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(advanced.state.currentHitPoints).toBe(10);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(52);
    expect(evaluation.savingThrowAuras?.[0]).toMatchObject({ active: true, bonus: 3 });
    expect(evaluation.d20Tests["savingThrow.dexterity"]?.modifier).toBe(
      (original.d20Tests["savingThrow.dexterity"]?.modifier ?? 0) + 3,
    );
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: false });
  });
  it("advances an Open Hand Monk to level 6 and rolls Wholeness of Body", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const original = buildCharacter(
      defaultBuilderDraft(monkId, catalog, 5, "Healing Monk"),
      rulesPackage,
      initialOptions,
    );
    original.state.currentHitPoints = 10;
    const advanced = levelUpCharacter(
      original,
      createLevelUpDraft(original, catalog),
      rulesPackage,
      initialOptions,
    );
    expect(advanced.state.currentHitPoints).toBe(10);
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(45);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.monk.focus-points")?.maximum,
    ).toBe(6);
    expect(
      evaluation.attacks.find(({ id }) => id === "attack.unarmed-strike")?.damage.alternativeTypes,
    ).toEqual(["force"]);
    const proposal = proposeAction(
      { character: advanced, packages: [rulesPackage] },
      { actionId: "action.wholeness-of-body", rolls: [8] },
    );
    expect(proposal.applicable).toBe(true);
    expect(proposal.nextState.currentHitPoints).toBe(20);
    expect(proposal.nextState.expendedResources["srd521.resource.monk.wholeness-of-body"]).toBe(1);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({ eligible: false });
  });
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
        if (targetLevel === 4) draft.asiAbilities[0] = "dexterity";
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

  it("preserves Elven Lineage choices and unlocks lineage spells by character level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const lineageChoiceId = "srd521.species.elf.choice.elven-lineage";
    const original = buildCharacter(
      updateBuilderSpecies(
        defaultBuilderDraft(fighterId, catalog, 2, "Drow Traveler"),
        catalog,
        "srd521.species.elf",
      ),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-10T15:00:00.000Z"),
    });

    expect(draft.speciesChoiceSelections[lineageChoiceId]).toEqual([
      "srd521.species.elf.lineage.drow",
    ]);
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.spells).toContainEqual(
      expect.objectContaining({ id: "srd521.spell.faerie-fire", prepared: true }),
    );
    expect(preview.evaluation?.resources).toContainEqual(
      expect.objectContaining({ id: "srd521.resource.elf.drow.faerie-fire", current: 1 }),
    );

    draft.speciesChoiceSelections = {
      ...draft.speciesChoiceSelections,
      [lineageChoiceId]: ["srd521.species.elf.lineage.wood"],
    };
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-10T16:00:00.000Z"),
      }).issues,
    ).toContain("Choose an Elven Lineage cannot change during level up.");
  });

  it("preserves a Gnome's lineage and spellcasting ability during level up", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const lineageChoiceId = "srd521.species.gnome.choice.gnomish-lineage";
    const abilityChoiceId = "srd521.species.gnome.choice.spellcasting-ability";
    const original = buildCharacter(
      updateBuilderSpecies(
        defaultBuilderDraft(fighterId, catalog, 1, "Forest Scholar"),
        catalog,
        "srd521.species.gnome",
      ),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(original, catalog);

    expect(draft.speciesChoiceSelections).toMatchObject({
      [lineageChoiceId]: ["srd521.species.gnome.lineage.forest"],
      [abilityChoiceId]: ["srd521.species.gnome.spellcasting-ability.intelligence"],
    });
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-10T17:00:00.000Z"),
      }).issues,
    ).toEqual([]);

    draft.speciesChoiceSelections = {
      ...draft.speciesChoiceSelections,
      [lineageChoiceId]: ["srd521.species.gnome.lineage.rock"],
    };
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-10T18:00:00.000Z"),
      }).issues,
    ).toContain("Choose a Gnomish Lineage cannot change during level up.");
  });

  it("preserves Giant Ancestry and unlocks a Goliath's Large Form at level 5", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const choiceId = "srd521.species.goliath.choice.giant-ancestry";
    const originalDraft = updateBuilderSpecies(
      defaultBuilderDraft(fighterId, catalog, 4, "Stone Guardian"),
      catalog,
      "srd521.species.goliath",
    );
    originalDraft.speciesChoiceSelections = {
      [choiceId]: ["srd521.species.goliath.ancestry.stone"],
    };
    const original = buildCharacter(originalDraft, rulesPackage, initialOptions);
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-10T19:00:00.000Z"),
    });

    expect(draft.speciesChoiceSelections[choiceId]).toEqual([
      "srd521.species.goliath.ancestry.stone",
    ]);
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.actions).toContainEqual(
      expect.objectContaining({ id: "srd521.action.goliath.large-form" }),
    );

    draft.speciesChoiceSelections = {
      [choiceId]: ["srd521.species.goliath.ancestry.cloud"],
    };
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-10T20:00:00.000Z"),
      }).issues,
    ).toContain("Choose a Giant Ancestry cannot change during level up.");
  });

  it("preserves Halfling species traits during level up", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const original = buildCharacter(
      updateBuilderSpecies(
        defaultBuilderDraft(fighterId, catalog, 1, "Lucky Veteran"),
        catalog,
        "srd521.species.halfling",
      ),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-10T21:00:00.000Z"),
    });

    expect(draft.speciesId).toBe("srd521.species.halfling");
    expect(draft.speciesSize).toBe("small");
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.d20Tests.initiative?.rerollValues).toEqual([1]);
    expect(preview.evaluation?.facts["species.hide.obscuredByLargerCreature"]).toBe(true);
  });

  it("preserves Orc traits and scales Adrenaline Rush with proficiency during level up", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const original = buildCharacter(
      updateBuilderSpecies(
        defaultBuilderDraft(fighterId, catalog, 4, "Orc Pathfinder"),
        catalog,
        "srd521.species.orc",
      ),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-10T22:00:00.000Z"),
    });

    expect(draft.speciesId).toBe("srd521.species.orc");
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.resources).toContainEqual(
      expect.objectContaining({ id: "srd521.resource.orc.adrenaline-rush", maximum: 3 }),
    );
    expect(
      preview.evaluation?.actions.find(
        (action) => action.id === "srd521.action.orc.adrenaline-rush",
      )?.parameters?.temporaryHitPoints,
    ).toBe(3);
  });

  it("preserves a Tiefling's legacy and casting ability while unlocking legacy spells", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const legacyChoiceId = "srd521.species.tiefling.choice.fiendish-legacy";
    const abilityChoiceId = "srd521.species.tiefling.choice.spellcasting-ability";
    const originalDraft = updateBuilderSpecies(
      defaultBuilderDraft(fighterId, catalog, 2, "Infernal Wanderer"),
      catalog,
      "srd521.species.tiefling",
    );
    originalDraft.speciesChoiceSelections = {
      [legacyChoiceId]: ["srd521.species.tiefling.legacy.infernal"],
      [abilityChoiceId]: ["srd521.species.tiefling.spellcasting-ability.charisma"],
    };
    const original = buildCharacter(originalDraft, rulesPackage, initialOptions);
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-10T23:00:00.000Z"),
    });

    expect(draft.speciesChoiceSelections).toMatchObject({
      [legacyChoiceId]: ["srd521.species.tiefling.legacy.infernal"],
      [abilityChoiceId]: ["srd521.species.tiefling.spellcasting-ability.charisma"],
    });
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.spells).toContainEqual(
      expect.objectContaining({ id: "srd521.spell.hellish-rebuke", prepared: true }),
    );
    expect(preview.evaluation?.resources).toContainEqual(
      expect.objectContaining({
        id: "srd521.resource.tiefling.hellish-rebuke.free-cast",
        current: 1,
      }),
    );

    draft.speciesChoiceSelections = {
      ...draft.speciesChoiceSelections,
      [legacyChoiceId]: ["srd521.species.tiefling.legacy.abyssal"],
    };
    expect(
      previewLevelUp(original, draft, rulesPackage, {
        id: original.id,
        now: new Date("2026-08-11T00:00:00.000Z"),
      }).issues,
    ).toContain("Choose a Fiendish Legacy cannot change during level up.");
  });

  it("advances a Ranger from level 5 to 6 and unlocks Roving without resetting play state", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const built = buildCharacter(
      defaultBuilderDraft(rangerId, catalog, 5, "Roving Pathfinder"),
      rulesPackage,
      initialOptions,
    );
    const original = {
      ...built,
      state: {
        ...built.state,
        currentHitPoints: 9,
        temporaryHitPoints: 4,
        expendedResources: {
          ...built.state.expendedResources,
          "srd521.resource.ranger.favored-enemy": 2,
        },
        expendedSpellSlots: { "1": 2, "2": 1 },
      },
    };

    expect(levelUpEligibility(original, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 5,
      targetLevel: 6,
      classId: rangerId,
    });

    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-11T01:00:00.000Z"),
    });

    expect(draft.level).toBe(6);
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.values["hitPoints.maximum"]?.value).toBe(52);
    expect(preview.evaluation?.values["speed.walking"]?.value).toBe(40);
    expect(preview.evaluation?.values["speed.climb"]?.value).toBe(40);
    expect(preview.evaluation?.values["speed.swim"]?.value).toBe(40);
    expect(preview.evaluation?.spellcasting).toMatchObject({
      preparedSpellLimit: 6,
      slots: [
        { level: 1, maximum: 4, expended: 2, current: 2 },
        { level: 2, maximum: 2, expended: 1, current: 1 },
      ],
    });

    const advanced = levelUpCharacter(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-11T01:00:00.000Z"),
    });
    expect(advanced.state).toEqual(original.state);
    expect(advanced.build.levels).toHaveLength(6);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 6,
      reason: "Ranger advancement is currently reviewed through level 6.",
    });
  });

  it("advances a Rogue from level 5 to 6 with two additional Expertise selections", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const original = buildCharacter(
      defaultBuilderDraft(rogueId, catalog, 5, "Expert Delver"),
      rulesPackage,
      initialOptions,
    );

    expect(original.build.proficiencyChoices.expertise).toHaveLength(2);
    expect(levelUpEligibility(original, catalog)).toMatchObject({
      eligible: true,
      currentLevel: 5,
      targetLevel: 6,
      classId: rogueId,
    });

    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-12T02:00:00.000Z"),
    });

    expect(draft.level).toBe(6);
    expect(draft.expertiseSkillIds).toHaveLength(4);
    expect(preview.issues).toEqual([]);
    expect(
      Object.values(preview.evaluation?.proficiencies.skills ?? {}).filter(
        (proficiency) => proficiency.level === "expertise",
      ),
    ).toHaveLength(4);

    const advanced = levelUpCharacter(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-12T02:00:00.000Z"),
    });
    expect(advanced.build.proficiencyChoices.expertise).toHaveLength(4);
    expect(advanced.build.levels).toHaveLength(6);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 6,
      reason: "Rogue advancement is currently reviewed through level 6.",
    });
  });

  it("advances a Draconic Sorcerer to level 6 with Elemental Affinity", () => {
    const { fixtures, rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const fixture = fixtures.find((candidate) => candidate.filename === "sorcerer-5.json");
    if (fixture === undefined) throw new Error("Missing sorcerer-5.json.");
    const original = fixture.character;
    let draft = createLevelUpDraft(original, catalog);

    expect(draft.level).toBe(6);
    expect(
      draft.featureChoiceSelections["srd521.choice.sorcerer.draconic.elemental-affinity"],
    ).toEqual(["srd521.option.sorcerer.draconic.elemental-affinity.fire"]);
    draft = updateBuilderFeatureChoice(
      draft,
      catalog,
      "srd521.choice.sorcerer.draconic.elemental-affinity",
      "srd521.option.sorcerer.draconic.elemental-affinity.cold",
    );
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-12T02:30:00.000Z"),
    });

    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.spellcasting).toMatchObject({
      preparedSpellLimit: 10,
      abilityModifier: 3,
    });
    expect(preview.evaluation?.spellcasting?.slots).toContainEqual(
      expect.objectContaining({ level: 3, maximum: 3, current: 2 }),
    );
    expect(preview.evaluation?.resources).toContainEqual(
      expect.objectContaining({
        id: "srd521.resource.sorcerer.sorcery-points",
        maximum: 6,
        current: 4,
      }),
    );
    expect(preview.evaluation?.resistances).toContain("cold");
    expect(
      preview.evaluation?.spells
        .find((spell) => spell.id === "srd521.spell.ray-of-frost")
        ?.damage.find((damage) => damage.type === "cold"),
    ).toMatchObject({ bonus: 3, bonusAppliesToOneRoll: true });

    const advanced = levelUpCharacter(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-12T02:30:00.000Z"),
    });
    expect(advanced.state).toEqual(original.state);
    expect(advanced.build.levels[5]?.selectedFeatureChoices).toEqual([
      {
        choiceId: "srd521.choice.sorcerer.draconic.elemental-affinity",
        optionIds: ["srd521.option.sorcerer.draconic.elemental-affinity.cold"],
      },
    ]);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 6,
      reason: "Sorcerer advancement is currently reviewed through level 6.",
    });
  });

  it("advances a Berserker to level 6 and applies Mindless Rage", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelFive = buildCharacter(
      defaultBuilderDraft(barbarianId, catalog, 5, "Fearless Barbarian"),
      rulesPackage,
      initialOptions,
    );
    const original = {
      ...levelFive,
      state: {
        ...levelFive.state,
        conditionIds: ["srd521.condition.charmed", "srd521.condition.frightened"],
      },
    };
    const draft = createLevelUpDraft(original, catalog);
    const preview = previewLevelUp(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-12T02:45:00.000Z"),
    });

    expect(draft.level).toBe(6);
    expect(preview.issues).toEqual([]);
    expect(preview.evaluation?.facts["condition.charmed.active"]).toBe(true);
    expect(preview.evaluation?.facts["condition.frightened.active"]).toBe(true);

    const advanced = levelUpCharacter(original, draft, rulesPackage, {
      id: original.id,
      now: new Date("2026-08-12T02:45:00.000Z"),
    });
    expect(advanced.state).toEqual(original.state);
    const rage = proposeAction(
      { character: advanced, packages: [rulesPackage] },
      { actionId: "action.enter-rage" },
    );

    expect(rage.applicable).toBe(true);
    expect(rage.nextState.activeEffectIds).toContain("srd521.effect.barbarian.rage");
    expect(rage.nextState.conditionIds).toEqual([]);
    expect(rage.changes.map((change) => change.path)).toContain("state.conditionIds");
    const ragingEvaluation = evaluateCharacter({
      character: { ...advanced, state: rage.nextState },
      packages: [rulesPackage],
    });
    expect(ragingEvaluation.facts["condition.charmed.active"]).toBeUndefined();
    expect(ragingEvaluation.facts["condition.frightened.active"]).toBeUndefined();
    const lingeringConditions = evaluateCharacter({
      character: {
        ...advanced,
        state: {
          ...advanced.state,
          activeEffectIds: ["srd521.effect.barbarian.rage"],
        },
      },
      packages: [rulesPackage],
    });
    expect(lingeringConditions.facts["condition.charmed.active"]).toBeUndefined();
    expect(lingeringConditions.facts["condition.frightened.active"]).toBeUndefined();
    expect(
      lingeringConditions.validations.filter(
        (validation) => validation.code === "CONDITION_BLOCKED_BY_IMMUNITY",
      ),
    ).toHaveLength(2);
    expect(levelUpEligibility(advanced, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 6,
      reason: "Barbarian advancement is currently reviewed through level 6.",
    });
  });

  it("adds Fighter's second Ability Score Improvement at level 6", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelFive = buildCharacter(
      defaultBuilderDraft(fighterId, catalog, 5, "Improving Fighter"),
      rulesPackage,
      initialOptions,
    );
    const draft = createLevelUpDraft(levelFive, catalog);

    expect(draft.level).toBe(6);
    expect(draft.asiAbilities).toEqual(["strength", "strength"]);
    draft.asiAbilities[1] = "dexterity";
    const preview = previewLevelUp(levelFive, draft, rulesPackage, {
      id: levelFive.id,
      now: new Date("2026-08-12T03:00:00.000Z"),
    });

    expect(preview.issues).toEqual([]);
    expect(preview.character?.build.featAbilityScoreIncreases).toEqual({
      strength: 2,
      dexterity: 2,
    });
    expect(
      preview.character?.build.featIds.filter(
        (featId) => featId === "srd521.feat.general.ability-score-improvement",
      ),
    ).toHaveLength(2);
  });

  it("explains unsupported and fully reviewed advancement limits", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelSix = buildCharacter(
      defaultBuilderDraft(fighterId, catalog, 6, "Max Fighter"),
      rulesPackage,
      initialOptions,
    );
    const unsupported = structuredClone(levelSix);
    unsupported.build.levels = unsupported.build.levels.slice(0, 1);
    const firstLevel = unsupported.build.levels[0];
    if (firstLevel === undefined) throw new Error("Expected a first character level.");
    unsupported.build.levels[0] = {
      ...firstLevel,
      classId: "srd521.class.artificer",
    };

    expect(levelUpEligibility(levelSix, catalog)).toMatchObject({
      eligible: false,
      currentLevel: 6,
      reason: "Fighter advancement is currently reviewed through level 6.",
    });
    expect(levelUpEligibility(unsupported, catalog)).toMatchObject({
      eligible: false,
      reason:
        "Level-up support currently covers Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, and Wizard.",
    });
    expect(() => createLevelUpDraft(levelSix, catalog)).toThrow(
      "Fighter advancement is currently reviewed through level 6.",
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
