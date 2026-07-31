import { describe, expect, it } from "vitest";

import { characterDocumentSchema } from "./index.js";

const baseCharacter = {
  schemaVersion: "0.1.0",
  id: "character-1",
  name: "Ada",
  ruleset: {
    system: "dnd5e",
    edition: "2024",
    packages: [
      {
        id: "srd-5.2.1",
        version: "0.1.0",
        sha256: "8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87",
      },
    ],
  },
  build: {
    levels: [],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
  },
  loadout: {},
  state: {
    currentHitPoints: 0,
  },
  metadata: {
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    revision: 0,
  },
};

describe("characterDocumentSchema", () => {
  it("fills defaults while preserving only choices and mutable state", () => {
    const character = characterDocumentSchema.parse(baseCharacter);

    expect(character.build.featIds).toEqual([]);
    expect(character.build.backgroundAbilityScoreIncreases).toEqual({});
    expect(character.build.featAbilityScoreIncreases).toEqual({});
    expect(character.build.proficiencyChoices).toEqual({
      skills: [],
      expertise: [],
    });
    expect(character.state.temporaryHitPoints).toBe(0);
    expect(character.state.heroicInspiration).toBe(false);
    expect(character.state.activeEffectIds).toEqual([]);
    expect(character.state.expendedHitDice).toEqual({});
    expect(character.loadout.inventory).toEqual([]);
    expect(character.overrides).toEqual([]);
  });

  it("rejects non-contiguous leveling history", () => {
    expect(() =>
      characterDocumentSchema.parse({
        ...baseCharacter,
        build: {
          ...baseCharacter.build,
          levels: [
            {
              characterLevel: 2,
              classId: "srd521.class.fighter",
              hitPointChoice: "fixed",
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("rejects equipped item IDs that are absent from inventory", () => {
    expect(() =>
      characterDocumentSchema.parse({
        ...baseCharacter,
        loadout: {
          equippedItemIds: ["missing-item"],
        },
      }),
    ).toThrow();
  });
});
