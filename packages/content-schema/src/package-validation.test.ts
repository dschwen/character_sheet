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
    expect(parsedEntities).toHaveLength(92);
    expect(entityIds[0]).toBe("srd521.class.barbarian");
    expect(entityIds).toContain("srd521.class-feature.barbarian.rage");
    expect(entityIds).toContain("srd521.class-feature.barbarian.unarmored-defense");
    expect(entityIds).toContain("srd521.class-feature.barbarian.improved-brutal-strike.level-17");
    expect(entityIds).toContain("srd521.table.barbarian.rages");
    expect(entityIds).toContain("srd521.table.barbarian.rage-damage");
    expect(entityIds).toContain("srd521.equipment.weapon.greataxe");
    expect(entityIds).toContain("srd521.equipment.armor.heavy.chain-mail");
    expect(entityIds).toContain("srd521.equipment.shield");
    expect(entityIds).toContain("srd521.class.fighter");
    expect(entityIds).toContain("srd521.class-feature.fighter.second-wind");
    expect(entityIds).toContain("srd521.feat.fighting-style.defense");
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
});
