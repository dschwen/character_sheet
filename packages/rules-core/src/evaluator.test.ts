import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Expr } from "@dnd/content-schema";

import { EvaluationError, ExpressionEvaluator } from "./index.js";

const literal = (value: number): Expr => ({ kind: "literal", value });

describe("ExpressionEvaluator", () => {
  it("calculates an ability modifier with floor semantics and a trace", () => {
    const evaluator = new ExpressionEvaluator({ facts: { "ability.strength.score": 9 } });
    const result = evaluator.evaluate({
      kind: "floor",
      value: {
        kind: "multiply",
        args: [
          {
            kind: "add",
            args: [{ kind: "ref", path: "ability.strength.score" }, literal(-10)],
          },
          literal(0.5),
        ],
      },
    });

    expect(result.value).toBe(-1);
    expect(result.trace.nodes.map((node) => node.operation)).toEqual([
      "ref",
      "literal",
      "add",
      "literal",
      "multiply",
      "floor",
    ]);
  });

  it("uses only the selected if branch", () => {
    const evaluator = new ExpressionEvaluator({ facts: {} });
    const result = evaluator.evaluate({
      kind: "if",
      condition: {
        kind: "equals",
        left: { kind: "literal", value: true },
        right: { kind: "literal", value: true },
      },
      then: literal(12),
      else: { kind: "ref", path: "missing.fact" },
    });

    expect(result.value).toBe(12);
  });

  it("detects fact cycles and reports the complete cycle", () => {
    const evaluator = new ExpressionEvaluator({
      facts: {
        "derived.a": { kind: "ref", path: "derived.b" },
        "derived.b": { kind: "ref", path: "derived.a" },
      },
    });

    try {
      evaluator.evaluate({ kind: "ref", path: "derived.a" });
      expect.fail("Expected fact cycle evaluation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluationError);
      if (!(error instanceof EvaluationError)) {
        throw error;
      }
      expect(error.code).toBe("CYCLE_DETECTED");
      expect(error.path).toEqual(["derived.a", "derived.b", "derived.a"]);
    }
  });

  it("enforces operation limits", () => {
    const evaluator = new ExpressionEvaluator({ facts: {} }, { maxOperations: 2 });

    expect(() => evaluator.evaluate({ kind: "add", args: [literal(1), literal(2)] })).toThrowError(
      EvaluationError,
    );
  });

  it("evaluates entity, equipment, tag, and resource predicates", () => {
    const evaluator = new ExpressionEvaluator({
      facts: {},
      entities: new Set(["srd521.feature.rage"]),
      equippedItems: new Set(["srd521.equipment.shield"]),
      resourceAmounts: { "srd521.resource.rage": 2 },
      tags: { "srd521.equipment.shield": ["shield", "armor"] },
    });

    const result = evaluator.evaluatePredicate({
      kind: "all",
      args: [
        { kind: "hasEntity", entityId: "srd521.feature.rage" },
        { kind: "isEquipped", itemId: "srd521.equipment.shield" },
        { kind: "resourceAvailable", resourceId: "srd521.resource.rage" },
        {
          kind: "hasTag",
          subject: { kind: "literal", value: "srd521.equipment.shield" },
          tag: "armor",
        },
      ],
    });

    expect(result.value).toBe(true);
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000, max: 1_000 }), { minLength: 1, maxLength: 30 }),
        (values) => {
          const evaluator = new ExpressionEvaluator({ facts: {} });
          const expression: Expr = { kind: "add", args: values.map(literal) };
          expect(evaluator.evaluate(expression)).toEqual(evaluator.evaluate(expression));
        },
      ),
    );
  });

  it("ability modifiers never decrease when a score increases by two", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 28 }), (score) => {
        const modifier = (value: number): number => {
          const evaluator = new ExpressionEvaluator({ facts: { score: value } });
          return evaluator.evaluate({
            kind: "floor",
            value: {
              kind: "multiply",
              args: [
                { kind: "add", args: [{ kind: "ref", path: "score" }, literal(-10)] },
                literal(0.5),
              ],
            },
          }).value as number;
        };

        expect(modifier(score + 2)).toBeGreaterThanOrEqual(modifier(score));
      }),
    );
  });
});
