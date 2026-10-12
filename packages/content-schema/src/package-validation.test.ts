import { readFileSync } from "node:fs";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  authoringIrSchema,
  classBuilderMetadataSchema,
  classFeatureChoiceSchema,
  contentEntitySchema,
  featureAutomationBodySchema,
  packageManifestSchema,
  sourceManifestSchema,
  startingEquipmentChoiceSchema,
} from "./index.js";

describe("bootstrap content package", () => {
  it("loads all source-linked spell descriptions and resolves every class spell-list entry", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const catalog = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/spells.json", root), "utf8")));
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities.json", root), "utf8")));
    expect(catalog).toHaveLength(339);
    expect(new Set(catalog.map(({ id }) => id)).size).toBe(339);
    const spells = new Map(
      entities.filter(({ kind }) => kind === "spell").map((entity) => [entity.id, entity]),
    );
    for (const entity of entities.filter(({ kind }) => kind === "class")) {
      const body = z
        .object({ spellList: z.array(z.string()).default([]) })
        .passthrough()
        .parse(entity.body);
      for (const id of body.spellList) expect(spells.has(id), `${entity.id}: ${id}`).toBe(true);
    }
    for (const spell of catalog) {
      expect(spell.kind).toBe("spell");
      expect(spell.source.length).toBeGreaterThan(0);
      expect(
        z
          .object({
            automationLevel: z.literal("display-only"),
            castingTime: z.string().min(1),
            description: z.string().min(1),
            damage: z.array(z.unknown()).length(0),
          })
          .passthrough()
          .safeParse(spell.body).success,
        spell.id,
      ).toBe(true);
    }
    const nondetection = catalog.find(({ id }) => id === "srd521.spell.nondetection");
    expect(nondetection?.source.some(({ blocks }) => blocks?.includes("p0151-b008"))).toBe(true);
    expect(nondetection?.body).toMatchObject({
      components: {
        materialText: "a pinch of diamond dust worth 25+ GP, which the spell consumes",
      },
    });
  });
  it("loads and validates", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const manifest: unknown = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
    const entities: unknown = JSON.parse(readFileSync(new URL("entities.json", root), "utf8"));

    expect(packageManifestSchema.parse(manifest).id).toBe("srd-5.2.1");
    const parsedEntities = contentEntitySchema.array().parse(entities);
    const entityIds = parsedEntities.map((entity) => entity.id);
    expect(parsedEntities).toHaveLength(870);
    expect(entityIds[0]).toBe("srd521.class.barbarian");
    expect(entityIds).toContain("srd521.class-feature.barbarian.rage");
    expect(entityIds).toEqual(
      expect.arrayContaining([
        "srd521.spell.blur",
        "srd521.spell.lightning-bolt",
        "srd521.spell.ray-of-sickness",
        "srd521.spell.shocking-grasp",
        "srd521.status.spell.bless",
        "srd521.status.spell.haste",
      ]),
    );
    expect(entityIds).toContain("srd521.class-feature.barbarian.unarmored-defense");
    expect(entityIds).toContain("srd521.subclass.barbarian.path-of-the-berserker");
    expect(entityIds).toContain("srd521.subclass-feature.barbarian.path-of-the-berserker.frenzy");
    expect(entityIds).toContain("srd521.class.druid");
    expect(entityIds).toContain("srd521.subclass.druid.circle-of-the-land");
    expect(entityIds).toContain("srd521.class.monk");
    expect(entityIds).toContain("srd521.subclass.monk.warrior-of-the-open-hand");
    expect(entityIds).toContain("srd521.class.paladin");
    expect(entityIds).toContain("srd521.subclass.paladin.oath-of-devotion");
    expect(entityIds).toContain("srd521.class.ranger");
    expect(entityIds).toContain("srd521.subclass.ranger.hunter");
    expect(entityIds).toContain("srd521.option.ranger.hunters-prey.colossus-slayer");
    expect(entityIds).toContain("srd521.spell.hunter-s-mark");
    expect(entityIds).toContain("srd521.class.rogue");
    expect(entityIds).toContain("srd521.subclass.rogue.thief");
    expect(entityIds).toContain("srd521.table.rogue.sneak-attack-dice");
    expect(entityIds).toContain("srd521.option.rogue.cunning-strike.withdraw");
    expect(entityIds).toContain("srd521.class.sorcerer");
    expect(entityIds).toContain("srd521.subclass.sorcerer.draconic-sorcery");
    expect(entityIds).toContain("srd521.option.sorcerer.metamagic.quickened");
    expect(entityIds).toContain("srd521.spell.sorcerous-burst");
    expect(entityIds).toContain("srd521.class.warlock");
    expect(entityIds).toContain("srd521.subclass.warlock.fiend-patron");
    expect(entityIds).toContain("srd521.option.warlock.invocation.pact-of-the-chain");
    expect(entityIds).toContain("srd521.spell.eldritch-blast");
    expect(entityIds).toContain("srd521.class.bard");
    expect(entityIds).toContain("srd521.subclass.bard.college-of-lore");
    expect(entityIds).toContain("srd521.table.bard.bardic-inspiration-die");
    expect(entityIds).toContain("srd521.spell.vicious-mockery");
    expect(entityIds).toContain("srd521.class-feature.barbarian.improved-brutal-strike.level-17");
    expect(entityIds).toContain("srd521.table.barbarian.rages");
    expect(entityIds).toContain("srd521.table.barbarian.rage-damage");
    expect(entityIds).toContain("srd521.equipment.weapon.greataxe");
    expect(entityIds).toContain("srd521.equipment.armor.heavy.chain-mail");
    expect(entityIds).toContain("srd521.equipment.shield");
    expect(entityIds).toContain("srd521.equipment.gear.dungeoneers-pack");
    expect(entityIds).toContain("srd521.equipment.gear.spellbook");
    expect(entityIds).toContain("srd521.equipment.ammunition.arrows");
    expect(entityIds).toContain("srd521.class.fighter");
    expect(entityIds).toContain("srd521.class-feature.fighter.second-wind");
    expect(entityIds).toContain("srd521.feat.fighting-style.defense");
    expect(entityIds).toContain("srd521.species.human");
    expect(entityIds).toContain("srd521.background.soldier");
    expect(entityIds).toContain("srd521.background.acolyte");
    expect(entityIds).toContain("srd521.background.criminal");
    expect(entityIds).toContain("srd521.background.sage");
    expect(entityIds).toContain("srd521.feat.origin.alert");
    expect(entityIds).toContain("srd521.feat.origin.magic-initiate.cleric");
    expect(entityIds).toContain("srd521.feat.origin.savage-attacker");
    expect(entityIds).toContain("srd521.feat.origin.skilled");
    expect(entityIds).toContain("srd521.subclass.fighter.champion");
    expect(entityIds).toContain("srd521.subclass-feature.fighter.champion.improved-critical");
    expect(entityIds).toContain("srd521.feat.general.ability-score-improvement");
    expect(entityIds).toContain("srd521.class.wizard");
    expect(entityIds).toContain("srd521.subclass.wizard.evoker");
    expect(entityIds).toContain("srd521.spell.fireball");
    expect(entityIds).toContain("srd521.spell.web");
    expect(entityIds).toContain("srd521.class.cleric");
    expect(entityIds).toContain("srd521.subclass.cleric.life-domain");
    expect(entityIds).toContain("srd521.spell.spirit-guardians");
    expect(entityIds).toContain("srd521.condition.blinded");
    expect(entityIds).toContain("srd521.condition.unconscious");
  });

  it("validates all standard source-linked conditions", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const conditions = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/conditions.json", root), "utf8")));

    expect(conditions).toHaveLength(15);
    expect(conditions.every((condition) => condition.kind === "condition")).toBe(true);
    expect(conditions.map((condition) => condition.name.en)).toEqual([
      "Blinded",
      "Charmed",
      "Deafened",
      "Exhaustion",
      "Frightened",
      "Grappled",
      "Incapacitated",
      "Invisible",
      "Paralyzed",
      "Petrified",
      "Poisoned",
      "Prone",
      "Restrained",
      "Stunned",
      "Unconscious",
    ]);
    expect(conditions.every((condition) => condition.source.length === 1)).toBe(true);
    const blinded = z.object({ description: z.string() }).parse(conditions[0]?.body);
    expect(blinded.description).toContain(
      "automatically fail any ability check that requires sight",
    );
  });

  it("validates the acquired source manifest against the pinned artifact", () => {
    const source = new URL(
      "../../../sources/wotc-srd-5.2.1-en/" +
        "8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/" +
        "source-metadata.json",
      import.meta.url,
    );
    const manifest: unknown = JSON.parse(readFileSync(source, "utf8"));

    expect(sourceManifestSchema.parse(manifest)).toMatchObject({
      page_count: 364,
      sha256: "8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87",
    });
  });

  it("validates source-linked Barbarian authoring IR and table references", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities: unknown = JSON.parse(readFileSync(new URL("entities.json", root), "utf8"));
    const rage: unknown = JSON.parse(
      readFileSync(new URL("authoring-ir/barbarian.rage.json", root), "utf8"),
    );
    const unarmoredDefense: unknown = JSON.parse(
      readFileSync(new URL("authoring-ir/barbarian.unarmored-defense.json", root), "utf8"),
    );

    const parsedEntities = contentEntitySchema.array().parse(entities);
    const entityIds = new Set(parsedEntities.map((entity) => entity.id));
    const classEntity = parsedEntities.find((entity) => entity.id === "srd521.class.barbarian");
    const classBody = z
      .object({
        progression: z.array(
          z.object({
            level: z.number().int(),
            features: z.array(
              z.object({
                name: z.string(),
                entityId: z.string().nullable(),
              }),
            ),
          }),
        ),
      })
      .parse(classEntity?.body);
    const parsedRage = authoringIrSchema.parse(rage);
    const parsedUnarmoredDefense = authoringIrSchema.parse(unarmoredDefense);
    const referencedTables = parsedRage.proposedRules.flatMap((rule) =>
      rule.expression?.kind === "tableLookup" ? [rule.expression.table] : [],
    );

    expect(referencedTables).toEqual([
      "srd521.table.barbarian.rages",
      "srd521.table.barbarian.rage-damage",
    ]);
    expect(referencedTables.every((table) => entityIds.has(table))).toBe(true);
    expect(
      classBody.progression
        .flatMap((row) => row.features)
        .every((feature) => feature.entityId === null || entityIds.has(feature.entityId)),
    ).toBe(true);
    expect(classBody.progression.map((row) => row.level)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(parsedRage.source.map((source) => source.page)).toEqual([28, 29]);
    expect(parsedRage.review.semantics).toBe("needs-review");
    expect(parsedUnarmoredDefense.proposedRules[0]?.type).toBe("add-candidate-calculation");
  });

  it("validates source-linked Fighter and Defense authoring IR", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const secondWind: unknown = JSON.parse(
      readFileSync(new URL("authoring-ir/fighter.second-wind.json", root), "utf8"),
    );
    const defense: unknown = JSON.parse(
      readFileSync(new URL("authoring-ir/fighting-style.defense.json", root), "utf8"),
    );

    const parsedSecondWind = authoringIrSchema.parse(secondWind);
    const parsedDefense = authoringIrSchema.parse(defense);

    expect(parsedSecondWind.source.map((source) => source.page)).toEqual([48]);
    expect(parsedSecondWind.proposedRules.map((rule) => rule.type)).toEqual([
      "grant-resource",
      "grant-action",
    ]);
    expect(parsedDefense.kind).toBe("feat");
    expect(parsedDefense.source.map((source) => source.page)).toEqual([88]);
    expect(parsedDefense.proposedRules[0]).toMatchObject({
      type: "add-modifier",
      target: "armor-class",
    });
  });

  it("validates structured starting-equipment choices and their entity references", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities.json", root), "utf8")));
    const entityIds = new Set(entities.map((entity) => entity.id));
    const parsedChoices = entities.flatMap((entity) => {
      if (entity.kind !== "class" || entity.body === null) return [];
      const body = z.record(z.unknown()).parse(entity.body);
      if (body.startingEquipment === undefined) return [];
      return [
        {
          classId: entity.id,
          choice: startingEquipmentChoiceSchema.parse(body.startingEquipment),
        },
      ];
    });

    expect(parsedChoices.map(({ classId }) => classId)).toEqual(
      expect.arrayContaining([
        "srd521.class.barbarian",
        "srd521.class.bard",
        "srd521.class.cleric",
        "srd521.class.druid",
        "srd521.class.fighter",
        "srd521.class.monk",
        "srd521.class.paladin",
        "srd521.class.ranger",
        "srd521.class.rogue",
        "srd521.class.sorcerer",
        "srd521.class.warlock",
        "srd521.class.wizard",
      ]),
    );
    expect(
      parsedChoices
        .flatMap(({ choice }) => choice.options)
        .flatMap((option) => option.items)
        .filter((item) => item.kind === "entity")
        .every((item) => entityIds.has(item.entityId)),
    ).toBe(true);
  });

  it("validates data-driven builder metadata for each supported class", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities.json", root), "utf8")));
    const builderClasses = new Set([
      "srd521.class.barbarian",
      "srd521.class.bard",
      "srd521.class.cleric",
      "srd521.class.druid",
      "srd521.class.fighter",
      "srd521.class.monk",
      "srd521.class.paladin",
      "srd521.class.ranger",
      "srd521.class.rogue",
      "srd521.class.sorcerer",
      "srd521.class.warlock",
      "srd521.class.wizard",
    ]);
    const metadata = entities.flatMap((entity) => {
      if (!builderClasses.has(entity.id)) return [];
      const body = z.record(z.unknown()).parse(entity.body);
      return [{ id: entity.id, builder: classBuilderMetadataSchema.parse(body.builder) }];
    });

    expect(metadata).toHaveLength(12);
    expect(metadata.find(({ id }) => id === "srd521.class.fighter")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
    });
    expect(metadata.find(({ id }) => id === "srd521.class.barbarian")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
      defaultAbilityScoreImprovementAbility: "strength",
    });
    const mindlessRage = entities.find(
      (entity) =>
        entity.id === "srd521.subclass-feature.barbarian.path-of-the-berserker.mindless-rage",
    );
    expect(featureAutomationBodySchema.parse(mindlessRage?.body)).toMatchObject({
      activeEffectConditionImmunities: [
        {
          activeEffectId: "srd521.effect.barbarian.rage",
          conditionIds: ["srd521.condition.charmed", "srd521.condition.frightened"],
        },
      ],
      actionEnhancements: [
        {
          actionId: "action.enter-rage",
          endsConditionIds: ["srd521.condition.charmed", "srd521.condition.frightened"],
        },
      ],
    });
    expect(metadata.find(({ id }) => id === "srd521.class.bard")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
      defaultAbilityScoreImprovementAbility: "charisma",
      defaultClassSkillIds: [
        "srd521.skill.performance",
        "srd521.skill.persuasion",
        "srd521.skill.deception",
        "srd521.skill.arcana",
        "srd521.skill.history",
        "srd521.skill.nature",
      ],
      expertiseChoice: {
        sourceId: "srd521.class-feature.bard.expertise",
        minimumLevel: 2,
        requireClassProficiency: false,
        countByLevel: { 2: 2, 3: 2, 4: 2, 5: 2, 8: 2, 9: 4 },
      },
    });
    expect(metadata.find(({ id }) => id === "srd521.class.monk")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
      defaultAbilityScoreImprovementAbility: "dexterity",
      defaultClassSkillIds: ["srd521.skill.acrobatics", "srd521.skill.insight"],
    });
    expect(metadata.find(({ id }) => id === "srd521.class.cleric")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
    });
    expect(metadata.find(({ id }) => id === "srd521.class.druid")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
    });
    expect(
      featureAutomationBodySchema.parse(
        entities.find(
          ({ id }) => id === "srd521.subclass-feature.cleric.life-domain.blessed-healer",
        )?.body,
      ).spellHealingEffects,
    ).toEqual([{ target: "caster-after-healing-other", base: 2, perSlotLevel: 1 }]);
    expect(
      featureAutomationBodySchema.parse(
        entities.find(({ id }) => id === "srd521.class-feature.monk.empowered-strikes")?.body,
      ),
    ).toMatchObject({ unarmedStrikeDamageTypes: ["force"] });
    expect(metadata.find(({ id }) => id === "srd521.class.paladin")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
      defaultAbilityScoreImprovementAbility: "charisma",
      defaultClassSkillIds: ["srd521.skill.insight", "srd521.skill.persuasion"],
    });
    const paladin = entities.find((entity) => entity.id === "srd521.class.paladin");
    const paladinBody = z.record(z.unknown()).parse(paladin?.body);
    expect(classFeatureChoiceSchema.parse(paladinBody.fightingStyleChoice)).toMatchObject({
      level: 2,
      options: ["srd521.feat.fighting-style.defense"],
    });
    const ranger = entities.find((entity) => entity.id === "srd521.class.ranger");
    const rangerBody = z.record(z.unknown()).parse(ranger?.body);
    expect(classFeatureChoiceSchema.parse(rangerBody.fightingStyleChoice)).toMatchObject({
      level: 2,
      options: ["srd521.feat.fighting-style.defense"],
    });
    expect(metadata.find(({ id }) => id === "srd521.class.ranger")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
      defaultAbilityScoreImprovementAbility: "wisdom",
      expertiseChoice: {
        sourceId: "srd521.class-feature.ranger.deft-explorer",
        minimumLevel: 2,
        requireClassProficiency: false,
        grants: [
          { level: 2, count: 1, sourceId: "srd521.class-feature.ranger.deft-explorer" },
          { level: 9, count: 2, sourceId: "srd521.class-feature.ranger.expertise" },
        ],
      },
    });
    expect(rangerBody.progression).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 6,
          proficiencyBonus: 3,
          favoredEnemy: 3,
          preparedSpells: 6,
          spellSlots: { 1: 4, 2: 2 },
        }),
      ]),
    );
    expect(metadata.find(({ id }) => id === "srd521.class.rogue")?.builder).toMatchObject({
      supportedLevelMaximum: 8,
      defaultAbilityScoreImprovementAbility: "dexterity",
      expertiseChoice: {
        sourceId: "srd521.class-feature.rogue.expertise",
        minimumLevel: 1,
        requireClassProficiency: false,
        countByLevel: { 1: 2, 3: 2, 5: 2, 6: 4 },
      },
    });
    expect(metadata.find(({ id }) => id === "srd521.class.sorcerer")?.builder).toMatchObject({
      supportedLevelMaximum: 9,
      defaultAbilityScoreImprovementAbility: "charisma",
      defaultClassSkillIds: ["srd521.skill.arcana", "srd521.skill.persuasion"],
    });
    const sorcerer = entities.find((entity) => entity.id === "srd521.class.sorcerer");
    const sorcererBody = z.record(z.unknown()).parse(sorcerer?.body);
    expect(sorcererBody.spellPreparationChange).toEqual({
      event: "level-up",
      replacementMaximum: 1,
    });
    const sorcererProgression = z.array(z.record(z.unknown())).parse(sorcererBody.progression);
    expect(sorcererProgression.find((row) => row.level === 6)).toMatchObject({
      level: 6,
      sorceryPoints: 6,
      preparedSpells: 10,
      spellSlots: { 1: 4, 2: 3, 3: 3 },
    });
    const draconicSorcery = entities.find(
      (entity) => entity.id === "srd521.subclass.sorcerer.draconic-sorcery",
    );
    const draconicBody = z.record(z.unknown()).parse(draconicSorcery?.body);
    expect(classFeatureChoiceSchema.parse(draconicBody.elementalAffinityChoice)).toMatchObject({
      level: 6,
      minimum: 1,
      maximum: 1,
      defaultOptionIds: ["srd521.option.sorcerer.draconic.elemental-affinity.fire"],
      options: [
        "srd521.option.sorcerer.draconic.elemental-affinity.acid",
        "srd521.option.sorcerer.draconic.elemental-affinity.cold",
        "srd521.option.sorcerer.draconic.elemental-affinity.fire",
        "srd521.option.sorcerer.draconic.elemental-affinity.lightning",
        "srd521.option.sorcerer.draconic.elemental-affinity.poison",
      ],
    });
    expect(classFeatureChoiceSchema.parse(sorcererBody.metamagicChoice)).toMatchObject({
      level: 2,
      minimum: 2,
      maximum: 2,
      defaultOptionIds: [
        "srd521.option.sorcerer.metamagic.quickened",
        "srd521.option.sorcerer.metamagic.subtle",
      ],
      changeOn: ["level-up"],
      replacementMaximum: 1,
    });
    const warlock = entities.find((entity) => entity.id === "srd521.class.warlock");
    const warlockBody = z.record(z.unknown()).parse(warlock?.body);
    expect(warlockBody.builder).toMatchObject({ supportedLevelMaximum: 9 });
    expect(warlockBody.spellPreparationChange).toEqual({
      event: "level-up",
      replacementMaximum: 1,
    });
    expect(warlockBody.cantripChange).toEqual({ event: "level-up", replacementMaximum: 1 });
    expect(classFeatureChoiceSchema.parse(warlockBody.eldritchInvocationChoice)).toMatchObject({
      level: 1,
      minimum: 1,
      maximum: 7,
      countByLevel: { 1: 1, 2: 3, 3: 3, 4: 3, 5: 5, 6: 5, 7: 6, 8: 6, 9: 7 },
      defaultOptionIds: [
        "srd521.option.warlock.invocation.pact-of-the-chain",
        "srd521.option.warlock.invocation.devil-s-sight",
        "srd521.option.warlock.invocation.fiendish-vigor",
        "srd521.option.warlock.invocation.ascendant-step",
        "srd521.option.warlock.invocation.one-with-shadows",
        "srd521.option.warlock.invocation.eldritch-mind",
        "srd521.option.warlock.invocation.visions-of-distant-realms",
      ],
      changeOn: ["level-up"],
      replacementMaximum: 1,
    });
    const hunter = entities.find((entity) => entity.id === "srd521.subclass.ranger.hunter");
    const hunterBody = z.record(z.unknown()).parse(hunter?.body);
    expect(classFeatureChoiceSchema.parse(hunterBody.huntersPreyChoice)).toMatchObject({
      level: 3,
      options: [
        "srd521.option.ranger.hunters-prey.colossus-slayer",
        "srd521.option.ranger.hunters-prey.horde-breaker",
      ],
      changeOn: ["short-rest", "long-rest"],
    });
    const cleric = entities.find((entity) => entity.id === "srd521.class.cleric");
    const clericBody = z.record(z.unknown()).parse(cleric?.body);
    expect(classFeatureChoiceSchema.parse(clericBody.divineOrderChoice)).toMatchObject({
      level: 1,
      options: [
        "srd521.option.cleric.divine-order.protector",
        "srd521.option.cleric.divine-order.thaumaturge",
      ],
    });
    const druid = entities.find((entity) => entity.id === "srd521.class.druid");
    const druidBody = z.record(z.unknown()).parse(druid?.body);
    expect(classFeatureChoiceSchema.parse(druidBody.primalOrderChoice)).toMatchObject({
      level: 1,
      options: [
        "srd521.option.druid.primal-order.magician",
        "srd521.option.druid.primal-order.warden",
      ],
    });
    const circle = entities.find(
      (entity) => entity.id === "srd521.subclass.druid.circle-of-the-land",
    );
    const circleBody = z.record(z.unknown()).parse(circle?.body);
    expect(classFeatureChoiceSchema.parse(circleBody.landChoice)).toMatchObject({
      level: 3,
      options: [
        "srd521.option.druid.land.arid",
        "srd521.option.druid.land.polar",
        "srd521.option.druid.land.temperate",
        "srd521.option.druid.land.tropical",
      ],
    });
  });

  it("validates Fighter levels 2–5 and Champion authoring IR", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const files = [
      "fighter.action-surge.json",
      "fighter.tactical-mind.json",
      "fighter.extra-attack.json",
      "fighter.tactical-shift.json",
      "champion.improved-critical.json",
      "champion.remarkable-athlete.json",
      "feat.ability-score-improvement.json",
    ];
    const authoringIr = files.map((file) =>
      authoringIrSchema.parse(
        JSON.parse(readFileSync(new URL(`authoring-ir/${file}`, root), "utf8")),
      ),
    );

    expect(authoringIr.map((ir) => ir.source[0]?.page)).toEqual([48, 48, 48, 48, 49, 49, 87]);
    expect(authoringIr.flatMap((ir) => ir.proposedRules.map((rule) => rule.type))).toEqual(
      expect.arrayContaining([
        "grant-resource",
        "grant-action",
        "grant-advantage",
        "set-attack-count",
        "set-critical-threshold",
      ]),
    );
    expect(authoringIr.filter((ir) => ir.kind === "subclass-feature")).toHaveLength(2);
  });

  it("validates all SRD backgrounds, the reviewed species, and modeled Origin feats", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/origins.json", root), "utf8")));
    const savageAttacker = authoringIrSchema.parse(
      JSON.parse(readFileSync(new URL("authoring-ir/origin.savage-attacker.json", root), "utf8")),
    );
    const alert = authoringIrSchema.parse(
      JSON.parse(readFileSync(new URL("authoring-ir/origin.alert.json", root), "utf8")),
    );

    expect(entities.map((entity) => entity.id)).toEqual([
      "srd521.background.soldier",
      "srd521.background.acolyte",
      "srd521.background.criminal",
      "srd521.background.sage",
      "srd521.species.human",
      "srd521.species.dwarf",
      "srd521.species.dragonborn",
      "srd521.species.elf",
      "srd521.species.gnome",
      "srd521.species.goliath",
      "srd521.species.halfling",
      "srd521.species.orc",
      "srd521.species.tiefling",
      "srd521.feat.origin.savage-attacker",
      "srd521.feat.origin.skilled",
      "srd521.feat.origin.alert",
      "srd521.feat.origin.magic-initiate.cleric",
      "srd521.feat.origin.magic-initiate.druid",
      "srd521.feat.origin.magic-initiate.wizard",
    ]);
    expect(entities.map((entity) => entity.source[0]?.page)).toEqual([
      83, 83, 83, 83, 86, 84, 84, 84, 85, 85, 86, 86, 86, 87, 87, 87, 87, 87, 87,
    ]);
    expect(savageAttacker.proposedRules[0]).toMatchObject({
      type: "grant-action",
      target: "action.savage-attacker",
      automationLevel: "roll-assisted",
    });
    expect(alert.proposedRules[0]).toMatchObject({
      type: "add-modifier",
      target: "initiative",
      automationLevel: "sheet-automated",
    });
  });

  it("validates the Wizard class and representative spell slice", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/wizard.json", root), "utf8")));
    const wizard = entities.find((entity) => entity.id === "srd521.class.wizard");
    expect(z.record(z.unknown()).parse(wizard?.body).builder).toMatchObject({
      supportedLevelMaximum: 9,
    });
    const spells = entities.filter((entity) => entity.kind === "spell");
    const wizardBody = z
      .object({
        spellcastingAbility: z.literal("intelligence"),
        spellList: z.array(z.string()),
        progression: z.array(
          z.object({
            level: z.number().int(),
            cantrips: z.number().int(),
            preparedSpells: z.number().int(),
            spellSlots: z.record(z.number().int()),
          }),
        ),
      })
      .parse(wizard?.body);

    expect(entities).toHaveLength(45);
    expect(spells).toHaveLength(27);
    expect(spells).toContainEqual(expect.objectContaining({ id: "srd521.spell.chill-touch" }));
    expect(spells).toContainEqual(expect.objectContaining({ id: "srd521.spell.darkness" }));
    expect(spells).toContainEqual(expect.objectContaining({ id: "srd521.spell.mending" }));
    expect(spells).toContainEqual(expect.objectContaining({ id: "srd521.spell.minor-illusion" }));
    expect(spells).toContainEqual(expect.objectContaining({ id: "srd521.spell.poison-spray" }));
    expect(spells).toContainEqual(
      expect.objectContaining({ id: "srd521.spell.ray-of-enfeeblement" }),
    );
    expect(wizardBody.spellList).toHaveLength(217);
    expect(wizardBody.progression[4]).toMatchObject({
      level: 5,
      cantrips: 4,
      preparedSpells: 9,
      spellSlots: { "1": 4, "2": 3, "3": 2 },
    });
    expect(spells.every((spell) => spell.source.length > 0)).toBe(true);
  });

  it("validates complete adventuring-gear and ammunition table slices", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/equipment.json", root), "utf8")));
    const gear = entities.filter((entity) => entity.kind === "equipment-gear");
    const ammunition = entities.filter((entity) => entity.kind === "equipment-ammunition");

    expect(entities).toHaveLength(138);
    expect(gear).toHaveLength(82);
    expect(ammunition).toHaveLength(5);
    expect(gear.map((entity) => entity.id)).toEqual(
      expect.arrayContaining([
        "srd521.equipment.gear.dungeoneers-pack",
        "srd521.equipment.gear.explorers-pack",
        "srd521.equipment.gear.quiver",
        "srd521.equipment.gear.robe",
        "srd521.equipment.gear.scholars-pack",
      ]),
    );
    expect(ammunition.find((entity) => entity.id.endsWith(".arrows"))?.source[0]?.page).toBe(96);
  });

  it("validates Cleric, Life Domain, and Channel Divinity authoring IR", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/cleric.json", root), "utf8")));
    const channelDivinity = authoringIrSchema.parse(
      JSON.parse(readFileSync(new URL("authoring-ir/cleric.channel-divinity.json", root), "utf8")),
    );
    const preserveLife = authoringIrSchema.parse(
      JSON.parse(
        readFileSync(new URL("authoring-ir/life-domain.preserve-life.json", root), "utf8"),
      ),
    );
    const cleric = entities.find((entity) => entity.id === "srd521.class.cleric");
    const clericBody = z
      .object({
        spellcastingAbility: z.literal("wisdom"),
        spellPreparation: z.literal("full-list"),
        spellList: z.array(z.string()),
        progression: z.array(
          z.object({
            level: z.number().int(),
            channelDivinity: z.number().int(),
            cantrips: z.number().int(),
            preparedSpells: z.number().int(),
            spellSlots: z.record(z.number().int()),
          }),
        ),
      })
      .parse(cleric?.body);

    expect(entities).toHaveLength(40);
    expect(entities.filter((entity) => entity.kind === "spell")).toHaveLength(17);
    expect(clericBody.spellList).toHaveLength(109);
    expect(clericBody.progression[4]).toMatchObject({
      level: 5,
      channelDivinity: 2,
      cantrips: 4,
      preparedSpells: 9,
      spellSlots: { "1": 4, "2": 3, "3": 2 },
    });
    expect(channelDivinity.proposedRules.map((rule) => rule.type)).toEqual([
      "grant-resource",
      "grant-action",
      "grant-action",
    ]);
    expect(preserveLife).toMatchObject({
      kind: "subclass-feature",
      parentId: "srd521.subclass.cleric.life-domain",
    });
  });
});
