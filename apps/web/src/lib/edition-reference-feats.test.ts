import { describe, expect, it } from "vitest";

import { characterBuilderCatalog, ritualCasterSpellOptions } from "./character-builder";
import { loadWebData } from "./server-data";

const referenceFeatIds = [
  "dnd2014.feat.general.ritual-caster",
  "dnd2024.feat.general.ritual-caster",
];

describe("out-of-SRD edition-reference feats (ADR 0013)", () => {
  it("load as package records with the AUTHORED review status", () => {
    const { rulesPackage } = loadWebData();
    for (const id of referenceFeatIds) {
      const entity = rulesPackage.entities.find((candidate) => candidate.id === id);
      expect(entity?.kind).toBe("feat");
      expect(entity?.review.status).toBe("AUTHORED");
    }
  });

  it("offer only the ritual variants the engine evaluates, with their catalog metadata", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    // Every AUTHORED feat in the catalog must be a variant the engine dispatches on; any other
    // authored record stays out until the engine evaluates it.
    for (const id of Object.keys(catalog.feats)) {
      const entity = rulesPackage.entities.find((candidate) => candidate.id === id);
      if (entity?.review.status === "AUTHORED") expect(referenceFeatIds).toContain(id);
    }
    for (const id of referenceFeatIds) expect(catalog.feats[id]).toBeDefined();
    expect(catalog.feats["srd521.feat.general.ability-score-improvement"]).toBeDefined();
    expect(catalog.feats["srd521.feat.general.grappler"]).toBeDefined();

    const variant2014 = catalog.feats["dnd2014.feat.general.ritual-caster"];
    expect(variant2014?.name).toBe("Ritual Caster (2014 PHB variant)");
    expect(variant2014?.ritualCaster).toMatchObject({
      edition: "2014",
      initialSpellCount: 2,
      maximumInitialSpellLevel: 1,
      maximumSpellLevel: 1,
      researchLevelCap: "half-character-level-rounded-up",
    });
    // Class list options are class entity ids with display names, matching the engine's machine field.
    const classIds = variant2014?.ritualCaster?.classListOptions.map((option) => option.id);
    expect(classIds).toEqual(
      expect.arrayContaining([
        "srd521.class.bard",
        "srd521.class.cleric",
        "srd521.class.druid",
        "srd521.class.wizard",
      ]),
    );
    for (const option of variant2014?.ritualCaster?.classListOptions ?? []) {
      expect(catalog.classes[option.id as keyof typeof catalog.classes]).toBeDefined();
      expect(option.name.length).toBeGreaterThan(1);
    }
    expect(variant2014?.editionReference).toEqual({
      edition: "2014",
      book: "Player's Handbook",
      referenceUrl: "https://www.dndbeyond.com/feats/40-ritual-caster",
    });
    expect(variant2014?.advancement?.prerequisite?.minimumCharacterLevel).toBeUndefined();

    const variant2024 = catalog.feats["dnd2024.feat.general.ritual-caster"];
    expect(variant2024?.name).toBe("Ritual Caster (2024 PHB variant)");
    expect(variant2024?.ritualCaster).toMatchObject({
      edition: "2024",
      initialSpellCount: 0,
      researchLevelCap: null,
    });
    // The catalog carries the full Ritual-tagged pool; the level bound is applied when picking.
    if (variant2024?.ritualCaster === undefined) throw new Error("Missing 2024 ritual definition");
    expect(variant2024.ritualCaster.allRitualSpells.length).toBeGreaterThan(0);
    expect(variant2024.ritualCaster.allRitualSpells.every((spell) => spell.level >= 1)).toBe(true);
    const levelOnePool = ritualCasterSpellOptions(variant2024.ritualCaster, "", 1);
    expect(levelOnePool.length).toBeGreaterThan(0);
    expect(levelOnePool.every((spell) => spell.level === 1)).toBe(true);
    expect(variant2024.editionReference).toEqual({
      edition: "2024",
      book: "Player's Handbook",
      referenceUrl: "https://www.dndbeyond.com/feats/1789180-ritual-caster",
    });
    expect(variant2024.advancement?.prerequisite?.minimumCharacterLevel).toBe(4);
  });
});
