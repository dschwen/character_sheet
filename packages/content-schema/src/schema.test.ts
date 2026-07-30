import { describe, expect, it } from "vitest";

import { authoringIrSchema, exprSchema, packageManifestSchema } from "./index.js";

describe("content schemas", () => {
  it("accepts an empty pinned SRD package manifest", () => {
    expect(
      packageManifestSchema.parse({
        id: "srd-5.2.1",
        version: "0.1.0",
        ruleset: "dnd5e-2024",
        source: {
          id: "wotc-srd-5.2.1-en",
          sha256: "8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87",
        },
        license: "CC-BY-4.0",
        dependencies: [],
        engineCompatibility: ">=0.1.0 <0.2.0",
      }),
    ).toBeDefined();
  });

  it("rejects empty arithmetic expressions", () => {
    expect(() => exprSchema.parse({ kind: "add", args: [] })).toThrow();
  });

  it("rejects draft authoring IR without source provenance", () => {
    expect(() =>
      authoringIrSchema.parse({
        schemaVersion: "0.1.0",
        id: "srd521.class-feature.barbarian.rage",
        kind: "class-feature",
        parentId: "srd521.class.barbarian",
        level: 1,
        source: [],
        text: { title: "Rage", nodes: [] },
        proposedRules: [],
        review: {
          extraction: "approved",
          semantics: "needs-review",
          tests: "missing",
        },
      }),
    ).toThrow();
  });
});
