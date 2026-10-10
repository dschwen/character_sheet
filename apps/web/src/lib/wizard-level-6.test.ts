import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeSpellCast } from "@dnd/rules-core";
import { featureAutomationBodySchema } from "@dnd/content-schema";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  featureSpellbookChoices,
  updateBuilderBackground,
  wizardId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter } from "./character-level-up";
import { loadWebData } from "./server-data";
import { spellProtectionInstructions } from "./spell-protection";

const featureId = "srd521.subclass-feature.wizard.evoker.sculpt-spells";
const options = { id: "sculpting-wizard", now: new Date("2026-10-10T12:00:00Z") };

function setup(level = 6, spellId = "srd521.spell.fireball") {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(wizardId, catalog, level, "Sculpting Wizard");
  const spell = catalog.classes[wizardId].spellcasting?.spells.find(({ id }) => id === spellId);
  if (!spell) throw new Error("Missing test spell");
  if (!draft.learnedSpellIds.includes(spellId)) {
    const grants = featureSpellbookChoices(draft, catalog);
    const removable = [...draft.learnedSpellIds]
      .reverse()
      .find(
        (id) =>
          !grants.includes(id) &&
          !draft.preparedSpellIds.includes(id) &&
          catalog.classes[wizardId].spellcasting?.spells.some(
            (candidate) =>
              candidate.id === id &&
              (spell.level === 0 ? candidate.level === 0 : candidate.level > 0),
          ),
      );
    if (!removable) throw new Error("Missing removable test spell");
    draft.learnedSpellIds = [...draft.learnedSpellIds.filter((id) => id !== removable), spellId];
  }
  if (spell.level > 0)
    draft.preparedSpellIds = [
      spellId,
      ...draft.preparedSpellIds.filter((id) => id !== spellId),
    ].slice(0, draft.preparedSpellIds.length);
  const character = buildCharacter(draft, rulesPackage, options);
  return { character, rulesPackage, catalog, input: { character, packages: [rulesPackage] } };
}

describe("Wizard level 6 and source-driven spell protection", () => {
  it("advances with a larger spellbook and slots while preserving play state and historical choices", () => {
    const { character, catalog, rulesPackage } = setup(5);
    character.state.currentHitPoints = 13;
    character.state.expendedSpellSlots["2"] = 1;
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    const evaluation = evaluateCharacter({ character: advanced, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    expect(advanced.state).toEqual(character.state);
    expect(advanced.loadout.inventory).toEqual(character.loadout.inventory);
    expect(advanced.build.levels.slice(0, 5)).toEqual(character.build.levels);
    expect(advanced.build.learnedSpellIds).toEqual(
      expect.arrayContaining(character.build.learnedSpellIds),
    );
    expect(advanced.build.learnedSpellIds).toHaveLength(23);
    expect(advanced.loadout.preparedSpellIds).toHaveLength(10);
    expect(evaluation.values["hitPoints.maximum"]?.value).toBe(38);
    expect(evaluation.spellcasting).toMatchObject({
      spellbookMinimum: 19,
      preparedSpellLimit: 10,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
        { level: 3, maximum: 3 },
      ],
    });
    expect(evaluation.spellProtections).toEqual([
      expect.objectContaining({ sourceId: featureId, school: "evocation", additionalTargets: 1 }),
    ]);
    expect(evaluateCharacter({ character, packages: [rulesPackage] }).spellProtections).toEqual([]);
  });

  it.each([
    ["srd521.spell.fireball", 3, 4],
    ["srd521.spell.thunderwave", 3, 4],
    ["srd521.spell.thunderwave", 1, 2],
    ["srd521.spell.ray-of-frost", undefined, 1],
  ] as const)("traces protection for %s cast at %s", (spellId, slotLevel, count) => {
    const { input, character } = setup(6, spellId);
    const original = structuredClone(character);
    const proposal = proposeSpellCast(input, {
      spellId,
      ...(slotLevel === undefined ? {} : { slotLevel }),
      protectedCreatureCount: count,
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.protection).toMatchObject({
      sourceId: featureId,
      creatureCount: count,
      maximumCreatures: count,
      requiresSight: true,
      othersOnly: true,
      automaticSaveSuccess: true,
      noDamageOnSuccessfulHalfSave: true,
    });
    const trace = proposal.traces[proposal.protection?.traceId ?? ""];
    expect(trace?.result).toBe(count);
    expect(trace?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: featureId, page: 82 })]),
    );
    expect(character).toEqual(original);
    expect(proposal.nextState.currentHitPoints).toBe(character.state.currentHitPoints);
    expect(proposal.nextState.activeEffectIds).toEqual(character.state.activeEffectIds);
    if (slotLevel !== undefined)
      expect(proposal.nextState.expendedSpellSlots[String(slotLevel)]).toBe(1);
    else expect(proposal.changes).toEqual([]);
  });

  it.each([
    [5, "srd521.spell.fireball", 3, 1],
    [6, "srd521.spell.web", 2, 1],
    [6, "srd521.spell.fireball", 3, 5],
  ] as const)(
    "atomically rejects unavailable protection at level %s for %s",
    (level, spellId, slotLevel, count) => {
      const { input, character } = setup(level, spellId);
      const proposal = proposeSpellCast(input, {
        spellId,
        slotLevel,
        protectedCreatureCount: count,
      });
      expect(proposal.applicable).toBe(false);
      expect(proposal.validations.map(({ code }) => code)).toContain(
        "SPELL_PROTECTION_UNAVAILABLE",
      );
      expect(proposal.changes).toEqual([]);
      expect(proposal.traces).toEqual({});
      expect(proposal.nextState).toEqual(character.state);
      expect(proposal.protection).toBeUndefined();
    },
  );

  it("leaves ordinary casts unchanged and does not bypass spell preparation or slots", () => {
    const { input, character } = setup();
    expect(
      proposeSpellCast(input, { spellId: "srd521.spell.fireball", slotLevel: 3 }).protection,
    ).toBeUndefined();
    character.loadout.preparedSpellIds = character.loadout.preparedSpellIds.filter(
      (id) => id !== "srd521.spell.fireball",
    );
    const unprepared = proposeSpellCast(input, {
      spellId: "srd521.spell.fireball",
      slotLevel: 3,
      protectedCreatureCount: 4,
    });
    expect(unprepared.applicable).toBe(false);
    expect(unprepared.nextState).toEqual(character.state);
    expect(unprepared.protection).toBeUndefined();
    character.loadout.preparedSpellIds.push("srd521.spell.fireball");
    character.state.expendedSpellSlots["3"] = 3;
    expect(
      proposeSpellCast(input, {
        spellId: "srd521.spell.fireball",
        slotLevel: 3,
        protectedCreatureCount: 4,
      }).applicable,
    ).toBe(false);
  });

  it("uses the base spell level for ritual protection without spending a slot", () => {
    const { input, character } = setup(6, "srd521.spell.tiny-hut");
    const proposal = proposeSpellCast(input, {
      spellId: "srd521.spell.tiny-hut",
      asRitual: true,
      protectedCreatureCount: 4,
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.protection?.maximumCreatures).toBe(4);
    expect(proposal.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
    expect(
      proposeSpellCast(input, {
        spellId: "srd521.spell.tiny-hut",
        asRitual: true,
        protectedCreatureCount: 5,
      }).applicable,
    ).toBe(false);
  });

  it("uses the base spell level for a Magic Initiate free cast", () => {
    const { rulesPackage } = loadWebData();
    const catalog = characterBuilderCatalog(rulesPackage);
    const draft = updateBuilderBackground(
      defaultBuilderDraft(wizardId, catalog, 6, "Free Sculpt"),
      catalog,
      "srd521.background.sage",
    );
    const featId = "srd521.feat.origin.magic-initiate.wizard";
    const selection = draft.magicInitiateChoices[featId];
    if (!selection) throw new Error("Missing Magic Initiate choices");
    selection.levelOneSpellId = "srd521.spell.magic-missile";
    const character = buildCharacter(draft, rulesPackage, options);
    const input = { character, packages: [rulesPackage] };
    const proposal = proposeSpellCast(input, {
      spellId: selection.levelOneSpellId,
      useFreeCast: true,
      castingSourceId: featId,
      protectedCreatureCount: 2,
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.protection?.maximumCreatures).toBe(2);
    expect(proposal.nextState.expendedResources[`${featId}.free-cast`]).toBe(1);
    expect(proposal.nextState.expendedSpellSlots).toEqual(character.state.expendedSpellSlots);
    expect(
      proposeSpellCast(input, {
        spellId: selection.levelOneSpellId,
        useFreeCast: true,
        castingSourceId: featId,
        protectedCreatureCount: 3,
      }).applicable,
    ).toBe(false);
  });

  it("describes conditional protection, not immunity to Magic Missile", () => {
    const { input } = setup(6, "srd521.spell.magic-missile");
    const proposal = proposeSpellCast(input, {
      spellId: "srd521.spell.magic-missile",
      slotLevel: 1,
      protectedCreatureCount: 2,
    });
    expect(proposal.applicable).toBe(true);
    if (!proposal.protection) throw new Error("Missing protection guidance");
    const instruction = spellProtectionInstructions(proposal.protection);
    expect(instruction).toContain("automatically succeed on saving throws");
    expect(instruction).toContain("only where a successful save would normally deal half damage");
    expect(instruction).toContain("does not prevent attack-roll or automatic damage");
    expect(instruction).toContain("target HP and saves are not changed automatically");
  });

  it("reads protection parameters from content rather than a class-specific formula", () => {
    const { input, rulesPackage } = setup(6, "srd521.spell.web");
    const feature = rulesPackage.entities.find(({ id }) => id === featureId);
    if (!feature) throw new Error("Missing Sculpt Spells");
    feature.body = {
      ...featureAutomationBodySchema.parse(feature.body),
      spellProtection: {
        school: "conjuration",
        additionalTargets: 3,
        requiresSight: true,
        othersOnly: true,
        automaticSaveSuccess: true,
        noDamageOnSuccessfulHalfSave: true,
      },
    };
    const proposal = proposeSpellCast(input, {
      spellId: "srd521.spell.web",
      slotLevel: 2,
      protectedCreatureCount: 5,
    });
    expect(proposal.applicable).toBe(true);
    expect(proposal.protection?.maximumCreatures).toBe(5);
  });

  it.each([-1, 1.5, Number.NaN])("rejects malformed protection counts %s", (count) => {
    const { input, character } = setup();
    const original = structuredClone(character);
    expect(() =>
      proposeSpellCast(input, {
        spellId: "srd521.spell.fireball",
        slotLevel: 3,
        protectedCreatureCount: count,
      }),
    ).toThrow();
    expect(character).toEqual(original);
  });
});
