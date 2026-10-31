import { describe, expect, it } from "vitest";

import { characterBuilderCatalog } from "./character-builder";
import { loadWebData } from "./server-data";

const referenceFeatIds = [
  "dnd2014.feat.general.ritual-caster",
  "dnd2024.feat.general.ritual-caster",
];

describe("out-of-SRD edition-reference feats (ADR 0013)", () => {
  it("load as package records but are held out of the builder feat catalog", () => {
    const { rulesPackage } = loadWebData();
    for (const id of referenceFeatIds) {
      const entity = rulesPackage.entities.find((candidate) => candidate.id === id);
      expect(entity?.kind).toBe("feat");
      expect(entity?.review.status).toBe("AUTHORED");
    }
    const catalog = characterBuilderCatalog(rulesPackage);
    for (const id of referenceFeatIds) expect(catalog.feats[id]).toBeUndefined();
    expect(catalog.feats["srd521.feat.general.ability-score-improvement"]).toBeDefined();
    expect(catalog.feats["srd521.feat.general.grappler"]).toBeDefined();
  });
});
