import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeRest, proposeSpellCast } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  clericId,
  defaultBuilderDraft,
  druidId,
  updateBuilderBackground,
  updateBuilderFeatureChoice,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";
import {
  damageRiderRollRequest,
  spellDamageRollRequest,
  type DamageRiderContext,
} from "./feature-damage-roll";
import { resolveDicePoolRoll } from "./dice-roll";

const options = { id: "divine-primal-seven", now: new Date("2026-10-10T12:00:00Z") };
const definitions = [
  {
    classId: clericId,
    slug: "cleric",
    feature: "blessed-strikes",
    strike: "divine-strike",
    cantrip: "srd521.spell.sacred-flame",
    page: 38,
  },
  {
    classId: druidId,
    slug: "druid",
    feature: "elemental-fury",
    strike: "primal-strike",
    cantrip: "srd521.spell.produce-flame",
    page: 43,
  },
] as const;
type Definition = (typeof definitions)[number];
const choiceId = (definition: Definition) =>
  `srd521.choice.${definition.slug}.${definition.feature}`;
const optionId = (definition: Definition, option: string) =>
  `srd521.option.${definition.slug}.${definition.feature}.${option}`;
function setup(definition: Definition, level = 7, choice = "potent-spellcasting") {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(definition.classId, catalog, level, "Blessed Caster");
  if (level >= 7)
    draft.featureChoiceSelections = {
      ...draft.featureChoiceSelections,
      [choiceId(definition)]: [optionId(definition, choice)],
    };
  if (!draft.learnedSpellIds.includes(definition.cantrip))
    draft.learnedSpellIds[0] = definition.cantrip;
  const character = buildCharacter(draft, rulesPackage, options);
  const input = { character, packages: [rulesPackage] };
  return { rulesPackage, catalog, character, input, draft, evaluation: evaluateCharacter(input) };
}

describe.each(definitions)("$slug level 7 and shared battle blessings", (definition) => {
  it.each(["potent-spellcasting", definition.strike])(
    "advances with %s, preserving play state and previous choices",
    (choice) => {
      const { character, catalog, rulesPackage } = setup(definition, 6);
      character.state.currentHitPoints = 13;
      character.state.expendedSpellSlots["2"] = 2;
      const draft = createLevelUpDraft(character, catalog);
      draft.featureChoiceSelections = {
        ...draft.featureChoiceSelections,
        [choiceId(definition)]: [optionId(definition, choice)],
      };
      const next = levelUpCharacter(character, draft, rulesPackage, options);
      const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
      expect(evaluation.validations).toEqual([]);
      expect(next.state).toEqual(character.state);
      expect(next.loadout.inventory).toEqual(character.loadout.inventory);
      expect(next.build.levels.slice(0, 6)).toEqual(character.build.levels);
      expect(next.build.levels[6]?.selectedFeatureChoices).toContainEqual({
        choiceId: choiceId(definition),
        optionIds: [optionId(definition, choice)],
      });
      expect(evaluation.values["hitPoints.maximum"]?.value).toBe(52);
      expect(evaluation.spellcasting).toMatchObject({
        preparedSpellLimit: 11,
        slots: [
          { level: 1, maximum: 4 },
          { level: 2, maximum: 3 },
          { level: 3, maximum: 3 },
          { level: 4, maximum: 1 },
        ],
      });
      expect(levelUpEligibility(next, catalog)).toMatchObject({
        eligible: true,
        currentLevel: 7,
        targetLevel: 8,
      });
    },
  );

  it("adds Wisdom once to class-cantrip damage without changing its dice, attack, or DC", () => {
    const { evaluation, input, character } = setup(definition);
    const spell = evaluation.spells.find(({ id }) => id === definition.cantrip);
    const damage = spell?.damage[0];
    if (!spell || !damage) throw new Error("Missing test cantrip damage");
    const bonus = spell.castingOptions?.[0]?.cantripDamageBonuses?.[0];
    expect(bonus).toMatchObject({
      amount: 3,
      sourceId: optionId(definition, "potent-spellcasting"),
    });
    expect(evaluation.traces[bonus?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: definition.page })]),
    );
    const request = spellDamageRollRequest(spell, damage, definition.classId);
    expect(request).toMatchObject({ diceCount: 2, diceSize: 8, modifier: 3 });
    expect(resolveDicePoolRoll(request, [2, 5]).total).toBe(10);
    expect(
      spellDamageRollRequest(spell, { ...damage, bonus: 2 }, definition.classId).modifier,
    ).toBe(5);
    expect(evaluation.attackDamageRiders).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({ attackBonus: 6, saveDifficultyClass: 14 });
    expect(evaluateCharacter(input).spells).toEqual(evaluation.spells);
    expect(character.state.expendedSpellSlots).toEqual({});
    for (const leveled of evaluation.spells.filter(({ level }) => level > 0))
      expect(
        leveled.castingOptions?.flatMap((option) => option.cantripDamageBonuses ?? []),
      ).toEqual([]);
  });

  it("retains negative Wisdom modifiers and clamps rolled damage at zero", () => {
    const { character, input } = setup(definition);
    character.build.abilityScores.wisdom = 1;
    const evaluation = evaluateCharacter(input);
    const spell = evaluation.spells.find(({ id }) => id === definition.cantrip);
    const damage = spell?.damage[0];
    if (!spell || !damage) throw new Error("Missing cantrip");
    const request = spellDamageRollRequest(spell, damage);
    expect(request.modifier).toBe(-4);
    expect(resolveDicePoolRoll(request, [1, 1]).total).toBe(0);
  });

  it("offers a separate, source-linked rider instead of a permanent weapon damage bonus", () => {
    const { evaluation, character, input } = setup(definition, 7, definition.strike);
    const rider = evaluation.attackDamageRiders?.[0];
    if (!rider) throw new Error("Missing rider");
    expect(rider).toMatchObject({
      diceCount: 1,
      diceSize: 8,
      frequency: "once-on-each-of-your-turns",
      sourceId: optionId(definition, definition.strike),
    });
    expect(evaluation.traces[rider.traceId]?.sourceReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ page: definition.page })]),
    );
    for (const damageType of rider.damageTypes) {
      const context: DamageRiderContext = {
        damageType,
        attackKind: "weapon",
        hitCreature: true,
        ownTurn: true,
        unusedThisTurn: true,
        critical: false,
      };
      expect(damageRiderRollRequest(rider, context)).toMatchObject({
        diceCount: 1,
        diceSize: 8,
        modifier: 0,
      });
      const critical = damageRiderRollRequest(rider, { ...context, critical: true });
      expect(resolveDicePoolRoll(critical, [3, 7]).total).toBe(10);
      expect(critical.diceCount).toBe(2);
    }
    const potent = setup(definition).evaluation;
    expect(evaluation.attacks).toEqual(potent.attacks);
    expect(
      evaluation.spells.flatMap(
        (spell) =>
          spell.castingOptions?.flatMap((option) => option.cantripDamageBonuses ?? []) ?? [],
      ),
    ).toEqual([]);
    expect(evaluateCharacter(input).attackDamageRiders).toEqual(evaluation.attackDamageRiders);
    expect(character.state.expendedResources).toEqual({});
  });

  it.each(["no-hit", "other-turn", "already-used", "unarmed", "spell", "wrong-type"])(
    "rejects the ineligible rider context %s",
    (invalid) => {
      const { evaluation } = setup(definition, 7, definition.strike);
      const rider = evaluation.attackDamageRiders?.[0];
      if (!rider) throw new Error("Missing rider");
      const context: DamageRiderContext = {
        damageType: rider.damageTypes[0] ?? "",
        attackKind: "weapon",
        hitCreature: true,
        ownTurn: true,
        unusedThisTurn: true,
        critical: false,
      };
      if (invalid === "no-hit") context.hitCreature = false;
      if (invalid === "other-turn") context.ownTurn = false;
      if (invalid === "already-used") context.unusedThisTurn = false;
      if (invalid === "unarmed" || invalid === "spell") context.attackKind = invalid;
      if (invalid === "wrong-type") context.damageType = "acid";
      expect(() => damageRiderRollRequest(rider, context)).toThrow();
    },
  );

  it.each(["early", "both", "missing", "foreign-choice"])(
    "does not grant mechanics for invalid selection %s",
    (invalid) => {
      const { character, input } = setup(definition);
      const selection = character.build.levels[6]?.selectedFeatureChoices.find(
        ({ choiceId: id }) => id === choiceId(definition),
      );
      if (!selection) throw new Error("Missing choice");
      if (invalid === "early") {
        const first = character.build.levels[0];
        const seventh = character.build.levels[6];
        if (!first || !seventh) throw new Error("Missing levels");
        seventh.selectedFeatureChoices = [];
        first.selectedFeatureChoices.push(selection);
      }
      if (invalid === "both") selection.optionIds.push(optionId(definition, definition.strike));
      if (invalid === "missing") selection.optionIds = [];
      if (invalid === "foreign-choice") selection.choiceId = "srd521.choice.foreign";
      const evaluation = evaluateCharacter(input);
      expect(
        evaluation.validations.some(({ code }) => code === "FEATURE_OPTION_CHOICE_INVALID"),
      ).toBe(true);
      expect(evaluation.attackDamageRiders).toEqual([]);
      expect(
        evaluation.spells.flatMap(
          (spell) =>
            spell.castingOptions?.flatMap((option) => option.cantripDamageBonuses ?? []) ?? [],
        ),
      ).toEqual([]);
    },
  );

  it("does not grant either option before level 7, or allow rest-time switching", () => {
    const earlier = setup(definition, 6).evaluation;
    expect(earlier.attackDamageRiders).toEqual([]);
    expect(
      earlier.spells.flatMap(
        (spell) =>
          spell.castingOptions?.flatMap((option) => option.cantripDamageBonuses ?? []) ?? [],
      ),
    ).toEqual([]);
    const { input, character } = setup(definition);
    const proposal = proposeRest(input, {
      event: "long-rest",
      featureChoiceReplacements: [
        { choiceId: choiceId(definition), optionIds: [optionId(definition, definition.strike)] },
      ],
    });
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.changes).toEqual([]);
  });
});

describe("class-scoped cantrips and fourth-level subclass spells", () => {
  it("does not enhance a shared Magic Initiate cantrip cast through the feat", () => {
    const definition = definitions[0];
    const { rulesPackage, catalog } = setup(definition);
    const draft = updateBuilderBackground(
      defaultBuilderDraft(clericId, catalog, 7, "Shared Cantrip"),
      catalog,
      "srd521.background.acolyte",
    );
    draft.learnedSpellIds[0] = definition.cantrip;
    draft.learnedSpellIds = [...new Set(draft.learnedSpellIds)];
    if (draft.learnedSpellIds.length < 4) draft.learnedSpellIds.push("srd521.spell.thaumaturgy");
    const featId = "srd521.feat.origin.magic-initiate.cleric";
    const magic = draft.magicInitiateChoices[featId];
    if (!magic) throw new Error("Missing Magic Initiate");
    draft.magicInitiateChoices = {
      ...draft.magicInitiateChoices,
      [featId]: { ...magic, cantripIds: [definition.cantrip, "srd521.spell.guidance"] },
    };
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations).toEqual([]);
    const spell = evaluation.spells.find(({ id }) => id === definition.cantrip);
    const damage = spell?.damage[0];
    if (!spell || !damage) throw new Error("Missing shared cantrip");
    expect(spellDamageRollRequest(spell, damage, clericId).modifier).toBe(
      evaluation.facts["ability.wisdom.modifier"],
    );
    expect(spellDamageRollRequest(spell, damage, featId).modifier).toBe(0);
    expect(() => spellDamageRollRequest(spell, damage, "foreign-source")).toThrow();
  });

  it("limits Beast-form rider eligibility to Primal Strike", () => {
    for (const definition of definitions) {
      const rider = setup(definition, 7, definition.strike).evaluation.attackDamageRiders?.[0];
      if (!rider) throw new Error("Missing rider");
      const context: DamageRiderContext = {
        attackKind: "wild-shape-beast",
        damageType: rider.damageTypes[0] ?? "",
        hitCreature: true,
        ownTurn: true,
        unusedThisTurn: true,
        critical: false,
      };
      if (definition.classId === druidId)
        expect(damageRiderRollRequest(rider, context).diceCount).toBe(1);
      else expect(() => damageRiderRollRequest(rider, context)).toThrow();
    }
  });

  it("always prepares the level-7 Life spells outside normal preparation", () => {
    const { character, input, evaluation } = setup(definitions[0]);
    expect(evaluation.spellcasting?.alwaysPreparedSpells).toBe(8);
    for (const spellId of ["srd521.spell.aura-of-life", "srd521.spell.death-ward"]) {
      expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
        prepared: true,
        level: 4,
      });
      expect(character.loadout.preparedSpellIds).not.toContain(spellId);
      const cast = proposeSpellCast(input, { spellId, slotLevel: 4 });
      expect(cast.applicable).toBe(true);
      expect(cast.nextState.expendedSpellSlots["4"]).toBe(1);
    }
  });

  it.each([
    ["arid", "blight"],
    ["polar", "ice-storm"],
    ["temperate", "freedom-of-movement"],
    ["tropical", "polymorph"],
  ])("supports the level-7 %s Circle spell and Natural Recovery", (land, slug) => {
    const { rulesPackage, catalog } = setup(definitions[1]);
    const draft = updateBuilderFeatureChoice(
      defaultBuilderDraft(druidId, catalog, 7, "Land Caster"),
      catalog,
      "srd521.choice.druid.circle-of-land",
      `srd521.option.druid.land.${land}`,
    );
    const character = buildCharacter(draft, rulesPackage, options);
    const input = { character, packages: [rulesPackage] };
    const evaluation = evaluateCharacter(input);
    expect(evaluation.validations).toEqual([]);
    const spellId = `srd521.spell.${slug}`;
    expect(evaluation.spells.find(({ id }) => id === spellId)).toMatchObject({
      prepared: true,
      level: 4,
    });
    const cast = proposeSpellCast(input, {
      spellId,
      useFreeCast: true,
      castingSourceId: "srd521.subclass-feature.druid.circle-of-the-land.natural-recovery",
    });
    expect(cast.applicable).toBe(true);
    expect(cast.nextState.expendedSpellSlots).toEqual({});
    const recovery = evaluation.spellSlotRecoveries?.[0];
    if (!recovery) throw new Error("Missing Natural Recovery");
    character.state.expendedSpellSlots["4"] = 1;
    const rest = proposeRest(input, {
      event: "short-rest",
      spellSlotRecoveries: [{ sourceId: recovery.sourceId, slots: [{ level: 4, count: 1 }] }],
    });
    expect(rest.applicable).toBe(true);
    expect(rest.nextState.expendedSpellSlots["4"]).toBe(0);
  });
});
