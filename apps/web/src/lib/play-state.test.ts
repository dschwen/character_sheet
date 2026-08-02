import { describe, expect, it } from "vitest";

import type { CharacterDocument } from "@dnd/character-model";

import {
  applyDamage,
  applyHealing,
  clearConcentration,
  setExhaustion,
  setHeroicInspiration,
  setTemporaryHitPoints,
} from "./play-state";
import { loadWebData } from "./server-data";

function character(): CharacterDocument {
  const fixture = loadWebData().fixtures.find(({ filename }) => filename === "wizard-5.json");
  if (fixture === undefined) throw new Error("Wizard fixture is missing");
  return fixture.character;
}

const updatedAt = new Date("2026-08-02T12:00:00.000Z");

describe("browser play-state edits", () => {
  it("applies damage to temporary HP before current HP", () => {
    const source = setTemporaryHitPoints(character(), 5, updatedAt);
    const damaged = applyDamage(source, 8, updatedAt);

    expect(damaged.state.temporaryHitPoints).toBe(0);
    expect(damaged.state.currentHitPoints).toBe(source.state.currentHitPoints - 3);
    expect(character().state.currentHitPoints).not.toBe(damaged.state.currentHitPoints);
  });

  it("caps healing at maximum HP and advances document metadata", () => {
    const source = character();
    const healed = applyHealing(source, 100, 32, updatedAt);

    expect(healed.state.currentHitPoints).toBe(32);
    expect(healed.metadata.revision).toBe(source.metadata.revision + 1);
    expect(healed.metadata.updatedAt).toBe(updatedAt.toISOString());
  });

  it("bounds exhaustion and updates other direct play state", () => {
    const inspired = setHeroicInspiration(character(), true, updatedAt);
    const exhausted = setExhaustion(inspired, 20, updatedAt);
    const unconcentrated = clearConcentration(exhausted, updatedAt);

    expect(unconcentrated.state.heroicInspiration).toBe(true);
    expect(unconcentrated.state.exhaustion).toBe(6);
    expect(unconcentrated.state.concentrationSpellId).toBeUndefined();
  });
});
