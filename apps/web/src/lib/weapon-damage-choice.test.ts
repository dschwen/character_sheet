import { describe, expect, it, vi } from "vitest";
import { evaluateCharacter } from "@dnd/rules-core";
import { weaponDamageRollChoiceSchema } from "@dnd/content-schema";
import {
  buildCharacter,
  characterBuilderCatalog,
  defaultBuilderDraft,
  fighterId,
} from "./character-builder";
import { loadWebData } from "./server-data";
import { weaponDamageChoiceRequest } from "./weapon-damage-roll";
import {
  chooseDicePoolResult,
  resolveDicePoolChoices,
  rollDicePoolChoices,
} from "./dice-pool-choice";
import { rollDiceChoicesFullscreen } from "./fullscreen-dice";

const featId = "srd521.feat.origin.savage-attacker";
const confirmed = { hitTarget: true, unusedThisTurn: true, critical: false };
function setup() {
  const { rulesPackage } = loadWebData();
  const catalog = characterBuilderCatalog(rulesPackage);
  const draft = defaultBuilderDraft(fighterId, catalog, 4, "Pool choice");
  draft.featureChoiceSelections = {
    "srd521.choice.fighter.fighting-style": ["srd521.feat.fighting-style.great-weapon-fighting"],
  };
  const character = buildCharacter(draft, rulesPackage, {
    id: "pool-choice",
    now: new Date("2026-11-14T12:00:00Z"),
  });
  const input = { character, packages: [rulesPackage] };
  function evaluate() {
    return evaluateCharacter(input);
  }
  function weapon() {
    const attack = evaluate().attacks.find(({ weaponId }) => weaponId.endsWith(".greatsword"));
    if (!attack) throw new Error("Missing weapon");
    return attack;
  }
  return { character, rulesPackage, evaluate, weapon };
}

describe("source-driven weapon-damage pool choices", () => {
  it("grants source-linked choices to owned weapons but never Unarmed Strikes", () => {
    const { evaluate } = setup();
    const evaluation = evaluate();
    expect(evaluation.validations.filter(({ severity }) => severity === "error")).toEqual([]);
    for (const attack of evaluation.attacks) {
      if (attack.properties.includes("unarmed-strike")) {
        expect(attack.damageRollChoices).toBeUndefined();
        continue;
      }
      expect(attack.damageRollChoices).toHaveLength(1);
      const choice = attack.damageRollChoices?.[0];
      expect(choice).toMatchObject({
        sourceId: featId,
        sourceName: "Savage Attacker",
        rollCount: 2,
        selection: "either",
        oncePerTurn: true,
        requiresWeaponHit: true,
      });
      expect(evaluation.traces[choice?.traceId ?? ""]?.sourceReferences).toContainEqual(
        expect.objectContaining({ entityId: featId, page: 87 }),
      );
    }
  });
  it("does not grant choices without the feat, and reads metadata rather than feat names", () => {
    const { character, rulesPackage, weapon } = setup();
    const feat = rulesPackage.entities.find(({ id }) => id === featId);
    if (!feat?.body || typeof feat.body !== "object" || Array.isArray(feat.body))
      throw new Error("Missing feat");
    const originalBody = feat.body;
    feat.name = { en: "Custom pool choice" };
    feat.body = { ...feat.body, weaponDamageRolls: 3 };
    expect(weapon().damageRollChoices?.[0]).toMatchObject({
      sourceName: "Custom pool choice",
      rollCount: 3,
    });
    feat.body = { ...originalBody, trigger: "wrong-trigger" };
    expect(weapon().damageRollChoices).toBeUndefined();
    feat.body = originalBody;
    character.build.featIds = character.build.featIds.filter((id) => id !== featId);
    expect(weapon().damageRollChoices).toBeUndefined();
  });
  it.each([{ hitTarget: false }, { unusedThisTurn: false }])(
    "requires a hit and unused turn declaration: %s",
    (missing) => {
      const { weapon } = setup();
      expect(() =>
        weaponDamageChoiceRequest(weapon(), featId, { ...confirmed, ...missing }),
      ).toThrow(/Confirm/);
    },
  );
  it("rejects unavailable damage modes, ungranted sources, fixed damage and Unarmed Strikes", () => {
    const { weapon, evaluate } = setup();
    const attack = weapon();
    expect(() => weaponDamageChoiceRequest(attack, "fake.feat", confirmed)).toThrow(/eligible/);
    expect(() => weaponDamageChoiceRequest(attack, featId, confirmed, "fake.mode")).toThrow(
      /not available/,
    );
    expect(() =>
      weaponDamageChoiceRequest(
        {
          ...attack,
          damageModes: [],
          damage: { bonus: 3, flat: 1, type: "bludgeoning", traceId: "fixed" },
        },
        featId,
        confirmed,
      ),
    ).toThrow(/no structured damage/);
    const unarmed = evaluate().attacks.find(({ properties }) =>
      properties.includes("unarmed-strike"),
    );
    if (!unarmed) throw new Error("Missing Unarmed Strike");
    expect(() => weaponDamageChoiceRequest(unarmed, featId, confirmed)).toThrow(/eligible/);
  });
  it("doubles weapon dice, not modifiers or riders, on a declared critical hit", () => {
    const { weapon } = setup();
    const ordinary = weaponDamageChoiceRequest(weapon(), featId, confirmed);
    const critical = weaponDamageChoiceRequest(weapon(), featId, { ...confirmed, critical: true });
    expect(ordinary.pool.diceCount).toBe(2);
    expect(critical.pool.diceCount).toBe(4);
    expect(critical.pool.modifier).toBe(ordinary.pool.modifier);
    expect(critical.pool.dieMinimum).toMatchObject({
      value: 3,
      sourceName: "Great Weapon Fighting",
    });
    const results = resolveDicePoolChoices(critical.pool, 2, [1, 2, 5, 6, 2, 4, 3, 1]);
    expect(results.map(({ total }) => total)).toEqual([
      17 + (critical.pool.modifier ?? 0),
      13 + (critical.pool.modifier ?? 0),
    ]);
  });
  it("preserves whole pools and allows choosing the lower total without changing the character", () => {
    const { character } = setup();
    const before = structuredClone(character);
    const dice = [6, 1, 4, 4];
    const candidates = resolveDicePoolChoices(
      { label: "Weapon", diceCount: 2, diceSize: 6, modifier: 3 },
      2,
      dice,
    );
    expect(candidates.map(({ total }) => total)).toEqual([10, 11]);
    expect(chooseDicePoolResult(candidates, 0)).toMatchObject({ dice: [6, 1], total: 10 });
    expect(chooseDicePoolResult(candidates, 1)).toMatchObject({ dice: [4, 4], total: 11 });
    expect(dice).toEqual([6, 1, 4, 4]);
    expect(character).toEqual(before);
    expect(() => chooseDicePoolResult(candidates, 2)).toThrow();
    expect(() => chooseDicePoolResult(candidates, -1)).toThrow();
  });
  it("uses one fullscreen throw, partitions the results and applies modifiers/minima independently", async () => {
    const request = {
      label: "Weapon",
      diceCount: 2,
      diceSize: 6,
      modifier: 3,
      dieMinimum: { value: 3, sourceName: "Style" },
    };
    const throwDice = vi.fn(() => Promise.resolve([1, 2, 6, 5]));
    const candidates = await rollDiceChoicesFullscreen(request, 2, throwDice);
    expect(throwDice).toHaveBeenCalledExactlyOnceWith(6, 4);
    expect(candidates[0]).toMatchObject({ dice: [1, 2], effectiveDice: [3, 3], total: 9 });
    expect(candidates[1]).toMatchObject({ dice: [6, 5], effectiveDice: [6, 5], total: 14 });
    expect(rollDicePoolChoices(request, 2, () => 0)).toEqual(
      resolveDicePoolChoices(request, 2, [1, 1, 1, 1]),
    );
  });
  it("clamps negative totals independently and handles ties without selecting automatically", () => {
    const candidates = resolveDicePoolChoices(
      { label: "Weapon", diceCount: 1, diceSize: 4, modifier: -5, minimumTotal: 0 },
      2,
      [1, 4],
    );
    expect(candidates.map(({ total }) => total)).toEqual([0, 0]);
    expect(chooseDicePoolResult(candidates, 1).dice).toEqual([4]);
  });
  it.each([0, 1, 5, 2.5, Number.NaN])("rejects unsupported pool count %s", (count) => {
    const request = { label: "Weapon", diceCount: 1, diceSize: 6 };
    expect(() => resolveDicePoolChoices(request, count, [])).toThrow();
    expect(() => rollDicePoolChoices(request, count)).toThrow();
    expect(
      weaponDamageRollChoiceSchema.safeParse({
        trigger: "once-per-turn-weapon-hit",
        weaponDamageRolls: count,
        chooseDamageRoll: "either",
      }).success,
    ).toBe(false);
  });
  it.each([[1], [1, 2, 3], [1, 7], [1, 1.5]])(
    "rejects incomplete or invalid physical pools: %s",
    (...dice) => {
      expect(() =>
        resolveDicePoolChoices({ label: "Weapon", diceCount: 1, diceSize: 6 }, 2, dice),
      ).toThrow();
    },
  );
});
