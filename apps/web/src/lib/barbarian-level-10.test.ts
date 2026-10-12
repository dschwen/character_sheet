import { describe, expect, it } from "vitest";
import { evaluateCharacter, eligibleReactionAttack, resolveReactionAttack } from "@dnd/rules-core";
import { reactionAttackSchema } from "@dnd/content-schema";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  barbarianId,
  fighterId,
} from "./character-builder";
import { createLevelUpDraft, levelUpCharacter } from "./character-level-up";
import { loadWebData } from "./server-data";
import { weaponDamageRollRequest } from "./weapon-damage-roll";

const options = { id: "barbarian-ten", now: new Date("2026-10-12T18:00:00Z") };
function setup(level = 10, classId: typeof barbarianId | typeof fighterId = barbarianId) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const character = buildCharacter(
    defaultBuilderDraft(classId, catalog, level, "Retaliating Berserker"),
    rulesPackage,
    options,
  );
  const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
  const attack =
    evaluation.attacks.find(({ weaponId }) => weaponId === "srd521.equipment.weapon.greataxe") ??
    evaluation.attacks[0];
  if (!attack) throw new Error("Missing greataxe");
  const declaration = {
    attackId: attack.id,
    damageTaken: 1,
    sourceIsCreature: true,
    distanceFeet: 5,
    reactionAvailable: true,
  };
  return { rulesPackage, catalog, character, evaluation, attack, declaration };
}

describe("Barbarian level 10 and declared Retaliation", () => {
  it("grants the level-10 progression and source-linked reaction", () => {
    const { character, evaluation } = setup();
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(evaluation.values.proficiencyBonus?.value).toBe(4);
    expect(character.loadout.selectedWeaponMasteryIds).toHaveLength(4);
    expect(evaluation.facts["attackAction.attacks"]).toBe(2);
    expect(
      evaluation.resources.find(({ id }) => id === "srd521.resource.barbarian.rage"),
    ).toMatchObject({ maximum: 4 });
    const action = evaluation.actions.find(({ id }) => id === "action.retaliation");
    expect(action).toMatchObject({
      available: true,
      actionEconomy: "reaction",
      parameters: { reactionAttack: { rangeFeet: 5, attackCount: 1 } },
    });
    expect(evaluation.traces[action?.traceId ?? ""]?.sourceReferences).toContainEqual(
      expect.objectContaining({ page: 30 }),
    );
    expect(evaluation.actions.some(({ id }) => id.includes("intimidating-presence"))).toBe(false);
  });
  it.each([1, 9])("does not grant Retaliation at level %i", (level) => {
    expect(setup(level).evaluation.actions.some(({ id }) => id === "action.retaliation")).toBe(
      false,
    );
  });
  it("does not grant Retaliation to another class", () => {
    const { evaluation, declaration } = setup(10, fighterId);
    expect(() => resolveReactionAttack(evaluation, "action.retaliation", declaration)).toThrow();
  });
  it("advances 9→10 without refilling resources or replacing prior choices", () => {
    const { character, catalog, rulesPackage } = setup(9);
    character.state.currentHitPoints = 7;
    character.state.expendedResources["srd521.resource.barbarian.rage"] = 4;
    const before = structuredClone(character);
    const advanced = levelUpCharacter(
      character,
      createLevelUpDraft(character, catalog),
      rulesPackage,
      options,
    );
    expect(character).toEqual(before);
    expect(advanced.state).toEqual(before.state);
    expect(advanced.build.levels.slice(0, 9)).toEqual(before.build.levels);
    expect(advanced.build.featIds).toEqual(before.build.featIds);
    expect(advanced.loadout.inventory).toEqual(before.loadout.inventory);
    expect(advanced.loadout.selectedWeaponMasteryIds).toHaveLength(4);
  });
  it.each([0, 5])(
    "authorizes exactly one attack at distance %i without Rage or state mutation",
    (distanceFeet) => {
      const { evaluation, declaration, character } = setup();
      const before = structuredClone(character);
      const result = resolveReactionAttack(evaluation, "action.retaliation", {
        ...declaration,
        distanceFeet,
      });
      expect(result.attackCount).toBe(1);
      expect(result.trace.sourceReferences).toContainEqual(expect.objectContaining({ page: 30 }));
      expect(character).toEqual(before);
    },
  );
  it("accepts Unarmed Strike but rejects ranged and unequipped attacks", () => {
    const { evaluation, declaration, attack } = setup();
    expect(
      resolveReactionAttack(evaluation, "action.retaliation", {
        ...declaration,
        attackId: "attack.unarmed-strike",
      }).attackCount,
    ).toBe(1);
    const action = evaluation.actions.find(({ id }) => id === "action.retaliation");
    if (!action) throw new Error("Missing action");
    expect(eligibleReactionAttack(action, { ...attack, attackType: "ranged" })).toBe(false);
    expect(() =>
      resolveReactionAttack(evaluation, action.id, { ...declaration, attackId: "unequipped" }),
    ).toThrow();
  });
  it.each([
    { damageTaken: 0 },
    { damageTaken: -1 },
    { damageTaken: 0.5 },
    { sourceIsCreature: false },
    { reactionAvailable: false },
    { distanceFeet: 6 },
    { distanceFeet: -1 },
    { distanceFeet: Infinity },
    { distanceFeet: NaN },
  ])("rejects invalid trigger %j", (change) => {
    const { evaluation, declaration } = setup();
    expect(() =>
      resolveReactionAttack(evaluation, "action.retaliation", { ...declaration, ...change }),
    ).toThrow();
  });
  it.each(["actions.disabled", "deathSave.dead"])("blocks %s", (fact) => {
    const { evaluation, declaration } = setup();
    expect(() =>
      resolveReactionAttack(
        { ...evaluation, facts: { ...evaluation.facts, [fact]: true } },
        "action.retaliation",
        declaration,
      ),
    ).toThrow();
  });
  it("is metadata driven and rejects hidden additional costs", () => {
    const { evaluation, declaration } = setup();
    const action = evaluation.actions.find(({ id }) => id === "action.retaliation");
    if (!action) throw new Error("Missing action");
    action.id = "action.custom-reaction";
    expect(resolveReactionAttack(evaluation, action.id, declaration).attackCount).toBe(1);
    action.parameters = { ...action.parameters, resourceId: "cost" };
    expect(() => resolveReactionAttack(evaluation, action.id, declaration)).toThrow(
      /resource costs/,
    );
  });
  it.each(["incapacitated", "paralyzed", "stunned", "unconscious"])(
    "blocks the actual %s condition",
    (condition) => {
      const { character, rulesPackage, declaration } = setup();
      character.state.conditionIds.push(`srd521.condition.${condition}`);
      const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
      expect(() => resolveReactionAttack(evaluation, "action.retaliation", declaration)).toThrow();
    },
  );
  it("still works with all Rage uses spent, and uses Rage Damage only while raging", () => {
    const { character, rulesPackage, attack, declaration } = setup();
    character.state.expendedResources["srd521.resource.barbarian.rage"] = 4;
    const spent = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(resolveReactionAttack(spent, "action.retaliation", declaration).attackCount).toBe(1);
    character.state.activeEffectIds.push("srd521.effect.barbarian.rage");
    const raging = evaluateCharacter({ character, packages: [rulesPackage] });
    expect(raging.attacks.find(({ id }) => id === attack.id)?.damage.bonus).toBe(
      attack.damage.bonus + 3,
    );
  });
  it("uses existing normal and critical weapon pools, doubling dice only", () => {
    const { attack } = setup();
    const normal = weaponDamageRollRequest(attack);
    const critical = weaponDamageRollRequest(attack, undefined, true);
    expect(critical.modifier).toBe(normal.modifier);
    expect(critical.diceCount).toBe(normal.diceCount * 2);
    expect(critical.diceSize).toBe(normal.diceSize);
  });
  it("rejects unsupported trigger and multiple attacks in metadata", () => {
    expect(
      reactionAttackSchema.safeParse({
        trigger: "damaged-by-creature",
        rangeFeet: 5,
        attackCount: 2,
        attackTypes: ["melee"],
        attackKinds: ["weapon"],
      }).success,
    ).toBe(false);
  });
});
