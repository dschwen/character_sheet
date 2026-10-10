import { describe, expect, it, vi } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import type { AttackSummary } from "@dnd/rules-api";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
  barbarianId,
} from "./character-builder";
import { loadWebData } from "./server-data";
import {
  dicePoolRollDetail,
  dicePoolRollExpression,
  resolveDicePoolRoll,
  rollDice,
} from "./dice-roll";
import { rollDiceFullscreen } from "./fullscreen-dice";
import { selectedWeaponDamageMode, weaponDamageRollRequest } from "./weapon-damage-roll";

const prefix = "srd521.feat.fighting-style.";
const options = { id: "conditional-damage", now: new Date("2026-10-10T12:00:00Z") };
function setup(withStyles = true) {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(fighterId, catalog, 7, "Conditional Fighter");
  if (withStyles)
    draft.featureChoiceSelections = {
      "srd521.choice.fighter.fighting-style": [prefix + "great-weapon-fighting"],
      "srd521.choice.fighter.champion.additional-fighting-style": [prefix + "two-weapon-fighting"],
    };
  const character = buildCharacter(draft, rulesPackage, options);
  for (const name of ["quarterstaff", "handaxe", "dagger", "longbow", "hand-crossbow"])
    character.loadout.inventory.push({
      id: `${name}-test`,
      entityId: `srd521.equipment.weapon.${name}`,
      quantity: 1,
    });
  const input = { character, packages: [rulesPackage] };
  const evaluation = evaluateCharacter(input);
  function attack(name: string): AttackSummary {
    const attack = evaluateCharacter(input).attacks.find(
      (attack) => attack.weaponId === `srd521.equipment.weapon.${name}`,
    );
    if (!attack) throw new Error(`Missing test weapon ${name}`);
    return attack;
  }
  return { character, rulesPackage, catalog, input, evaluation, attack };
}

describe("conditional weapon damage modes and physical dice", () => {
  it("applies Great Weapon Fighting to two-handed melee damage, retaining physical values", () => {
    const { attack, evaluation } = setup();
    const greatsword = attack("greatsword");
    const request = weaponDamageRollRequest(greatsword);
    expect(request).toMatchObject({
      diceCount: 2,
      diceSize: 6,
      dieMinimum: { value: 3, sourceName: "Great Weapon Fighting" },
    });
    const physical = [1, 2];
    const result = resolveDicePoolRoll(request, physical);
    expect(physical).toEqual([1, 2]);
    expect(result.dice).toEqual([1, 2]);
    expect(result.effectiveDice).toEqual([3, 3]);
    expect(result.total).toBe(6 + (request.modifier ?? 0));
    expect(dicePoolRollDetail(result)).toContain("1 → 3, 2 → 3 (treated, not rerolled)");
    expect(dicePoolRollExpression(result)).toBe(
      `6 + ${String(request.modifier)} = ${String(result.total)}`,
    );
    expect(evaluation.traces[request.dieMinimum?.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: prefix + "great-weapon-fighting", page: 88 }),
      ]),
    );
    expect(weaponDamageRollRequest(greatsword, "normal").dieMinimum).toBeUndefined();
  });

  it("uses Versatile dice only when two-handed use is declared", () => {
    const { attack, evaluation } = setup();
    const staff = attack("quarterstaff");
    expect(selectedWeaponDamageMode(staff)?.id).toBe("normal");
    expect(weaponDamageRollRequest(staff)).toMatchObject({ diceCount: 1, diceSize: 6 });
    expect(weaponDamageRollRequest(staff).dieMinimum).toBeUndefined();
    const twoHanded = weaponDamageRollRequest(staff, "two-handed");
    expect(twoHanded).toMatchObject({ diceCount: 1, diceSize: 8, dieMinimum: { value: 3 } });
    const mode = selectedWeaponDamageMode(staff, "two-handed");
    expect(evaluation.traces[mode?.damage.traceId ?? ""]?.sourceReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "srd521.weapon-property.versatile", page: 90 }),
      ]),
    );
  });

  it("does not apply a melee-only die minimum to bows, Light attacks, or spells", () => {
    const { attack } = setup();
    expect(weaponDamageRollRequest(attack("longbow")).dieMinimum).toBeUndefined();
    expect(
      weaponDamageRollRequest(attack("handaxe"), "light-extra-attack").dieMinimum,
    ).toBeUndefined();
    expect(
      resolveDicePoolRoll({ label: "Spell", diceCount: 2, diceSize: 6 }, [1, 2]),
    ).toMatchObject({ dice: [1, 2], total: 3 });
  });

  it.each(["handaxe", "dagger", "hand-crossbow"])(
    "adds the ability modifier exactly once for %s extra attacks with the style",
    (name) => {
      const { attack, evaluation } = setup();
      const weapon = attack(name);
      const normal = weaponDamageRollRequest(weapon, "normal");
      const extra = weaponDamageRollRequest(weapon, "light-extra-attack");
      expect(extra.modifier).toBe(normal.modifier);
      const mode = selectedWeaponDamageMode(weapon, "light-extra-attack");
      expect(evaluation.traces[mode?.damage.traceId ?? ""]?.sourceReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entityId: prefix + "two-weapon-fighting", page: 88 }),
          expect.objectContaining({ entityId: "srd521.weapon-property.light", page: 89 }),
        ]),
      );
      expect(mode?.instructions).toContain("different Light weapon");
      expect(mode?.instructions).toContain("One extra attack per turn");
    },
  );

  it("omits positive ability modifiers from ordinary Light extra attacks without the style", () => {
    const { attack } = setup(false);
    const handaxe = attack("handaxe");
    expect(weaponDamageRollRequest(handaxe).modifier).toBeGreaterThan(0);
    expect(weaponDamageRollRequest(handaxe, "light-extra-attack").modifier).toBe(0);
    expect(weaponDamageRollRequest(attack("greatsword")).dieMinimum).toBeUndefined();
  });

  it("keeps negative ability modifiers and clamps weapon damage at zero", () => {
    const { character, attack } = setup(false);
    character.build.abilityScores.strength = 1;
    character.build.abilityScores.dexterity = 1;
    const weapon = attack("handaxe");
    const request = weaponDamageRollRequest(weapon, "light-extra-attack");
    expect(request.modifier).toBeLessThan(0);
    const result = resolveDicePoolRoll(request, [1]);
    expect(result.total).toBe(0);
    expect(dicePoolRollExpression(result)).toContain("max(0,");
  });

  it("doubles only dice for critical hits and treats low physical results without rerolling", async () => {
    const { attack } = setup();
    const request = weaponDamageRollRequest(attack("greatsword"), undefined, true);
    expect(request.diceCount).toBe(4);
    const throwDice = vi.fn(() => Promise.resolve([1, 2, 3, 6]));
    const result = await rollDiceFullscreen(request, throwDice);
    expect(throwDice).toHaveBeenCalledExactlyOnceWith(6, 4);
    expect(result.dice).toEqual([1, 2, 3, 6]);
    expect(result.effectiveDice).toEqual([3, 3, 3, 6]);
    expect(result.total).toBe(15 + (request.modifier ?? 0));
    expect(weaponDamageRollRequest(attack("handaxe"), "light-extra-attack", true)).toMatchObject({
      diceCount: 2,
      modifier: attack("handaxe").damage.bonus,
    });
  });

  it("uses the same treatment for fallback dice", () => {
    const { attack } = setup();
    const request = weaponDamageRollRequest(attack("greatsword"));
    const result = rollDice(request, () => 0);
    expect(result.dice).toEqual([1, 1]);
    expect(result.effectiveDice).toEqual([3, 3]);
  });

  it("rejects unknown modes, occupied shield hands, and missing different Light weapons", () => {
    const { character, attack } = setup();
    expect(() => weaponDamageRollRequest(attack("greatsword"), "light-extra-attack")).toThrow();
    character.loadout.inventory.push({
      id: "shield-test",
      entityId: "srd521.equipment.shield",
      quantity: 1,
    });
    character.loadout.equippedItemIds.push("shield-test");
    expect(() => weaponDamageRollRequest(attack("quarterstaff"), "two-handed")).toThrow("shield");
    expect(() => weaponDamageRollRequest(attack("greatsword"))).toThrow("shield");
    const axe = attack("handaxe");
    character.loadout.inventory = character.loadout.inventory.filter(
      (item) => item.entityId === axe.weaponId,
    );
    character.loadout.equippedItemIds = [];
    expect(() => weaponDamageRollRequest(attack("handaxe"), "light-extra-attack")).toThrow(
      "different owned Light weapon",
    );
    const first = character.loadout.inventory[0];
    if (!first) throw new Error("Missing axe");
    first.quantity = 2;
    expect(weaponDamageRollRequest(attack("handaxe"), "light-extra-attack")).toBeDefined();
  });

  it("reads minimum die results from content instead of a feat-specific constant", () => {
    const { rulesPackage, attack } = setup();
    const feature = rulesPackage.entities.find(({ id }) => id === prefix + "great-weapon-fighting");
    if (!feature || typeof feature.body !== "object" || feature.body === null)
      throw new Error("Missing style");
    feature.body = {
      ...feature.body,
      weaponDamageDieMinimums: [
        { attackType: "melee", anyProperties: ["two-handed"], requiresTwoHands: true, minimum: 4 },
      ],
    };
    expect(weaponDamageRollRequest(attack("greatsword")).dieMinimum?.value).toBe(4);
  });

  it("retains separate Rage damage when suppressing an extra attack's positive ability modifier", () => {
    const { rulesPackage, catalog } = setup(false);
    const character = buildCharacter(
      defaultBuilderDraft(barbarianId, catalog, 6, "Raging axe"),
      rulesPackage,
      options,
    );
    character.loadout.inventory.push({
      id: "rage-axe",
      entityId: "srd521.equipment.weapon.handaxe",
      quantity: 2,
    });
    character.state.activeEffectIds.push("srd521.effect.barbarian.rage");
    const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
    const attack = evaluation.attacks.find(({ itemId }) => itemId === "rage-axe");
    if (!attack) throw new Error("Missing axe");
    expect(weaponDamageRollRequest(attack, "light-extra-attack").modifier).toBe(2);
  });

  it.each([0, -1, 7, 1.5, Number.NaN])("rejects malformed die minima %s", (value) => {
    expect(() =>
      resolveDicePoolRoll(
        { label: "Invalid", diceCount: 1, diceSize: 6, dieMinimum: { value, sourceName: "Test" } },
        [1],
      ),
    ).toThrow();
  });
});
