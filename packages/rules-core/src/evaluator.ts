import type { CalculationTrace, JsonValue, TraceNode, TracedValue } from "@dnd/calculation-trace";
import type { Expr, JsonScalar, Predicate } from "@dnd/content-schema";

import { EvaluationError } from "./errors.js";

export interface EvaluationContext {
  facts: Readonly<Record<string, Expr | JsonScalar>>;
  tables?: Readonly<Record<string, Readonly<Record<string, JsonScalar>>>>;
  entities?: ReadonlySet<string>;
  equippedItems?: ReadonlySet<string>;
  resourceAmounts?: Readonly<Record<string, number>>;
  tags?: Readonly<Record<string, readonly string[]>>;
}

export interface EvaluationLimits {
  maxDepth: number;
  maxOperations: number;
}

const defaultLimits: EvaluationLimits = {
  maxDepth: 64,
  maxOperations: 1_000,
};

interface EvaluationState {
  readonly nodes: TraceNode[];
  readonly resolvingFacts: string[];
  operations: number;
}

function assertNumber(value: JsonScalar, operation: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EvaluationError(
      "TYPE_MISMATCH",
      `${operation} requires finite numeric operands; received ${JSON.stringify(value)}`,
    );
  }
}

function comparisonOperands(
  left: JsonScalar,
  right: JsonScalar,
): [number, number] | [string, string] {
  if (typeof left === "number" && typeof right === "number") {
    return [left, right];
  }
  if (typeof left === "string" && typeof right === "string") {
    return [left, right];
  }
  throw new EvaluationError(
    "TYPE_MISMATCH",
    `Comparison operands must both be numbers or both be strings; received ${typeof left} and ${typeof right}`,
  );
}

export class ExpressionEvaluator {
  readonly #context: EvaluationContext;
  readonly #limits: EvaluationLimits;

  constructor(context: EvaluationContext, limits: Partial<EvaluationLimits> = {}) {
    this.#context = context;
    this.#limits = { ...defaultLimits, ...limits };
  }

  evaluate(expression: Expr, traceId = "expression"): TracedValue<JsonScalar> {
    const state: EvaluationState = {
      nodes: [],
      resolvingFacts: [],
      operations: 0,
    };
    const value = this.#evaluateExpression(expression, state, 0);
    return { value, trace: this.#createTrace(traceId, value, state.nodes) };
  }

  evaluatePredicate(predicate: Predicate, traceId = "predicate"): TracedValue<boolean> {
    const state: EvaluationState = {
      nodes: [],
      resolvingFacts: [],
      operations: 0,
    };
    const value = this.#evaluatePredicate(predicate, state, 0);
    return { value, trace: this.#createTrace(traceId, value, state.nodes) };
  }

  #createTrace(id: string, result: JsonScalar, nodes: TraceNode[]): CalculationTrace {
    return {
      id,
      result,
      nodes,
      sourceReferences: [],
    };
  }

  #beginOperation(state: EvaluationState, depth: number): void {
    if (depth > this.#limits.maxDepth) {
      throw new EvaluationError(
        "DEPTH_LIMIT_EXCEEDED",
        `Expression depth exceeds the configured maximum of ${String(this.#limits.maxDepth)}`,
      );
    }
    state.operations += 1;
    if (state.operations > this.#limits.maxOperations) {
      throw new EvaluationError(
        "OPERATION_LIMIT_EXCEEDED",
        `Evaluation exceeds the configured maximum of ${String(this.#limits.maxOperations)} operations`,
      );
    }
  }

  #record(
    state: EvaluationState,
    operation: string,
    inputs: JsonValue[],
    output: JsonScalar,
    label?: string,
  ): void {
    const node: TraceNode = {
      id: `node-${String(state.nodes.length + 1)}`,
      operation,
      inputs,
      output,
    };
    if (label !== undefined) {
      node.label = label;
    }
    state.nodes.push(node);
  }

  #evaluateExpression(expression: Expr, state: EvaluationState, depth: number): JsonScalar {
    this.#beginOperation(state, depth);

    switch (expression.kind) {
      case "literal": {
        this.#record(state, "literal", [], expression.value);
        return expression.value;
      }
      case "ref": {
        const cycleStart = state.resolvingFacts.indexOf(expression.path);
        if (cycleStart !== -1) {
          const cycle = [...state.resolvingFacts.slice(cycleStart), expression.path];
          throw new EvaluationError(
            "CYCLE_DETECTED",
            `Fact cycle detected: ${cycle.join(" -> ")}`,
            cycle,
          );
        }
        if (!Object.hasOwn(this.#context.facts, expression.path)) {
          throw new EvaluationError("UNKNOWN_FACT", `Unknown fact: ${expression.path}`, [
            expression.path,
          ]);
        }
        const fact = this.#context.facts[expression.path];
        if (fact === undefined) {
          throw new EvaluationError("UNKNOWN_FACT", `Unknown fact: ${expression.path}`, [
            expression.path,
          ]);
        }
        state.resolvingFacts.push(expression.path);
        const value =
          typeof fact === "object" && fact !== null && "kind" in fact
            ? this.#evaluateExpression(fact, state, depth + 1)
            : fact;
        state.resolvingFacts.pop();
        this.#record(state, "ref", [value], value, expression.path);
        return value;
      }
      case "add":
      case "multiply":
      case "min":
      case "max": {
        const values = expression.args.map((arg) =>
          this.#evaluateExpression(arg, state, depth + 1),
        );
        values.forEach((value) => {
          assertNumber(value, expression.kind);
        });
        const numbers = values as number[];
        let result: number;
        switch (expression.kind) {
          case "add":
            result = numbers.reduce((total, value) => total + value, 0);
            break;
          case "multiply":
            result = numbers.reduce((total, value) => total * value, 1);
            break;
          case "min":
            result = Math.min(...numbers);
            break;
          case "max":
            result = Math.max(...numbers);
            break;
        }
        this.#record(state, expression.kind, values, result);
        return result;
      }
      case "floor": {
        const value = this.#evaluateExpression(expression.value, state, depth + 1);
        assertNumber(value, "floor");
        const result = Math.floor(value);
        this.#record(state, "floor", [value], result);
        return result;
      }
      case "if": {
        const condition = this.#evaluatePredicate(expression.condition, state, depth + 1);
        const result = this.#evaluateExpression(
          condition ? expression.then : expression.else,
          state,
          depth + 1,
        );
        this.#record(state, "if", [condition, result], result);
        return result;
      }
      case "tableLookup": {
        const key = this.#evaluateExpression(expression.key, state, depth + 1);
        const table = this.#context.tables?.[expression.table];
        if (table === undefined) {
          throw new EvaluationError("UNKNOWN_TABLE", `Unknown table: ${expression.table}`);
        }
        const normalizedKey = String(key);
        const value = table[normalizedKey];
        if (value === undefined) {
          throw new EvaluationError(
            "UNKNOWN_TABLE_KEY",
            `Unknown key ${normalizedKey} in table ${expression.table}`,
          );
        }
        this.#record(state, "tableLookup", [key], value, expression.table);
        return value;
      }
    }
  }

  #evaluatePredicate(predicate: Predicate, state: EvaluationState, depth: number): boolean {
    this.#beginOperation(state, depth);

    switch (predicate.kind) {
      case "all": {
        const inputs = predicate.args.map((arg) => this.#evaluatePredicate(arg, state, depth + 1));
        const result = inputs.every(Boolean);
        this.#record(state, "predicate.all", inputs, result);
        return result;
      }
      case "any": {
        const inputs = predicate.args.map((arg) => this.#evaluatePredicate(arg, state, depth + 1));
        const result = inputs.some(Boolean);
        this.#record(state, "predicate.any", inputs, result);
        return result;
      }
      case "not": {
        const input = this.#evaluatePredicate(predicate.arg, state, depth + 1);
        const result = !input;
        this.#record(state, "predicate.not", [input], result);
        return result;
      }
      case "equals": {
        const left = this.#evaluateExpression(predicate.left, state, depth + 1);
        const right = this.#evaluateExpression(predicate.right, state, depth + 1);
        const result = left === right;
        this.#record(state, "predicate.equals", [left, right], result);
        return result;
      }
      case "compare": {
        const left = this.#evaluateExpression(predicate.left, state, depth + 1);
        const right = this.#evaluateExpression(predicate.right, state, depth + 1);
        const [comparableLeft, comparableRight] = comparisonOperands(left, right);
        let result: boolean;
        switch (predicate.op) {
          case "lt":
            result = comparableLeft < comparableRight;
            break;
          case "lte":
            result = comparableLeft <= comparableRight;
            break;
          case "gt":
            result = comparableLeft > comparableRight;
            break;
          case "gte":
            result = comparableLeft >= comparableRight;
            break;
        }
        this.#record(state, `predicate.${predicate.op}`, [left, right], result);
        return result;
      }
      case "hasEntity": {
        const result = this.#context.entities?.has(predicate.entityId) ?? false;
        this.#record(state, "predicate.hasEntity", [predicate.entityId], result);
        return result;
      }
      case "hasTag": {
        const subject = this.#evaluateExpression(predicate.subject, state, depth + 1);
        if (typeof subject !== "string") {
          throw new EvaluationError("TYPE_MISMATCH", "hasTag subject must resolve to a string");
        }
        const result = this.#context.tags?.[subject]?.includes(predicate.tag) ?? false;
        this.#record(state, "predicate.hasTag", [subject, predicate.tag], result);
        return result;
      }
      case "isEquipped": {
        const result = this.#context.equippedItems?.has(predicate.itemId) ?? false;
        this.#record(state, "predicate.isEquipped", [predicate.itemId], result);
        return result;
      }
      case "resourceAvailable": {
        const amount = this.#context.resourceAmounts?.[predicate.resourceId] ?? 0;
        const result = amount > 0;
        this.#record(state, "predicate.resourceAvailable", [predicate.resourceId, amount], result);
        return result;
      }
    }
  }
}
