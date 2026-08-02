import { readFileSync } from "node:fs";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  authoringIrSchema,
  contentEntitySchema,
  packageManifestSchema,
  sourceManifestSchema,
} from "./index.js";

describe("bootstrap content package", () => {
  it("loads and validates", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const manifest: unknown = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
    const entities: unknown = JSON.parse(readFileSync(new URL("entities.json", root), "utf8"));

    expect(packageManifestSchema.parse(manifest).id).toBe("srd-5.2.1");
    const parsedEntities = contentEntitySchema.array().parse(entities);
    const entityIds = parsedEntities.map((entity) => entity.id);
    expect(parsedEntities).toHaveLength(426);
    expect(entityIds[0]).toBe("srd521.class.barbarian");
    expect(entityIds).toContain("srd521.class-feature.barbarian.rage");
    expect(entityIds).toContain("srd521.class-feature.barbarian.unarmored-defense");
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
    expect(entityIds).toContain("srd521.class-feature.barbarian.improved-brutal-strike.level-17");
    expect(entityIds).toContain("srd521.table.barbarian.rages");
    expect(entityIds).toContain("srd521.table.barbarian.rage-damage");
    expect(entityIds).toContain("srd521.equipment.weapon.greataxe");
    expect(entityIds).toContain("srd521.equipment.armor.heavy.chain-mail");
    expect(entityIds).toContain("srd521.equipment.shield");
    expect(entityIds).toContain("srd521.class.fighter");
    expect(entityIds).toContain("srd521.class-feature.fighter.second-wind");
    expect(entityIds).toContain("srd521.feat.fighting-style.defense");
    expect(entityIds).toContain("srd521.species.human");
    expect(entityIds).toContain("srd521.background.soldier");
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

  it("validates the Human, Soldier, and Savage Attacker origin slice", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/origins.json", root), "utf8")));
    const savageAttacker = authoringIrSchema.parse(
      JSON.parse(readFileSync(new URL("authoring-ir/origin.savage-attacker.json", root), "utf8")),
    );

    expect(entities.map((entity) => entity.id)).toEqual([
      "srd521.background.soldier",
      "srd521.species.human",
      "srd521.feat.origin.savage-attacker",
      "srd521.feat.origin.skilled",
    ]);
    expect(entities.map((entity) => entity.source[0]?.page)).toEqual([83, 86, 87, 87]);
    expect(savageAttacker.proposedRules[0]).toMatchObject({
      type: "grant-action",
      target: "action.savage-attacker",
      automationLevel: "roll-assisted",
    });
  });

  it("validates the Wizard class and representative spell slice", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const entities = contentEntitySchema
      .array()
      .parse(JSON.parse(readFileSync(new URL("entities/wizard.json", root), "utf8")));
    const wizard = entities.find((entity) => entity.id === "srd521.class.wizard");
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

    expect(entities).toHaveLength(37);
    expect(spells).toHaveLength(20);
    expect(wizardBody.spellList).toHaveLength(217);
    expect(wizardBody.progression[4]).toMatchObject({
      level: 5,
      cantrips: 4,
      preparedSpells: 9,
      spellSlots: { "1": 4, "2": 3, "3": 2 },
    });
    expect(spells.every((spell) => spell.source.length > 0)).toBe(true);
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

    expect(entities).toHaveLength(38);
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
