import { describe, expect, it } from "vitest";
import { evaluateCharacter, proposeRest } from "@dnd/rules-core";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  rangerId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter, levelUpEligibility } from "./character-level-up";
import { loadWebData } from "./server-data";

const tactics = "srd521.choice.ranger.defensive-tactics";
const escape = "srd521.option.ranger.defensive-tactics.escape-the-horde";
const defense = "srd521.option.ranger.defensive-tactics.multiattack-defense";
const prey = "srd521.choice.ranger.hunters-prey";
const horde = "srd521.option.ranger.hunters-prey.horde-breaker";
const options = { id: "ranger-seven", now: new Date("2026-10-10T12:00:00Z") };
function setup(level = 7) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(rangerId, catalog, level, "Hunter");
  return { rulesPackage, catalog, draft, character: buildCharacter(draft, rulesPackage, options) };
}

describe("Hunter level 7 and shared rest-replaceable feature options", () => {
  it.each([escape, defense])("creates a legal Hunter choosing %s", (id) => {
    const { rulesPackage, draft } = setup();
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [tactics]: [id] };
    const character = buildCharacter(draft, rulesPackage, options);
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(character.build.levels[6]?.selectedFeatureChoices).toContainEqual({
      choiceId: tactics,
      optionIds: [id],
    });
    const entity = rulesPackage.entities.find((entity) => entity.id === id);
    expect(entity?.source).toEqual(expect.arrayContaining([expect.objectContaining({ page: 61 })]));
    expect(entity?.body).toMatchObject({ automationLevel: "assisted" });
  });

  it("advances without changing play state, possessions, or earlier choices", () => {
    const { rulesPackage, catalog, character } = setup(6);
    character.state.currentHitPoints = 17;
    character.state.expendedSpellSlots["1"] = 2;
    const next = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(next.state).toEqual(character.state);
    expect(next.loadout.inventory).toEqual(character.loadout.inventory);
    expect(next.loadout.preparedSpellIds).toEqual(
      expect.arrayContaining(character.loadout.preparedSpellIds),
    );
    expect(next.build.levels.slice(0, 6)).toEqual(character.build.levels);
    const evaluation = evaluateCharacter({ character: next, packages: [rulesPackage] });
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.spellcasting).toMatchObject({
      preparedSpellLimit: 7,
      slots: [
        { level: 1, maximum: 4 },
        { level: 2, maximum: 3 },
      ],
    });
    expect(levelUpEligibility(next, catalog)).toMatchObject({ eligible: false, currentLevel: 7 });
  });

  it.each(["short-rest", "long-rest"] as const)(
    "replaces both Hunter choices atomically during %s",
    (event) => {
      const { rulesPackage, character } = setup();
      const original = structuredClone(character);
      const proposal = proposeRest(
        { character, packages: [rulesPackage] },
        {
          event,
          featureChoiceReplacements: [
            { choiceId: tactics, optionIds: [defense] },
            { choiceId: prey, optionIds: [horde] },
          ],
        },
      );
      expect(proposal.applicable).toBe(true);
      expect(character).toEqual(original);
      expect(proposal.nextBuild?.levels[6]?.selectedFeatureChoices).toContainEqual({
        choiceId: tactics,
        optionIds: [defense],
      });
      expect(proposal.nextBuild?.levels[2]?.selectedFeatureChoices).toContainEqual({
        choiceId: prey,
        optionIds: [horde],
      });
      expect(Object.values(proposal.traces).flatMap((trace) => trace.sourceReferences)).toEqual(
        expect.arrayContaining([expect.objectContaining({ page: 61 })]),
      );
      expect(
        evaluateCharacter({
          character: {
            ...character,
            build: proposal.nextBuild ?? character.build,
            state: proposal.nextState,
          },
          packages: [rulesPackage],
        }).validations.filter(({ severity }) => severity === "error"),
      ).toEqual([]);
    },
  );

  it.each(
    [[escape, defense], [defense, defense], ["srd521.option.invalid"], []].map((optionIds) => ({
      optionIds,
    })),
  )("rejects invalid options %j without recovering resources", ({ optionIds }) => {
    const { rulesPackage, character } = setup();
    character.state.expendedSpellSlots["1"] = 2;
    const request = {
      event: "long-rest" as const,
      featureChoiceReplacements: [{ choiceId: tactics, optionIds }],
    };
    if (optionIds.length === 0) {
      expect(() => proposeRest({ character, packages: [rulesPackage] }, request)).toThrow();
      return;
    }
    const proposal = proposeRest({ character, packages: [rulesPackage] }, request);
    expect(proposal.applicable).toBe(false);
    expect(proposal.changes).toEqual([]);
    expect(proposal.nextState).toEqual(character.state);
    expect(proposal.nextBuild).toBeUndefined();
  });

  it("rejects a duplicate replacement and a non-rest choice", () => {
    const { rulesPackage, character } = setup();
    for (const replacements of [
      [
        { choiceId: tactics, optionIds: [defense] },
        { choiceId: tactics, optionIds: [escape] },
      ],
      [{ choiceId: "srd521.choice.ranger.fighting-style", optionIds: [escape] }],
    ]) {
      expect(
        proposeRest(
          { character, packages: [rulesPackage] },
          { event: "short-rest", featureChoiceReplacements: replacements },
        ).applicable,
      ).toBe(false);
    }
  });

  it("cannot acquire the level-7 choice during a level-6 rest", () => {
    const { rulesPackage, character } = setup(6);
    expect(
      proposeRest(
        { character, packages: [rulesPackage] },
        {
          event: "short-rest",
          featureChoiceReplacements: [{ choiceId: tactics, optionIds: [defense] }],
        },
      ).applicable,
    ).toBe(false);
    character.build.levels[5]?.selectedFeatureChoices.push({
      choiceId: tactics,
      optionIds: [escape],
    });
    expect(
      evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
        ({ code }) => code,
      ),
    ).toContain("FEATURE_OPTION_CHOICE_INVALID");
  });

  it("rejects early acquisition, missing choices, and foreign subclass selections", () => {
    for (const mutation of ["early", "missing", "foreign"] as const) {
      const { rulesPackage, character } = setup();
      const selections = character.build.levels[6]?.selectedFeatureChoices;
      if (selections === undefined) throw new Error("Missing level 7");
      if (mutation === "early")
        character.build.levels[0]?.selectedFeatureChoices.push(...selections.splice(0));
      if (mutation === "missing") selections.splice(0);
      if (mutation === "foreign") character.build.subclassId = "srd521.subclass.fighter.champion";
      expect(
        evaluateCharacter({ character, packages: [rulesPackage] }).validations.map(
          ({ code }) => code,
        ),
      ).toContain("FEATURE_OPTION_CHOICE_INVALID");
    }
  });

  it("does not change outgoing attack modes or AC for an incoming conditional defense", () => {
    const { rulesPackage, character, draft } = setup();
    const before = evaluateCharacter({ character, packages: [rulesPackage] });
    draft.featureChoiceSelections = { ...draft.featureChoiceSelections, [tactics]: [defense] };
    const after = evaluateCharacter({
      character: buildCharacter(draft, rulesPackage, options),
      packages: [rulesPackage],
    });
    expect(after.attacks).toEqual(before.attacks);
    expect(after.values.armorClass).toEqual(before.values.armorClass);
  });

  it("rejects the whole proposal when resting cannot start", () => {
    const { rulesPackage, character } = setup();
    character.state.currentHitPoints = 0;
    const proposal = proposeRest(
      { character, packages: [rulesPackage] },
      {
        event: "long-rest",
        featureChoiceReplacements: [{ choiceId: tactics, optionIds: [defense] }],
      },
    );
    expect(proposal.applicable).toBe(false);
    expect(proposal.nextBuild).toBeUndefined();
    expect(proposal.nextState).toEqual(character.state);
  });

  it("supports repeated rests without duplicating acquisition records", () => {
    const { rulesPackage, character } = setup();
    let current = character;
    for (const id of [defense, escape, defense]) {
      const proposal = proposeRest(
        { character: current, packages: [rulesPackage] },
        {
          event: "short-rest",
          featureChoiceReplacements: [{ choiceId: tactics, optionIds: [id] }],
        },
      );
      expect(proposal.applicable).toBe(true);
      current = {
        ...current,
        build: proposal.nextBuild ?? current.build,
        state: proposal.nextState,
      };
      expect(
        current.build.levels
          .flatMap((level) => level.selectedFeatureChoices)
          .filter((choice) => choice.choiceId === tactics),
      ).toEqual([{ choiceId: tactics, optionIds: [id] }]);
    }
  });

  it("honors the rest events declared by content rather than a Ranger UI branch", () => {
    const { rulesPackage, character } = setup();
    const modified = structuredClone(rulesPackage);
    const subclass = modified.entities.find((entity) => entity.id === character.build.subclassId);
    if (subclass === undefined) throw new Error("Missing Hunter");
    const body = subclass.body as Record<string, unknown>;
    body.defensiveTacticsChoice = {
      ...(body.defensiveTacticsChoice as Record<string, unknown>),
      changeOn: ["long-rest"],
    };
    const replacements = [{ choiceId: tactics, optionIds: [defense] }];
    expect(
      proposeRest(
        { character, packages: [modified] },
        { event: "short-rest", featureChoiceReplacements: replacements },
      ).applicable,
    ).toBe(false);
    expect(
      proposeRest(
        { character, packages: [modified] },
        { event: "long-rest", featureChoiceReplacements: replacements },
      ).applicable,
    ).toBe(true);
  });
});
