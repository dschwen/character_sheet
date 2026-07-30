import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contentEntitySchema, packageManifestSchema, sourceManifestSchema } from "./index.js";

describe("bootstrap content package", () => {
  it("loads and validates", () => {
    const root = new URL("../../content-srd-5.2.1/generated/", import.meta.url);
    const manifest: unknown = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
    const entities: unknown = JSON.parse(readFileSync(new URL("entities.json", root), "utf8"));

    expect(packageManifestSchema.parse(manifest).id).toBe("srd-5.2.1");
    expect(contentEntitySchema.array().parse(entities)).toEqual([]);
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
});
