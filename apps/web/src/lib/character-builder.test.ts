import { describe, expect, it } from "vitest";

import { evaluateCharacter, proposeRest, proposeSpellCast } from "@dnd/rules-core";

import {
  barbarianId,
  bardId,
  buildCharacter,
  builderClassIds,
  builderOriginChoiceDefinitions,
  characterBuilderCatalog,
  clericId,
  defaultBuilderDraft,
  druidId,
  fighterId,
  expertiseSkillCandidates,
  expertiseCount,
  monkId,
  paladinId,
  rangerId,
  rogueId,
  sorcererId,
  spellSelectionCounts,
  updateBuilderBackground,
  updateBuilderFeatureChoice,
  updateBuilderLevel,
  validateBuilderDraft,
  warlockId,
  wizardId,
} from "./character-builder";
import { loadWebData } from "./server-data";

const options = { id: "builder-test-character", now: new Date("2026-08-02T12:00:00.000Z") };

describe("guided character builder", () => {
  it("derives class, skill, mastery, and spell choices from the loaded content package", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);

    expect(catalog.classes[fighterId].name).toBe("Fighter");
    expect(catalog.classes[monkId]).toMatchObject({
      name: "Monk",
      subclassId: "srd521.subclass.monk.warrior-of-the-open-hand",
      subclassLevel: 3,
      skillCountByLevel: { 1: 2, 3: 2, 5: 2 },
    });
    expect(catalog.classes[monkId].description).toContain("Focus Points");
    expect(catalog.classes[paladinId]).toMatchObject({
      name: "Paladin",
      subclassId: "srd521.subclass.paladin.oath-of-devotion",
      subclassLevel: 3,
      spellcasting: { preparation: "full-list", ability: "charisma" },
      skillCountByLevel: { 1: 2, 3: 2, 5: 2 },
    });
    expect(catalog.classes[paladinId].featureChoices).toEqual([
      expect.objectContaining({
        id: "srd521.choice.paladin.fighting-style",
        level: 2,
        options: [
          expect.objectContaining({
            id: "srd521.feat.fighting-style.defense",
            grantedFeatId: "srd521.feat.fighting-style.defense",
          }),
        ],
      }),
    ]);
    expect(catalog.classes[paladinId].spellcasting?.countsByLevel[5]).toEqual({
      cantrips: 0,
      learnedLeveledSpells: 0,
      preparedSpells: 6,
      maximumSpellLevel: 2,
      alwaysPreparedSpellIds: [
        "srd521.spell.divine-smite",
        "srd521.spell.find-steed",
        "srd521.spell.protection-from-evil-and-good",
        "srd521.spell.shield-of-faith",
        "srd521.spell.aid",
        "srd521.spell.zone-of-truth",
      ],
    });
    expect(catalog.classes[rangerId]).toMatchObject({
      name: "Ranger",
      subclassId: "srd521.subclass.ranger.hunter",
      subclassLevel: 3,
      spellcasting: { preparation: "full-list", ability: "wisdom" },
      skillCountByLevel: { 1: 3, 3: 3, 5: 3 },
    });
    expect(
      catalog.classes[rangerId].featureChoices.map((choice) => [choice.id, choice.level]),
    ).toEqual([
      ["srd521.choice.ranger.fighting-style", 2],
      ["srd521.choice.ranger.hunters-prey", 3],
    ]);
    expect(catalog.classes[rangerId].featureChoices[1]?.changeOn).toEqual([
      "short-rest",
      "long-rest",
    ]);
    expect(catalog.classes[rangerId].featureChoices[1]?.options).toEqual([
      expect.objectContaining({
        id: "srd521.option.ranger.hunters-prey.colossus-slayer",
        description: "1d8 extra damage · Once Per Turn",
      }),
      expect.objectContaining({
        id: "srd521.option.ranger.hunters-prey.horde-breaker",
        description: "+1 attack · Once Per Turn",
      }),
    ]);
    expect(catalog.classes[rogueId]).toMatchObject({
      name: "Rogue",
      subclassId: "srd521.subclass.rogue.thief",
      subclassLevel: 3,
      skillCountByLevel: { 1: 4, 3: 4, 5: 4 },
    });
    expect(catalog.classes[rogueId].weaponMasteryIds).toEqual(
      expect.arrayContaining([
        "srd521.equipment.weapon.dagger",
        "srd521.equipment.weapon.shortbow",
        "srd521.equipment.weapon.shortsword",
        "srd521.equipment.weapon.scimitar",
      ]),
    );
    expect(catalog.classes[rogueId].weaponMasteryIds).not.toContain(
      "srd521.equipment.weapon.longbow",
    );
    expect(catalog.classes[sorcererId]).toMatchObject({
      name: "Sorcerer",
      subclassId: "srd521.subclass.sorcerer.draconic-sorcery",
      subclassLevel: 3,
      spellcasting: {
        preparation: "full-list",
        preparationChange: { event: "level-up", replacementMaximum: 1 },
        ability: "charisma",
      },
      skillCountByLevel: { 1: 2, 3: 2, 5: 2 },
    });
    expect(catalog.classes[sorcererId].featureChoices).toEqual([
      expect.objectContaining({
        id: "srd521.choice.sorcerer.metamagic",
        level: 2,
        minimum: 2,
        maximum: 2,
        defaultOptionIds: [
          "srd521.option.sorcerer.metamagic.quickened",
          "srd521.option.sorcerer.metamagic.subtle",
        ],
      }),
    ]);
    expect(
      catalog.classes[sorcererId].featureChoices[0]?.options.find(
        (option) => option.id === "srd521.option.sorcerer.metamagic.quickened",
      )?.description,
    ).toContain("Bonus Action");
    expect(catalog.classes[warlockId]).toMatchObject({
      name: "Warlock",
      subclassId: "srd521.subclass.warlock.fiend-patron",
      subclassLevel: 3,
      spellcasting: {
        preparation: "full-list",
        preparationChange: { event: "level-up", replacementMaximum: 1 },
        cantripChange: { event: "level-up", replacementMaximum: 1 },
        ability: "charisma",
      },
      skillCountByLevel: { 1: 2, 3: 2, 5: 2 },
    });
    expect(catalog.classes[warlockId].featureChoices[0]).toMatchObject({
      id: "srd521.choice.warlock.eldritch-invocation",
      level: 1,
      minimum: 1,
      maximum: 5,
      countByLevel: { 1: 1, 2: 3, 3: 3, 4: 3, 5: 5 },
    });
    expect(
      catalog.classes[warlockId].featureChoices[0]?.options.find(
        (option) => option.id === "srd521.option.warlock.invocation.thirsting-blade",
      ),
    ).toMatchObject({
      minimumClassLevel: 5,
      prerequisiteOptionIds: ["srd521.option.warlock.invocation.pact-of-the-blade"],
    });
    expect(catalog.classes[wizardId].name).toBe("Wizard");
    expect(catalog.classes[barbarianId]).toMatchObject({
      name: "Barbarian",
      subclassId: "srd521.subclass.barbarian.path-of-the-berserker",
      subclassLevel: 3,
      skillCountByLevel: { 1: 2, 3: 3, 5: 3 },
    });
    expect(catalog.classes[barbarianId].weaponMasteryIds).toContain(
      "srd521.equipment.weapon.greataxe",
    );
    expect(catalog.classes[barbarianId].weaponMasteryIds).not.toContain(
      "srd521.equipment.weapon.longbow",
    );
    expect(catalog.classes[bardId]).toMatchObject({
      name: "Bard",
      subclassId: "srd521.subclass.bard.college-of-lore",
      subclassLevel: 3,
      spellcasting: {
        preparation: "full-list",
        preparationChange: { event: "level-up", replacementMaximum: 1 },
        cantripChange: { event: "level-up", replacementMaximum: 1 },
        ability: "charisma",
      },
      skillCountByLevel: { 1: 3, 3: 6, 5: 6 },
      builder: {
        expertiseChoice: { countByLevel: { 2: 2, 3: 2, 4: 2, 5: 2 } },
      },
    });
    expect(catalog.classes[clericId]).toMatchObject({
      name: "Cleric",
      subclassId: "srd521.subclass.cleric.life-domain",
      subclassLevel: 3,
      spellcasting: { preparation: "full-list", ability: "wisdom" },
    });
    expect(catalog.classes[clericId].featureChoices[0]).toMatchObject({
      id: "srd521.choice.cleric.divine-order",
      level: 1,
      options: [
        expect.objectContaining({
          id: "srd521.option.cleric.divine-order.protector",
          additionalCantrips: 0,
        }),
        expect.objectContaining({
          id: "srd521.option.cleric.divine-order.thaumaturge",
          additionalCantrips: 1,
        }),
      ],
    });
    expect(catalog.classes[druidId]).toMatchObject({
      name: "Druid",
      subclassId: "srd521.subclass.druid.circle-of-the-land",
      subclassLevel: 3,
      spellcasting: { preparation: "full-list", ability: "wisdom" },
    });
    const druidChoices = catalog.classes[druidId].featureChoices;
    expect(druidChoices.map((choice) => [choice.id, choice.level])).toEqual([
      ["srd521.choice.druid.primal-order", 1],
      ["srd521.choice.druid.circle-of-land", 3],
    ]);
    expect(
      druidChoices[0]?.options.map((option) => [option.id, option.additionalCantrips]),
    ).toEqual([
      ["srd521.option.druid.primal-order.magician", 1],
      ["srd521.option.druid.primal-order.warden", 0],
    ]);
    const arid = druidChoices[1]?.options.find(
      (option) => option.id === "srd521.option.druid.land.arid",
    );
    expect(arid?.alwaysPreparedSpellsByLevel["3"]).toContain("srd521.spell.burning-hands");
    expect(arid?.alwaysPreparedSpellsByLevel["5"]).toEqual(["srd521.spell.fireball"]);
    expect(catalog.classes[fighterId].skillIds).toContain("srd521.skill.perception");
    expect(catalog.classes[wizardId].skillIds).toContain("srd521.skill.arcana");
    expect(catalog.backgrounds["srd521.background.soldier"]?.skillIds).toEqual([
      "srd521.skill.athletics",
      "srd521.skill.intimidation",
    ]);
    expect(Object.keys(catalog.backgrounds)).toHaveLength(4);
    expect(catalog.backgrounds["srd521.background.acolyte"]?.skillIds).toEqual([
      "srd521.skill.insight",
      "srd521.skill.religion",
    ]);
    expect(catalog.backgrounds["srd521.background.criminal"]?.featId).toBe(
      "srd521.feat.origin.alert",
    );
    expect(catalog.backgrounds["srd521.background.sage"]?.abilityIds).toEqual([
      "constitution",
      "intelligence",
      "wisdom",
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
    expect(choice("backgroundId")?.options.map((option) => option.label)).toEqual([
      "Acolyte",
      "Criminal",
      "Sage",
      "Soldier",
    ]);
    expect(choice("backgroundAbilityScoreIncreases")?.options).toHaveLength(7);
    expect(choice("originFeatId")?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "srd521.feat.origin.skilled" }),
        expect.objectContaining({ id: "srd521.feat.origin.alert" }),
        expect.objectContaining({ id: "srd521.feat.origin.magic-initiate.cleric" }),
        expect.objectContaining({ id: "srd521.feat.origin.magic-initiate.druid" }),
        expect.objectContaining({ id: "srd521.feat.origin.magic-initiate.wizard" }),
        expect.objectContaining({
          id: "srd521.feat.origin.savage-attacker",
          disabledReason: "Already granted by Soldier.",
        }),
      ]),
    );
  });

  it("switches backgrounds while reconciling dependent skills and Alert", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const initial = defaultBuilderDraft(rogueId, catalog, 1, "Alert Criminal");
    const draft = updateBuilderBackground(initial, catalog, "srd521.background.criminal");
    const selectedSkills = [
      ...draft.classSkillIds,
      ...draft.speciesSkillIds,
      ...draft.originFeatSkillIds,
      ...(catalog.backgrounds[draft.backgroundId]?.skillIds ?? []),
    ];
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const dexterityModifier = evaluation.values["ability.dexterity.modifier"]?.value ?? 0;

    expect(draft.backgroundId).toBe("srd521.background.criminal");
    expect(
      Object.keys(draft.backgroundAbilityScoreIncreases).every((ability) =>
        ["dexterity", "constitution", "intelligence"].includes(ability),
      ),
    ).toBe(true);
    expect(new Set(selectedSkills).size).toBe(selectedSkills.length);
    expect(character.build.featIds).toContain("srd521.feat.origin.alert");
    expect(evaluation.proficiencies.skills["sleight-of-hand"]?.level).toBe("proficient");
    expect(evaluation.proficiencies.skills.stealth?.level).toBe("proficient");
    expect(evaluation.d20Tests.initiative?.modifier).toBe(dexterityModifier + 2);
    expect(evaluation.validations).toEqual([]);
  });

  it("builds every supported class with each SRD background", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);

    for (const classId of builderClassIds) {
      for (const backgroundId of Object.keys(catalog.backgrounds)) {
        const draft = updateBuilderBackground(
          defaultBuilderDraft(classId, catalog, 1, "Background matrix hero"),
          catalog,
          backgroundId,
        );
        const character = buildCharacter(draft, rulesPackage, options);
        const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

        expect(validateBuilderDraft(draft, catalog), `${classId} / ${backgroundId}`).toEqual([]);
        expect(evaluation.validations, `${classId} / ${backgroundId}`).toEqual([]);
      }
    }
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

    const fighterEntityIds = fighterCharacter.loadout.inventory.map((item) => item.entityId);
    expect(fighterEntityIds).toEqual(
      expect.arrayContaining([
        "srd521.equipment.armor.heavy.chain-mail",
        "srd521.equipment.weapon.greatsword",
        "srd521.equipment.weapon.flail",
        "srd521.equipment.gear.dungeoneers-pack",
      ]),
    );
    expect(fighterEntityIds.filter((id) => id === "srd521.equipment.weapon.javelin")).toHaveLength(
      8,
    );
    expect(fighterEntityIds).not.toContain("srd521.equipment.weapon.longbow");
    expect(fighterCharacter.loadout.equippedItemIds).toEqual(["chain-mail-1", "greatsword-1"]);
    expect(fighterCharacter.loadout.currency.gp).toBe(4);
    expect(fighterCharacter.loadout.choices).toEqual([
      {
        choiceId: "srd521.choice.class.fighter.starting-equipment",
        optionIds: ["srd521.option.class.fighter.starting-equipment.a"],
      },
    ]);
    expect(wizardCharacter.loadout.inventory.map((item) => item.entityId)).toEqual([
      "srd521.equipment.weapon.dagger",
      "srd521.equipment.weapon.dagger",
      "srd521.equipment.weapon.quarterstaff",
      "srd521.equipment.gear.robe",
      "srd521.equipment.gear.spellbook",
      "srd521.equipment.gear.scholars-pack",
    ]);
    expect(wizardCharacter.loadout.inventory.slice(0, 2).map((item) => item.id)).toEqual([
      "dagger-1",
      "dagger-2",
    ]);
    expect(wizardCharacter.loadout.equippedItemIds).toEqual(["quarterstaff-1"]);
    expect(wizardCharacter.loadout.currency.gp).toBe(5);
  });

  it("supports gold-only equipment alternatives without class-specific assembly", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(fighterId, catalog, 1, "Gold Fighter");
    draft.startingEquipmentOptionId = "srd521.option.class.fighter.starting-equipment.c";

    const character = buildCharacter(draft, rulesPackage, options);

    expect(character.loadout.inventory).toEqual([]);
    expect(character.loadout.equippedItemIds).toEqual([]);
    expect(character.loadout.currency.gp).toBe(155);
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

  it("builds Path of the Berserker Barbarians at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [14, 23, 32, 41, 50];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(
        barbarianId,
        catalog,
        level,
        `Level ${String(level)} Barbarian`,
      );
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

      expect(
        evaluation.validations.filter((validation) => validation.severity === "error"),
        `level ${String(level)}`,
      ).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.proficiencyChoices.skills).toHaveLength(level >= 3 ? 7 : 6);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.barbarian.path-of-the-berserker" : undefined,
      );
      expect(evaluation.values["speed.walking"]?.value).toBe(level >= 5 ? 40 : 30);
      expect(evaluation.values["attackAction.attacks"]?.value).toBe(level >= 5 ? 2 : 1);
    }
  });

  it("builds Life Domain Clerics with prepared divine magic at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [10, 17, 24, 31, 38];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(clericId, catalog, level, `Level ${String(level)} Cleric`);
      const counts = spellSelectionCounts(draft, catalog);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.learnedSpellIds).toHaveLength(counts?.cantrips ?? 0);
      expect(character.loadout.preparedSpellIds).toHaveLength(counts?.preparedSpells ?? 0);
      expect(character.build.levels[0]?.selectedFeatureChoices).toEqual([
        {
          choiceId: "srd521.choice.cleric.divine-order",
          optionIds: ["srd521.option.cleric.divine-order.protector"],
        },
      ]);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.cleric.life-domain" : undefined,
      );
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(5);
        expect(character.loadout.equippedItemIds).toHaveLength(3);
        expect(character.loadout.currency.gp).toBe(7);
      }
    }
  });

  it("reconciles Thaumaturge's additional cantrip from structured option effects", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const protector = defaultBuilderDraft(clericId, catalog, 1, "Protector Cleric");
    const thaumaturge = updateBuilderFeatureChoice(
      protector,
      catalog,
      "srd521.choice.cleric.divine-order",
      "srd521.option.cleric.divine-order.thaumaturge",
    );
    const character = buildCharacter(thaumaturge, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

    expect(protector.learnedSpellIds).toHaveLength(3);
    expect(thaumaturge.learnedSpellIds).toHaveLength(4);
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.cantripsKnown).toBe(4);
    expect(character.build.levels[0]?.selectedFeatureChoices[0]?.optionIds).toEqual([
      "srd521.option.cleric.divine-order.thaumaturge",
    ]);
  });

  it("builds Circle of the Land Druids with prepared primal magic at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [10, 17, 24, 31, 38];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(druidId, catalog, level, `Level ${String(level)} Druid`);
      const counts = spellSelectionCounts(draft, catalog);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.learnedSpellIds).toHaveLength(counts?.cantrips ?? 0);
      expect(character.loadout.preparedSpellIds).toHaveLength(counts?.preparedSpells ?? 0);
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(
        level >= 5 ? 5 : level >= 3 ? 4 : 1,
      );
      expect(character.build.levels[0]?.selectedFeatureChoices).toEqual([
        {
          choiceId: "srd521.choice.druid.primal-order",
          optionIds: ["srd521.option.druid.primal-order.magician"],
        },
      ]);
      expect(character.build.levels[2]?.selectedFeatureChoices).toEqual(
        level >= 3
          ? [
              {
                choiceId: "srd521.choice.druid.circle-of-land",
                optionIds: ["srd521.option.druid.land.arid"],
              },
            ]
          : undefined,
      );
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.druid.circle-of-the-land" : undefined,
      );
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(5);
        expect(character.loadout.equippedItemIds).toHaveLength(3);
        expect(character.loadout.currency.gp).toBe(9);
      }
    }
  });

  it("builds Open Hand Monks with Martial Arts and Focus at every supported level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [10, 17, 24, 31, 38];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(monkId, catalog, level, `Level ${String(level)} Monk`);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const focus = evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.monk.focus-points",
      );
      const spear = evaluation.attacks.find((attack) => attack.id === "attack.spear-1");

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.monk.warrior-of-the-open-hand" : undefined,
      );
      expect(evaluation.values["speed.walking"]?.value).toBe(level >= 2 ? 40 : 30);
      expect(evaluation.values["attackAction.attacks"]?.value).toBe(level >= 5 ? 2 : 1);
      expect(spear?.damage).toMatchObject({ diceCount: 1, diceSize: level >= 5 ? 8 : 6 });
      expect(focus?.maximum).toBe(level >= 2 ? level : undefined);
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(7);
        expect(character.loadout.equippedItemIds).toEqual(["spear-1"]);
        expect(character.loadout.currency.gp).toBe(11);
      }
    }
  });

  it("builds Oath of Devotion Paladins with level-gated Fighting Style and magic", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [12, 20, 28, 36, 44];
    const expectedAlwaysPrepared = [0, 1, 3, 3, 6];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(
        paladinId,
        catalog,
        level,
        `Level ${String(level)} Paladin`,
      );
      const counts = spellSelectionCounts(draft, catalog);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const layOnHands = evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.paladin.lay-on-hands",
      );
      const channelDivinity = evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.paladin.channel-divinity",
      );

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.learnedSpellIds).toEqual([]);
      expect(character.loadout.preparedSpellIds).toHaveLength(counts?.preparedSpells ?? 0);
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(expectedAlwaysPrepared[level - 1]);
      expect(character.build.featIds.includes("srd521.feat.fighting-style.defense")).toBe(
        level >= 2,
      );
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.paladin.oath-of-devotion" : undefined,
      );
      expect(character.loadout.selectedWeaponMasteryIds).toEqual([
        "srd521.equipment.weapon.longsword",
        "srd521.equipment.weapon.javelin",
      ]);
      expect(layOnHands?.maximum).toBe(level * 5);
      expect(channelDivinity?.maximum).toBe(level >= 3 ? 2 : undefined);
      expect(evaluation.values.armorClass?.value).toBe(level >= 2 ? 19 : 18);
      expect(evaluation.values["attackAction.attacks"]?.value).toBe(level >= 5 ? 2 : 1);
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(11);
        expect(character.loadout.equippedItemIds).toEqual([
          "chain-mail-1",
          "shield-1",
          "longsword-1",
        ]);
        expect(character.loadout.currency.gp).toBe(9);
      }
    }
  });

  it("builds Hunters with Expertise, Favored Enemy, and prepared magic through level 5", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [12, 20, 28, 36, 44];
    const expectedFavoredEnemy = [2, 2, 2, 2, 3];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(rangerId, catalog, level, `Level ${String(level)} Ranger`);
      const counts = spellSelectionCounts(draft, catalog);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const favoredEnemy = evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.ranger.favored-enemy",
      );

      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.learnedSpellIds).toEqual([]);
      expect(character.loadout.preparedSpellIds).toHaveLength(counts?.preparedSpells ?? 0);
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(1);
      expect(character.build.featIds.includes("srd521.feat.fighting-style.defense")).toBe(
        level >= 2,
      );
      expect(character.build.proficiencyChoices.expertise).toHaveLength(level >= 2 ? 1 : 0);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.ranger.hunter" : undefined,
      );
      expect(character.build.levels[2]?.selectedFeatureChoices).toEqual(
        level >= 3
          ? [
              {
                choiceId: "srd521.choice.ranger.hunters-prey",
                optionIds: ["srd521.option.ranger.hunters-prey.colossus-slayer"],
              },
            ]
          : undefined,
      );
      expect(character.loadout.selectedWeaponMasteryIds).toEqual([
        "srd521.equipment.weapon.scimitar",
        "srd521.equipment.weapon.shortsword",
      ]);
      expect(favoredEnemy?.maximum).toBe(expectedFavoredEnemy[level - 1]);
      expect(evaluation.values["attackAction.attacks"]?.value).toBe(level >= 5 ? 2 : 1);
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(7);
        expect(character.loadout.equippedItemIds).toEqual([
          "studded-leather-armor-1",
          "shortsword-1",
          "longbow-1",
        ]);
        expect(character.loadout.currency.gp).toBe(7);
      }
    }
  });

  it("allows Deft Explorer Expertise in any existing proficient skill", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(rangerId, catalog, 2, "Broad Expertise Ranger");

    expect(expertiseSkillCandidates(draft, catalog)).toContain("srd521.skill.athletics");
    draft.expertiseSkillIds = ["srd521.skill.athletics"];
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

    expect(evaluation.validations).toEqual([]);
    expect(character.build.proficiencyChoices.expertise).toEqual([
      {
        sourceId: "srd521.class-feature.ranger.deft-explorer",
        skillId: "srd521.skill.athletics",
      },
    ]);
  });

  it("builds Thief Rogues with two Expertise skills and reviewed features through level 5", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [10, 17, 24, 31, 38];
    const expectedSneakAttackDice = [1, 1, 2, 2, 3];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(rogueId, catalog, level, `Level ${String(level)} Rogue`);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const sneakAttack = evaluation.actions.find((action) => action.id === "action.sneak-attack");

      expect(validateBuilderDraft(draft, catalog), `draft level ${String(level)}`).toEqual([]);
      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(character.build.proficiencyChoices.expertise).toHaveLength(2);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.rogue.thief" : undefined,
      );
      expect(character.loadout.selectedWeaponMasteryIds).toEqual([
        "srd521.equipment.weapon.dagger",
        "srd521.equipment.weapon.shortsword",
      ]);
      expect(sneakAttack?.parameters).toMatchObject({
        extraDamage: { diceCount: expectedSneakAttackDice[level - 1], diceSize: 6 },
      });
      expect(evaluation.values["speed.climb"]?.value).toBe(level >= 3 ? 30 : undefined);
      expect(evaluation.actions.some((action) => action.id === "action.cunning-strike.trip")).toBe(
        level >= 5,
      );
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(8);
        expect(character.loadout.equippedItemIds).toEqual([
          "leather-armor-1",
          "shortsword-1",
          "shortbow-1",
        ]);
        expect(character.loadout.currency.gp).toBe(8);
      }
    }
  });

  it("supports Rogue Expertise in any two existing proficient skills", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = defaultBuilderDraft(rogueId, catalog, 1, "Broad Expertise Rogue");

    expect(expertiseCount(draft, catalog)).toBe(2);
    expect(expertiseSkillCandidates(draft, catalog)).toContain("srd521.skill.athletics");
    draft.expertiseSkillIds = ["srd521.skill.athletics", "srd521.skill.acrobatics"];
    const character = buildCharacter(draft, rulesPackage, options);

    expect(character.build.proficiencyChoices.expertise).toEqual([
      {
        sourceId: "srd521.class-feature.rogue.expertise",
        skillId: "srd521.skill.athletics",
      },
      {
        sourceId: "srd521.class-feature.rogue.expertise",
        skillId: "srd521.skill.acrobatics",
      },
    ]);
  });

  it("builds Draconic Sorcerers with Metamagic and prepared spells through level 5", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [8, 14, 23, 30, 37];
    const expectedArmorClass = [12, 12, 14, 15, 15];
    const expectedCantrips = [4, 4, 4, 5, 5];
    const expectedPrepared = [2, 4, 6, 7, 9];
    const expectedAlwaysPrepared = [0, 0, 4, 4, 6];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(
        sorcererId,
        catalog,
        level,
        `Level ${String(level)} Sorcerer`,
      );
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const sorceryPoints = evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.sorcerer.sorcery-points",
      );

      expect(validateBuilderDraft(draft, catalog), `draft level ${String(level)}`).toEqual([]);
      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(evaluation.values.armorClass?.value).toBe(expectedArmorClass[level - 1]);
      expect(character.build.learnedSpellIds).toHaveLength(expectedCantrips[level - 1] ?? 0);
      expect(character.loadout.preparedSpellIds).toHaveLength(expectedPrepared[level - 1] ?? 0);
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(expectedAlwaysPrepared[level - 1]);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.sorcerer.draconic-sorcery" : undefined,
      );
      expect(sorceryPoints?.maximum).toBe(level >= 2 ? level : undefined);
      expect(evaluation.actions.some((action) => action.id === "action.innate-sorcery")).toBe(true);
      expect(evaluation.actions.some((action) => action.id === "action.metamagic.quickened")).toBe(
        level >= 2,
      );
      expect(
        evaluation.actions.some((action) => action.id === "action.sorcerous-restoration"),
      ).toBe(level >= 5);
      if (level >= 2) {
        expect(character.build.levels[1]?.selectedFeatureChoices).toEqual([
          {
            choiceId: "srd521.choice.sorcerer.metamagic",
            optionIds: [
              "srd521.option.sorcerer.metamagic.quickened",
              "srd521.option.sorcerer.metamagic.subtle",
            ],
          },
        ]);
      }
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(5);
        expect(character.loadout.equippedItemIds).toEqual(["spear-1"]);
        expect(character.loadout.currency.gp).toBe(28);
      }
    }
  });

  it("builds College of Lore Bards with Expertise and prepared spells through level 5", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [10, 17, 24, 31, 38];
    const expectedCantrips = [2, 2, 2, 3, 3];
    const expectedPrepared = [4, 5, 6, 7, 9];
    const expectedSkills = [3, 3, 6, 6, 6];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(bardId, catalog, level, `Level ${String(level)} Bard`);
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const inspiration = evaluation.resources.find(
        (resource) => resource.id === "srd521.resource.bard.bardic-inspiration",
      );
      const inspirationAction = evaluation.actions.find(
        (action) => action.id === "action.bardic-inspiration",
      );

      expect(validateBuilderDraft(draft, catalog), `draft level ${String(level)}`).toEqual([]);
      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(evaluation.values.armorClass?.value).toBe(13);
      expect(draft.classSkillIds).toHaveLength(expectedSkills[level - 1] ?? 0);
      expect(draft.expertiseSkillIds).toHaveLength(level >= 2 ? 2 : 0);
      expect(character.build.learnedSpellIds).toHaveLength(expectedCantrips[level - 1] ?? 0);
      expect(character.loadout.preparedSpellIds).toHaveLength(expectedPrepared[level - 1] ?? 0);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.bard.college-of-lore" : undefined,
      );
      expect(inspiration?.maximum).toBe(level >= 4 ? 3 : 2);
      expect(inspirationAction).toMatchObject({
        parameters: {
          checkBonus: {
            diceCount: 1,
            diceSize: level >= 5 ? 8 : 6,
            mode: "add",
          },
        },
      });
      expect(evaluation.actions.some((action) => action.id === "action.cutting-words")).toBe(
        level >= 3,
      );
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(4);
        expect(character.loadout.equippedItemIds).toEqual(["leather-armor-1", "dagger-1"]);
        expect(character.loadout.currency.gp).toBe(19);
      }
    }
  });

  it("builds Fiend Warlocks with Pact Magic and level-legal invocations through level 5", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const expectedHitPoints = [10, 17, 24, 31, 38];
    const expectedCantrips = [2, 2, 2, 3, 3];
    const expectedPrepared = [2, 3, 4, 5, 6];
    const expectedAlwaysPrepared = [0, 0, 4, 4, 6];
    const expectedInvocations = [1, 3, 3, 3, 5];

    for (let level = 1; level <= 5; level += 1) {
      const draft = defaultBuilderDraft(
        warlockId,
        catalog,
        level,
        `Level ${String(level)} Warlock`,
      );
      const character = buildCharacter(draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      const invocations = character.build.levels.flatMap((entry) =>
        entry.selectedFeatureChoices
          .filter((choice) => choice.choiceId === "srd521.choice.warlock.eldritch-invocation")
          .flatMap((choice) => choice.optionIds),
      );

      expect(validateBuilderDraft(draft, catalog), `draft level ${String(level)}`).toEqual([]);
      expect(evaluation.validations, `level ${String(level)}`).toEqual([]);
      expect(character.state.currentHitPoints).toBe(expectedHitPoints[level - 1]);
      expect(evaluation.values.armorClass?.value).toBe(13);
      expect(character.build.learnedSpellIds).toHaveLength(expectedCantrips[level - 1] ?? 0);
      expect(character.loadout.preparedSpellIds).toHaveLength(expectedPrepared[level - 1] ?? 0);
      expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(expectedAlwaysPrepared[level - 1]);
      expect(invocations).toHaveLength(expectedInvocations[level - 1] ?? 0);
      expect(character.build.subclassId).toBe(
        level >= 3 ? "srd521.subclass.warlock.fiend-patron" : undefined,
      );
      expect(evaluation.actions.some((action) => action.id === "action.magical-cunning")).toBe(
        level >= 2,
      );
      if (level === 5) {
        expect(character.build.levels.map((entry) => entry.selectedFeatureChoices)).toEqual([
          [
            {
              choiceId: "srd521.choice.warlock.eldritch-invocation",
              optionIds: ["srd521.option.warlock.invocation.pact-of-the-chain"],
            },
          ],
          [
            {
              choiceId: "srd521.choice.warlock.eldritch-invocation",
              optionIds: [
                "srd521.option.warlock.invocation.devil-s-sight",
                "srd521.option.warlock.invocation.fiendish-vigor",
              ],
            },
          ],
          [],
          [],
          [
            {
              choiceId: "srd521.choice.warlock.eldritch-invocation",
              optionIds: [
                "srd521.option.warlock.invocation.ascendant-step",
                "srd521.option.warlock.invocation.one-with-shadows",
              ],
            },
          ],
        ]);
      }
      if (level === 1) {
        expect(character.loadout.inventory).toHaveLength(7);
        expect(character.loadout.equippedItemIds).toEqual(["leather-armor-1", "sickle-1"]);
        expect(character.loadout.currency.gp).toBe(15);
      }
    }
  });

  it("rejects Warlock invocations before their level and prerequisite are available", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelOne = defaultBuilderDraft(warlockId, catalog, 1, "Novice Warlock");
    const tooEarly = updateBuilderFeatureChoice(
      levelOne,
      catalog,
      "srd521.choice.warlock.eldritch-invocation",
      "srd521.option.warlock.invocation.ascendant-step",
    );
    const levelFive = defaultBuilderDraft(warlockId, catalog, 5, "Blade Warlock");
    levelFive.featureChoiceSelections = {
      "srd521.choice.warlock.eldritch-invocation": [
        "srd521.option.warlock.invocation.pact-of-the-chain",
        "srd521.option.warlock.invocation.devil-s-sight",
        "srd521.option.warlock.invocation.fiendish-vigor",
        "srd521.option.warlock.invocation.ascendant-step",
        "srd521.option.warlock.invocation.thirsting-blade",
      ],
    };

    expect(tooEarly).toEqual(levelOne);
    expect(validateBuilderDraft(levelFive, catalog)).toContain(
      "Choose exactly 5 valid Warlock feature options.",
    );
  });

  it("reconciles Druid Primal Order cantrips and selected land spells", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const magician = defaultBuilderDraft(druidId, catalog, 5, "Magician Druid");
    const warden = updateBuilderFeatureChoice(
      magician,
      catalog,
      "srd521.choice.druid.primal-order",
      "srd521.option.druid.primal-order.warden",
    );
    const polar = updateBuilderFeatureChoice(
      warden,
      catalog,
      "srd521.choice.druid.circle-of-land",
      "srd521.option.druid.land.polar",
    );
    const character = buildCharacter(polar, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

    expect(magician.learnedSpellIds).toHaveLength(4);
    expect(warden.learnedSpellIds).toHaveLength(3);
    expect(spellSelectionCounts(polar, catalog)?.alwaysPreparedSpellIds).toEqual(
      expect.arrayContaining([
        "srd521.spell.speak-with-animals",
        "srd521.spell.fog-cloud",
        "srd521.spell.sleet-storm",
      ]),
    );
    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({ cantripsKnown: 3, alwaysPreparedSpells: 5 });
    expect(
      evaluation.spells.find((spell) => spell.id === "srd521.spell.sleet-storm"),
    ).toMatchObject({
      prepared: true,
      level: 3,
    });
  });

  it.each([
    "srd521.option.druid.land.arid",
    "srd521.option.druid.land.polar",
    "srd521.option.druid.land.temperate",
    "srd521.option.druid.land.tropical",
  ])("builds a valid level-5 Druid for the %s land option", (landOptionId) => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = updateBuilderFeatureChoice(
      defaultBuilderDraft(druidId, catalog, 5, "Land Druid"),
      catalog,
      "srd521.choice.druid.circle-of-land",
      landOptionId,
    );
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(5);
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

  it("builds, evaluates, casts, and recharges Magic Initiate spells", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const featId = "srd521.feat.origin.magic-initiate.cleric";
    const draft = updateBuilderBackground(
      defaultBuilderDraft(fighterId, catalog, 1, "Initiate Fighter"),
      catalog,
      "srd521.background.acolyte",
    );
    const selection = draft.magicInitiateChoices[featId];
    if (selection === undefined) throw new Error("Expected Magic Initiate choices.");

    expect(selection.cantripIds).toHaveLength(2);
    expect(selection.levelOneSpellId).toMatch(/^srd521\.spell\./);
    expect(validateBuilderDraft(draft, catalog)).toEqual([]);

    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const levelOneSpell = evaluation.spells.find((spell) => spell.id === selection.levelOneSpellId);
    const freeCastResourceId = `${featId}.free-cast`;

    expect(evaluation.validations).toEqual([]);
    expect(evaluation.spellcasting).toBeUndefined();
    expect(evaluation.spells.map((spell) => spell.id)).toEqual(
      expect.arrayContaining([...selection.cantripIds, selection.levelOneSpellId]),
    );
    expect(levelOneSpell?.castingOptions).toEqual([
      expect.objectContaining({
        sourceId: featId,
        ability: selection.ability,
        freeCastResourceId,
        freeCastAvailable: true,
      }),
    ]);
    expect(evaluation.resources).toContainEqual(
      expect.objectContaining({ id: freeCastResourceId, current: 1 }),
    );

    const cast = proposeSpellCast(
      { character, packages: [rulesPackage] },
      {
        spellId: selection.levelOneSpellId,
        castingSourceId: featId,
        useFreeCast: true,
      },
    );
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedResources[freeCastResourceId]).toBe(1);

    const spent = { ...character, state: cast.nextState };
    expect(
      proposeSpellCast(
        { character: spent, packages: [rulesPackage] },
        {
          spellId: selection.levelOneSpellId,
          castingSourceId: featId,
          useFreeCast: true,
        },
      ).validations.map((validation) => validation.code),
    ).toContain("SPELL_FREE_CAST_EXPENDED");

    const rest = proposeRest(
      { character: spent, packages: [rulesPackage] },
      { event: "long-rest" },
    );
    expect(rest.applicable).toBe(true);
    expect(rest.nextState.expendedResources[freeCastResourceId]).toBe(0);
  });

  it("reconciles dependent choices when a draft changes level", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const levelOne = defaultBuilderDraft(wizardId, catalog, 1, "Ascending Wizard");
    const levelFive = updateBuilderLevel(levelOne, catalog, 5);
    const returnedToOne = updateBuilderLevel(levelFive, catalog, 1);

    expect(levelFive.learnedSpellIds).toHaveLength(18);
    expect(levelFive.preparedSpellIds).toHaveLength(9);
    expect(levelFive.expertiseSkillIds).toEqual(["srd521.skill.arcana"]);
    expect(validateBuilderDraft(levelFive, catalog)).toEqual([]);
    expect(returnedToOne.learnedSpellIds).toHaveLength(9);
    expect(returnedToOne.preparedSpellIds).toHaveLength(4);
    expect(returnedToOne.expertiseSkillIds).toEqual([]);
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
