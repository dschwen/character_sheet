import { readFileSync } from "node:fs";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  authoringIrSchema,
  contentEntitySchema,
  type DraftRule,
  type Expr,
  type Predicate,
} from "@dnd/content-schema";

import { ExpressionEvaluator } from "./index.js";

const generatedRoot = new URL("../../content-srd-5.2.1/generated/", import.meta.url);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, generatedRoot), "utf8"));
}

function requireRule(rules: DraftRule[], id: string): DraftRule {
  const rule = rules.find((candidate) => candidate.id === id);
  if (rule === undefined) {
    throw new Error(`Missing draft rule: ${id}`);
  }
  return rule;
}

function requireExpression(rule: DraftRule): Expr {
  if (rule.expression === undefined) {
    throw new Error(`Draft rule has no expression: ${rule.id}`);
  }
  return rule.expression;
}

function requirePredicate(rule: DraftRule): Predicate {
  if (rule.when === undefined) {
    throw new Error(`Draft rule has no predicate: ${rule.id}`);
  }
  return rule.when;
}

function loadTables(): Record<string, Record<string, number>> {
  const entities = contentEntitySchema.array().parse(readJson("entities.json"));
  const tableBodySchema = z.object({ entries: z.record(z.number()) });
  return Object.fromEntries(
    entities
      .filter((entity) => entity.kind === "rule-table")
      .map((entity) => [entity.id, tableBodySchema.parse(entity.body).entries]),
  );
}

describe("Barbarian draft authoring IR", () => {
  it("derives Rage uses and damage from the extracted progression tables", () => {
    const rage = authoringIrSchema.parse(readJson("authoring-ir/barbarian.rage.json"));
    const tables = loadTables();
    const resource = requireRule(rage.proposedRules, "rage-resource");
    const damage = requireRule(rage.proposedRules, "rage-damage");

    expect(
      new ExpressionEvaluator({
        facts: { "classLevel.barbarian": 1 },
        tables,
      }).evaluate(requireExpression(resource)).value,
    ).toBe(2);
    expect(
      new ExpressionEvaluator({
        facts: { "classLevel.barbarian": 17 },
        tables,
      }).evaluate(requireExpression(resource)).value,
    ).toBe(6);
    expect(
      new ExpressionEvaluator({
        facts: { "classLevel.barbarian": 8 },
        tables,
      }).evaluate(requireExpression(damage)).value,
    ).toBe(2);
    expect(
      new ExpressionEvaluator({
        facts: { "classLevel.barbarian": 16 },
        tables,
      }).evaluate(requireExpression(damage)).value,
    ).toBe(4);
  });

  it("allows entering Rage only with uses available and no Heavy armor", () => {
    const rage = authoringIrSchema.parse(readJson("authoring-ir/barbarian.rage.json"));
    const enterRage = requireRule(rage.proposedRules, "enter-rage");
    const predicate = requirePredicate(enterRage);

    expect(
      new ExpressionEvaluator({
        facts: { "equipment.wearingHeavyArmor": false, "state.rage.active": false },
        resourceAmounts: { "srd521.resource.barbarian.rage": 1 },
      }).evaluatePredicate(predicate).value,
    ).toBe(true);
    expect(
      new ExpressionEvaluator({
        facts: { "equipment.wearingHeavyArmor": true, "state.rage.active": false },
        resourceAmounts: { "srd521.resource.barbarian.rage": 1 },
      }).evaluatePredicate(predicate).value,
    ).toBe(false);
    expect(
      new ExpressionEvaluator({
        facts: { "equipment.wearingHeavyArmor": false, "state.rage.active": false },
        resourceAmounts: { "srd521.resource.barbarian.rage": 0 },
      }).evaluatePredicate(predicate).value,
    ).toBe(false);
  });

  it("evaluates Unarmored Defense as an alternative AC candidate", () => {
    const unarmored = authoringIrSchema.parse(
      readJson("authoring-ir/barbarian.unarmored-defense.json"),
    );
    const candidate = requireRule(unarmored.proposedRules, "barbarian-unarmored-defense");

    const eligible = new ExpressionEvaluator({
      facts: {
        "equipment.wearingArmor": false,
        "ability.dexterity.modifier": 2,
        "ability.constitution.modifier": 3,
      },
    });
    expect(eligible.evaluatePredicate(requirePredicate(candidate)).value).toBe(true);
    expect(eligible.evaluate(requireExpression(candidate)).value).toBe(15);

    const wearingArmor = new ExpressionEvaluator({
      facts: { "equipment.wearingArmor": true },
    });
    expect(wearingArmor.evaluatePredicate(requirePredicate(candidate)).value).toBe(false);
  });
});
