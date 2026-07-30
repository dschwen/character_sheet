import { z } from "zod";

import type {
  CalculationTrace,
  JsonScalar,
  SourceReference,
  TraceNode,
} from "@dnd/calculation-trace";
import {
  characterDocumentSchema,
  type CharacterDocument,
  type CharacterLevel,
} from "@dnd/character-model";
import type { AuthoringIr, ContentEntity, DraftRule, Expr, Predicate } from "@dnd/content-schema";
import type {
  ActionSummary,
  CharacterEvaluation,
  D20TestSummary,
  DerivedValue,
  EvaluateCharacterInput,
  LoadedRulesPackage,
  ProficiencyEntry,
  ProficiencyLevel,
  ResourceInstance,
  ValidationMessage,
} from "@dnd/rules-api";

import { proficiencyContribution, resolveProficiencyLevel, resolveRollMode } from "./d20.js";
import { ExpressionEvaluator } from "./evaluator.js";

const abilities = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

type Ability = (typeof abilities)[number];

const skillDefinitions = [
  { id: "acrobatics", ability: "dexterity" },
  { id: "animal-handling", ability: "wisdom" },
  { id: "arcana", ability: "intelligence" },
  { id: "athletics", ability: "strength" },
  { id: "deception", ability: "charisma" },
  { id: "history", ability: "intelligence" },
  { id: "insight", ability: "wisdom" },
  { id: "intimidation", ability: "charisma" },
  { id: "investigation", ability: "intelligence" },
  { id: "medicine", ability: "wisdom" },
  { id: "nature", ability: "intelligence" },
  { id: "perception", ability: "wisdom" },
  { id: "performance", ability: "charisma" },
  { id: "persuasion", ability: "charisma" },
  { id: "religion", ability: "intelligence" },
  { id: "sleight-of-hand", ability: "dexterity" },
  { id: "stealth", ability: "dexterity" },
  { id: "survival", ability: "wisdom" },
] as const satisfies readonly { id: string; ability: Ability }[];

const skillEntityPrefix = "srd521.skill.";

const classBodySchema = z
  .object({
    hitPointDie: z.number().int().positive(),
    savingThrowProficiencies: z.array(z.enum(abilities)).default([]),
    skillProficiencyChoice: z
      .object({
        minimum: z.number().int().min(0),
        maximum: z.number().int().min(0),
        options: z.array(z.string()),
      })
      .optional(),
    progression: z.array(
      z.object({
        level: z.number().int().min(1).max(20),
        features: z.array(
          z.object({
            name: z.string(),
            entityId: z.string().nullable(),
          }),
        ),
      }),
    ),
  })
  .passthrough();

const tableBodySchema = z.object({ entries: z.record(z.number()) });
const resourceParametersSchema = z
  .object({ recharge: z.array(z.unknown()).default([]) })
  .passthrough();
const actionParametersSchema = z.object({ actionEconomy: z.string().optional() }).passthrough();
const resistanceParametersSchema = z.object({ damageTypes: z.array(z.string()) }).passthrough();
const validationParametersSchema = z
  .object({
    forbids: z.array(z.string()).default([]),
    severity: z.enum(["error", "warning", "info"]).default("error"),
  })
  .passthrough();

interface EngineState {
  readonly facts: Record<string, JsonScalar>;
  readonly values: Record<string, DerivedValue>;
  readonly traces: Record<string, CalculationTrace>;
  readonly validations: ValidationMessage[];
  readonly resources: ResourceInstance[];
  readonly actions: ActionSummary[];
  readonly resistances: Set<string>;
  readonly proficiencies: {
    readonly savingThrows: Record<string, ProficiencyEntry>;
    readonly skills: Record<string, ProficiencyEntry>;
  };
  readonly d20Tests: Record<string, D20TestSummary>;
}

interface PackageIndex {
  readonly entities: Map<string, ContentEntity>;
  readonly authoringIr: AuthoringIr[];
  readonly tables: Record<string, Readonly<Record<string, JsonScalar>>>;
  readonly packages: LoadedRulesPackage[];
}

function addValidation(
  state: EngineState,
  code: string,
  message: string,
  paths: string[],
  severity: "error" | "warning" | "info" = "error",
): void {
  state.validations.push({
    id: `${code.toLowerCase()}-${String(state.validations.length + 1)}`,
    severity,
    code,
    message: { en: message },
    paths,
  });
}

function requireNumber(value: JsonScalar, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must evaluate to a finite number`);
  }
  return value;
}

function sourceReferences(ir: AuthoringIr): SourceReference[] {
  return ir.source.map((source) => ({
    entityId: ir.id,
    sourceId: source.sourceId,
    page: source.page,
    ...(source.blocks === undefined ? {} : { blocks: source.blocks }),
    quoteHash: source.quoteHash,
  }));
}

function entitySourceReferences(entity: ContentEntity): SourceReference[] {
  return entity.source.map((source) => ({
    entityId: entity.id,
    sourceId: source.sourceId,
    page: source.page,
    ...(source.blocks === undefined ? {} : { blocks: source.blocks }),
    quoteHash: source.quoteHash,
  }));
}

function withRuleSource(trace: CalculationTrace, ir: AuthoringIr): CalculationTrace {
  return { ...trace, sourceReferences: sourceReferences(ir) };
}

function prefixNodes(prefix: string, nodes: TraceNode[]): TraceNode[] {
  return nodes.map((node) => ({ ...node, id: `${prefix}.${node.id}` }));
}

function evaluateExpression(
  expression: Expr,
  traceId: string,
  state: EngineState,
  index: PackageIndex,
  entities: ReadonlySet<string>,
  resourceAmounts?: Readonly<Record<string, number>>,
): CalculationTrace {
  const result = new ExpressionEvaluator({
    facts: state.facts,
    tables: index.tables,
    entities,
    ...(resourceAmounts === undefined ? {} : { resourceAmounts }),
  }).evaluate(expression, traceId);
  state.traces[traceId] = result.trace;
  return result.trace;
}

function evaluatePredicate(
  predicate: Predicate,
  traceId: string,
  state: EngineState,
  index: PackageIndex,
  entities: ReadonlySet<string>,
  resourceAmounts?: Readonly<Record<string, number>>,
): CalculationTrace {
  const result = new ExpressionEvaluator({
    facts: state.facts,
    tables: index.tables,
    entities,
    ...(resourceAmounts === undefined ? {} : { resourceAmounts }),
  }).evaluatePredicate(predicate, traceId);
  state.traces[traceId] = result.trace;
  return result.trace;
}

function buildPackageIndex(packages: LoadedRulesPackage[]): PackageIndex {
  const entities = new Map<string, ContentEntity>();
  const authoringIr: AuthoringIr[] = [];
  const tables: Record<string, Readonly<Record<string, JsonScalar>>> = {};
  for (const rulesPackage of packages) {
    for (const entity of rulesPackage.entities) {
      if (entities.has(entity.id)) {
        throw new Error(`Duplicate content entity ID: ${entity.id}`);
      }
      entities.set(entity.id, entity);
      if (entity.kind === "rule-table") {
        tables[entity.id] = tableBodySchema.parse(entity.body).entries;
      }
    }
    authoringIr.push(...(rulesPackage.authoringIr ?? []));
  }
  return { entities, authoringIr, tables, packages };
}

function validatePackagePins(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): void {
  for (const pinned of character.ruleset.packages) {
    const loaded = index.packages.find(
      (candidate) =>
        candidate.manifest.id === pinned.id && candidate.manifest.version === pinned.version,
    );
    if (loaded === undefined) {
      addValidation(
        state,
        "RULESET_PACKAGE_MISSING",
        `Pinned rules package ${pinned.id}@${pinned.version} is not loaded.`,
        ["ruleset.packages"],
      );
    } else if (loaded.manifest.source.sha256 !== pinned.sha256) {
      addValidation(
        state,
        "RULESET_PACKAGE_HASH_MISMATCH",
        `Pinned rules package ${pinned.id} does not match the loaded source hash.`,
        ["ruleset.packages"],
      );
    }
  }
}

function materializeFacts(character: CharacterDocument, state: EngineState): Map<string, number> {
  const classLevels = new Map<string, number>();
  for (const level of character.build.levels) {
    classLevels.set(level.classId, (classLevels.get(level.classId) ?? 0) + 1);
  }
  state.facts["character.level"] = character.build.levels.length;
  for (const [classId, count] of classLevels) {
    const className = classId.split(".").at(-1);
    if (className !== undefined) {
      state.facts[`classLevel.${className}`] = count;
    }
  }
  for (const ability of abilities) {
    state.facts[`ability.${ability}.score`] = character.build.abilityScores[ability];
  }
  state.facts["equipment.wearingArmor"] = character.loadout.equippedItemIds.some((itemId) =>
    itemId.includes(".armor."),
  );
  state.facts["equipment.wearingHeavyArmor"] = character.loadout.equippedItemIds.some((itemId) =>
    itemId.includes(".armor.heavy."),
  );
  state.facts["state.rage.active"] = character.state.activeEffectIds.includes(
    "srd521.effect.barbarian.rage",
  );
  state.facts["state.concentrating"] = character.state.concentrationSpellId !== undefined;
  return classLevels;
}

function evaluateAbilities(state: EngineState): void {
  for (const ability of abilities) {
    const traceId = `ability.${ability}.modifier`;
    const expression: Expr = {
      kind: "floor",
      value: {
        kind: "multiply",
        args: [
          {
            kind: "add",
            args: [
              { kind: "ref", path: `ability.${ability}.score` },
              { kind: "literal", value: -10 },
            ],
          },
          { kind: "literal", value: 0.5 },
        ],
      },
    };
    const result = new ExpressionEvaluator({ facts: state.facts }).evaluate(expression, traceId);
    const modifier = requireNumber(result.value, traceId);
    state.facts[traceId] = modifier;
    state.values[traceId] = { value: modifier, traceId };
    state.traces[traceId] = result.trace;
  }
}

function evaluateProficiency(state: EngineState): void {
  const traceId = "proficiencyBonus";
  const expression: Expr = {
    kind: "add",
    args: [
      { kind: "literal", value: 2 },
      {
        kind: "floor",
        value: {
          kind: "multiply",
          args: [
            {
              kind: "add",
              args: [
                { kind: "ref", path: "character.level" },
                { kind: "literal", value: -1 },
              ],
            },
            { kind: "literal", value: 0.25 },
          ],
        },
      },
    ],
  };
  const result = new ExpressionEvaluator({ facts: state.facts }).evaluate(expression, traceId);
  const bonus = requireNumber(result.value, traceId);
  state.facts[traceId] = bonus;
  state.values[traceId] = { value: bonus, traceId };
  state.traces[traceId] = result.trace;
}

function normalizedSkillId(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function proficiencyEntry(
  level: ProficiencyLevel,
  proficiencyBonus: number,
  sources: string[],
): ProficiencyEntry {
  return {
    level,
    bonus: proficiencyContribution(level, proficiencyBonus),
    sources: [...new Set(sources)].sort(),
  };
}

function referencesForSources(sources: readonly string[], index: PackageIndex): SourceReference[] {
  return [...new Set(sources)].flatMap((sourceId) => {
    const entity = index.entities.get(sourceId);
    return entity === undefined ? [] : entitySourceReferences(entity);
  });
}

function recordD20Test(
  testId: string,
  ability: Ability,
  proficiency: ProficiencyEntry,
  context: EvaluateCharacterInput["context"],
  sourceReferencesForTest: SourceReference[],
  state: EngineState,
): void {
  const abilityModifier = requireNumber(
    state.facts[`ability.${ability}.modifier`] ?? null,
    `${ability} modifier`,
  );
  const modifier = abilityModifier + proficiency.bonus;
  const effects = context?.d20RollEffects?.filter((effect) => effect.testId === testId) ?? [];
  const advantageSources = effects
    .filter((effect) => effect.kind === "advantage")
    .map((effect) => effect.source);
  const disadvantageSources = effects
    .filter((effect) => effect.kind === "disadvantage")
    .map((effect) => effect.source);
  const rollMode = resolveRollMode(advantageSources, disadvantageSources);
  const traceId = testId;
  state.traces[traceId] = {
    id: traceId,
    result: modifier,
    nodes: [
      {
        id: `${traceId}.ability`,
        operation: "apply-ability-modifier",
        inputs: [ability, abilityModifier],
        output: abilityModifier,
      },
      {
        id: `${traceId}.proficiency`,
        operation: "apply-proficiency",
        inputs: [proficiency.level, proficiency.bonus],
        output: proficiency.bonus,
      },
      {
        id: `${traceId}.total`,
        operation: "add",
        inputs: [abilityModifier, proficiency.bonus],
        output: modifier,
      },
      {
        id: `${traceId}.roll-mode`,
        operation: "resolve-advantage-disadvantage",
        inputs: [advantageSources, disadvantageSources],
        output: rollMode,
      },
    ],
    sourceReferences: sourceReferencesForTest,
  };
  state.facts[testId] = modifier;
  state.values[testId] = { value: modifier, traceId };
  state.d20Tests[testId] = {
    id: testId,
    ability,
    modifier,
    proficiency,
    rollMode,
    advantageSources,
    disadvantageSources,
    traceId,
  };
}

function evaluateD20Tests(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
  context: EvaluateCharacterInput["context"],
): void {
  const proficiencyBonus = requireNumber(state.facts.proficiencyBonus ?? null, "Proficiency Bonus");
  const firstClassId = character.build.levels[0]?.classId;
  const firstClassEntity =
    firstClassId === undefined ? undefined : index.entities.get(firstClassId);
  const firstClassBody =
    firstClassEntity?.kind === "class" ? classBodySchema.parse(firstClassEntity.body) : undefined;

  const selectedSkillIds = new Set(
    character.build.proficiencyChoices.skills.map((choice) => choice.skillId),
  );
  const expertiseSkillIds = new Set(
    character.build.proficiencyChoices.expertise.map((choice) => choice.skillId),
  );
  const knownSkillIds = new Set(skillDefinitions.map((skill) => `${skillEntityPrefix}${skill.id}`));

  for (const choice of [
    ...character.build.proficiencyChoices.skills,
    ...character.build.proficiencyChoices.expertise,
  ]) {
    if (!knownSkillIds.has(choice.skillId)) {
      addValidation(
        state,
        "UNKNOWN_SKILL_PROFICIENCY",
        `${choice.skillId} is not a recognized skill.`,
        ["build.proficiencyChoices"],
      );
    }
    if (!index.entities.has(choice.sourceId)) {
      addValidation(
        state,
        "PROFICIENCY_SOURCE_MISSING",
        `Proficiency source ${choice.sourceId} is not loaded.`,
        ["build.proficiencyChoices"],
      );
    }
  }

  if (firstClassId !== undefined && firstClassBody?.skillProficiencyChoice !== undefined) {
    const classChoices = character.build.proficiencyChoices.skills.filter(
      (choice) => choice.sourceId === firstClassId,
    );
    const allowed = new Set(
      firstClassBody.skillProficiencyChoice.options.map(
        (option) => `${skillEntityPrefix}${normalizedSkillId(option)}`,
      ),
    );
    if (
      classChoices.length < firstClassBody.skillProficiencyChoice.minimum ||
      classChoices.length > firstClassBody.skillProficiencyChoice.maximum
    ) {
      addValidation(
        state,
        "CLASS_SKILL_PROFICIENCY_COUNT",
        `${firstClassId} requires ${String(firstClassBody.skillProficiencyChoice.minimum)} skill proficiency choices.`,
        ["build.proficiencyChoices.skills"],
      );
    }
    for (const choice of classChoices) {
      if (!allowed.has(choice.skillId)) {
        addValidation(
          state,
          "CLASS_SKILL_PROFICIENCY_NOT_ALLOWED",
          `${choice.skillId} is not available from ${firstClassId}.`,
          ["build.proficiencyChoices.skills"],
        );
      }
    }
  }

  for (const ability of abilities) {
    const proficient = firstClassBody?.savingThrowProficiencies.includes(ability) ?? false;
    const sources = proficient && firstClassId !== undefined ? [firstClassId] : [];
    const entry = proficiencyEntry(
      resolveProficiencyLevel(proficient ? ["proficient"] : []),
      proficiencyBonus,
      sources,
    );
    state.proficiencies.savingThrows[ability] = entry;
    recordD20Test(
      `savingThrow.${ability}`,
      ability,
      entry,
      context,
      referencesForSources(sources, index),
      state,
    );
  }

  for (const skill of skillDefinitions) {
    const entityId = `${skillEntityPrefix}${skill.id}`;
    const proficiencySources = character.build.proficiencyChoices.skills
      .filter((choice) => choice.skillId === entityId)
      .map((choice) => choice.sourceId);
    const expertiseSources = character.build.proficiencyChoices.expertise
      .filter((choice) => choice.skillId === entityId)
      .map((choice) => choice.sourceId);
    const contributions: ProficiencyLevel[] = [
      ...(selectedSkillIds.has(entityId) ? (["proficient"] as const) : []),
      ...(expertiseSkillIds.has(entityId) ? (["expertise"] as const) : []),
    ];
    const sources = [...proficiencySources, ...expertiseSources];
    const entry = proficiencyEntry(
      resolveProficiencyLevel(contributions),
      proficiencyBonus,
      sources,
    );
    state.proficiencies.skills[skill.id] = entry;
    recordD20Test(
      `skill.${skill.id}`,
      skill.ability,
      entry,
      context,
      referencesForSources(sources, index),
      state,
    );
  }

  const noProficiency = proficiencyEntry("none", proficiencyBonus, []);
  recordD20Test("initiative", "dexterity", noProficiency, context, [], state);

  const perception = state.d20Tests["skill.perception"];
  if (perception !== undefined) {
    const traceId = "passive.perception";
    const value = 10 + perception.modifier;
    state.traces[traceId] = {
      id: traceId,
      result: value,
      nodes: [
        {
          id: `${traceId}.base`,
          operation: "passive-check-base",
          inputs: [],
          output: 10,
        },
        {
          id: `${traceId}.add-modifier`,
          operation: "add",
          inputs: [10, perception.modifier],
          output: value,
        },
      ],
      sourceReferences: state.traces[perception.traceId]?.sourceReferences ?? [],
    };
    state.facts[traceId] = value;
    state.values[traceId] = { value, traceId };
  }
}

function hitPointBase(
  level: CharacterLevel,
  hitPointDie: number,
  state: EngineState,
  levelIndex: number,
): number {
  if (levelIndex === 0) {
    return hitPointDie;
  }
  if (level.hitPointChoice === "fixed") {
    return Math.floor(hitPointDie / 2) + 1;
  }
  if (level.hitPointRoll === undefined) {
    addValidation(
      state,
      "HIT_POINT_VALUE_MISSING",
      `Character level ${String(level.characterLevel)} requires a hit-point value.`,
      [`build.levels.${String(levelIndex)}.hitPointRoll`],
    );
    return 0;
  }
  return level.hitPointRoll;
}

function evaluateHitPoints(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): void {
  const constitutionModifier = requireNumber(
    state.facts["ability.constitution.modifier"] ?? null,
    "Constitution modifier",
  );
  const nodes: TraceNode[] = [];
  const sources: SourceReference[] = [];
  let maximum = 0;
  character.build.levels.forEach((level, levelIndex) => {
    const classEntity = index.entities.get(level.classId);
    if (classEntity?.kind !== "class") {
      addValidation(state, "CLASS_ENTITY_MISSING", `Class entity ${level.classId} is not loaded.`, [
        `build.levels.${String(levelIndex)}.classId`,
      ]);
      return;
    }
    const classBody = classBodySchema.parse(classEntity.body);
    const base = hitPointBase(level, classBody.hitPointDie, state, levelIndex);
    const contribution = Math.max(1, base + constitutionModifier);
    maximum += contribution;
    nodes.push({
      id: `hitPoints.maximum.level-${String(level.characterLevel)}`,
      operation: "hit-point-level-contribution",
      inputs: [base, constitutionModifier],
      output: contribution,
      label: `Character level ${String(level.characterLevel)}`,
    });
    sources.push(
      ...classEntity.source.map((source) => ({
        entityId: classEntity.id,
        sourceId: source.sourceId,
        page: source.page,
        ...(source.blocks === undefined ? {} : { blocks: source.blocks }),
        quoteHash: source.quoteHash,
      })),
    );
  });
  const traceId = "hitPoints.maximum";
  nodes.push({
    id: `${traceId}.total`,
    operation: "add",
    inputs: nodes.map((node) => node.output),
    output: maximum,
  });
  state.traces[traceId] = {
    id: traceId,
    result: maximum,
    nodes,
    sourceReferences: sources,
  };
  state.facts[traceId] = maximum;
  state.values[traceId] = { value: maximum, traceId };
  if (character.state.currentHitPoints > maximum) {
    addValidation(
      state,
      "CURRENT_HP_ABOVE_MAXIMUM",
      "Current Hit Points exceed the calculated maximum.",
      ["state.currentHitPoints"],
    );
  }
  if (character.state.currentHitPoints < 0) {
    addValidation(state, "CURRENT_HP_BELOW_ZERO", "Current Hit Points cannot be below zero.", [
      "state.currentHitPoints",
    ]);
  }
}

function grantedFeatureIds(classLevels: Map<string, number>, index: PackageIndex): Set<string> {
  const granted = new Set<string>();
  for (const [classId, classLevel] of classLevels) {
    const entity = index.entities.get(classId);
    if (entity?.kind !== "class") {
      continue;
    }
    const body = classBodySchema.parse(entity.body);
    for (const row of body.progression) {
      if (row.level > classLevel) {
        continue;
      }
      for (const feature of row.features) {
        if (feature.entityId !== null) {
          granted.add(feature.entityId);
        }
      }
    }
  }
  return granted;
}

function applicableRules(
  index: PackageIndex,
  granted: ReadonlySet<string>,
): { ir: AuthoringIr; rule: DraftRule }[] {
  return index.authoringIr.flatMap((ir) =>
    granted.has(ir.id) ? ir.proposedRules.map((rule) => ({ ir, rule })) : [],
  );
}

function evaluateResources(
  character: CharacterDocument,
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  granted: ReadonlySet<string>,
  index: PackageIndex,
  state: EngineState,
): Record<string, number> {
  const remaining: Record<string, number> = {};
  for (const { ir, rule } of rules) {
    if (rule.type !== "grant-resource" || rule.expression === undefined) {
      continue;
    }
    const resourceId = rule.target ?? rule.id;
    const maximumTraceId = `${resourceId}.maximum`;
    const maximumTrace = evaluateExpression(rule.expression, maximumTraceId, state, index, granted);
    state.traces[maximumTraceId] = withRuleSource(maximumTrace, ir);
    const maximum = requireNumber(maximumTrace.result as JsonScalar, maximumTraceId);
    const expended = character.state.expendedResources[resourceId] ?? 0;
    if (expended > maximum) {
      addValidation(
        state,
        "RESOURCE_EXPENDED_ABOVE_MAXIMUM",
        `Expended ${resourceId} uses exceed its maximum.`,
        [`state.expendedResources.${resourceId}`],
      );
    }
    const current = Math.max(0, maximum - expended);
    const traceId = `${resourceId}.current`;
    state.traces[traceId] = {
      id: traceId,
      result: current,
      nodes: [
        ...prefixNodes(maximumTraceId, maximumTrace.nodes),
        {
          id: `${traceId}.subtract`,
          operation: "subtract-expended",
          inputs: [maximum, expended],
          output: current,
        },
      ],
      sourceReferences: sourceReferences(ir),
    };
    const parameters = resourceParametersSchema.parse(rule.parameters);
    state.resources.push({
      id: resourceId,
      maximum,
      expended,
      current,
      recharge: parameters.recharge,
      traceId,
    });
    state.values[maximumTraceId] = { value: maximum, traceId: maximumTraceId };
    state.values[traceId] = { value: current, traceId };
    state.facts[maximumTraceId] = maximum;
    state.facts[traceId] = current;
    remaining[resourceId] = current;
  }
  return remaining;
}

function evaluateArmorClass(
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  granted: ReadonlySet<string>,
  index: PackageIndex,
  state: EngineState,
): void {
  const candidates: {
    id: string;
    applicable: boolean;
    value?: number;
    rejectionReasons: string[];
    trace: CalculationTrace;
    sourceReferences: SourceReference[];
  }[] = [];
  const baseTrace = new ExpressionEvaluator({ facts: state.facts }).evaluate(
    {
      kind: "add",
      args: [
        { kind: "literal", value: 10 },
        { kind: "ref", path: "ability.dexterity.modifier" },
      ],
    },
    "armorClass.base",
  );
  candidates.push({
    id: "base-unarmored",
    applicable: true,
    value: requireNumber(baseTrace.value, "Base Armor Class"),
    rejectionReasons: [],
    trace: baseTrace.trace,
    sourceReferences: [],
  });
  for (const { ir, rule } of rules) {
    if (
      rule.type !== "add-candidate-calculation" ||
      rule.target !== "armor-class" ||
      rule.expression === undefined
    ) {
      continue;
    }
    const predicateTrace =
      rule.when === undefined
        ? undefined
        : evaluatePredicate(rule.when, `armorClass.${rule.id}.applicable`, state, index, granted);
    if (predicateTrace?.result === false) {
      candidates.push({
        id: rule.id,
        applicable: false,
        rejectionReasons: ["Applicability predicate evaluated to false."],
        trace: predicateTrace,
        sourceReferences: sourceReferences(ir),
      });
      continue;
    }
    const traceId = `armorClass.${rule.id}.value`;
    const valueTrace = evaluateExpression(rule.expression, traceId, state, index, granted);
    candidates.push({
      id: rule.id,
      applicable: true,
      value: requireNumber(valueTrace.result as JsonScalar, traceId),
      rejectionReasons: [],
      trace: valueTrace,
      sourceReferences: sourceReferences(ir),
    });
  }
  const applicableCandidates = candidates.filter(
    (candidate): candidate is typeof candidate & { value: number } =>
      candidate.applicable && candidate.value !== undefined,
  );
  const selected = applicableCandidates.reduce((best, candidate) =>
    candidate.value > best.value ? candidate : best,
  );
  const traceId = "armorClass";
  state.traces[traceId] = {
    id: traceId,
    result: selected.value,
    nodes: [
      ...candidates.flatMap((candidate) =>
        prefixNodes(`armorClass.${candidate.id}`, candidate.trace.nodes),
      ),
      {
        id: "armorClass.select",
        operation: "select-highest-applicable-candidate",
        inputs: applicableCandidates.map((candidate) => candidate.value),
        output: selected.value,
        label: selected.id,
      },
    ],
    sourceReferences: candidates.flatMap((candidate) => candidate.sourceReferences),
  };
  state.values[traceId] = {
    value: selected.value,
    selectedCandidate: selected.id,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      applicable: candidate.applicable,
      ...(candidate.value === undefined ? {} : { value: candidate.value }),
      rejectionReasons: candidate.rejectionReasons,
    })),
    traceId,
  };
  state.facts[traceId] = selected.value;
}

function evaluateConditionalRules(
  character: CharacterDocument,
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  granted: ReadonlySet<string>,
  resourceAmounts: Readonly<Record<string, number>>,
  index: PackageIndex,
  state: EngineState,
): void {
  for (const { ir, rule } of rules) {
    if (rule.type === "grant-action" && rule.when !== undefined) {
      const traceId = `${rule.target ?? rule.id}.available`;
      const trace = evaluatePredicate(rule.when, traceId, state, index, granted, resourceAmounts);
      state.traces[traceId] = withRuleSource(trace, ir);
      const available = trace.result === true;
      const parameters = actionParametersSchema.parse(rule.parameters);
      state.actions.push({
        id: rule.target ?? rule.id,
        available,
        reasons: available ? [] : ["Action prerequisites are not satisfied."],
        ...(parameters.actionEconomy === undefined
          ? {}
          : { actionEconomy: parameters.actionEconomy }),
        traceId,
      });
    }
    if (rule.type === "grant-resistance" && rule.when !== undefined) {
      const traceId = `${rule.id}.active`;
      const trace = evaluatePredicate(rule.when, traceId, state, index, granted, resourceAmounts);
      state.traces[traceId] = withRuleSource(trace, ir);
      if (trace.result === true) {
        const parameters = resistanceParametersSchema.parse(rule.parameters);
        parameters.damageTypes.forEach((damageType) => state.resistances.add(damageType));
      }
    }
    if (
      rule.type === "add-modifier" &&
      rule.target === "attack.damage.bonus" &&
      rule.expression !== undefined
    ) {
      const traceId = "rage.damageBonus";
      const trace = evaluateExpression(
        rule.expression,
        traceId,
        state,
        index,
        granted,
        resourceAmounts,
      );
      state.traces[traceId] = withRuleSource(trace, ir);
      state.values[traceId] = {
        value: requireNumber(trace.result as JsonScalar, traceId),
        traceId,
      };
    }
    if (rule.type === "add-validation" && rule.when !== undefined) {
      const traceId = `${rule.id}.validation-applicable`;
      const trace = evaluatePredicate(rule.when, traceId, state, index, granted, resourceAmounts);
      state.traces[traceId] = withRuleSource(trace, ir);
      if (trace.result !== true) {
        continue;
      }
      const parameters = validationParametersSchema.parse(rule.parameters);
      if (
        parameters.forbids.includes("concentration") &&
        character.state.concentrationSpellId !== undefined
      ) {
        addValidation(
          state,
          "RAGE_FORBIDS_CONCENTRATION",
          "A character cannot maintain Concentration while Rage is active.",
          ["state.concentrationSpellId", "state.activeEffectIds"],
          parameters.severity,
        );
      }
    }
  }
}

function validateActiveState(character: CharacterDocument, state: EngineState): void {
  if (
    state.facts["state.rage.active"] === true &&
    state.facts["equipment.wearingHeavyArmor"] === true
  ) {
    addValidation(state, "RAGE_WITH_HEAVY_ARMOR", "Rage ends early when Heavy armor is donned.", [
      "state.activeEffectIds",
      "loadout.equippedItemIds",
    ]);
  }
  if (character.build.levels.length === 0) {
    addValidation(state, "CHARACTER_HAS_NO_LEVELS", "The character has no class levels.", [
      "build.levels",
    ]);
  }
}

export function evaluateCharacter(input: EvaluateCharacterInput): CharacterEvaluation {
  const character = characterDocumentSchema.parse(input.character);
  const index = buildPackageIndex(input.packages);
  const state: EngineState = {
    facts: {},
    values: {},
    traces: {},
    validations: [],
    resources: [],
    actions: [],
    resistances: new Set<string>(),
    proficiencies: {
      savingThrows: {},
      skills: {},
    },
    d20Tests: {},
  };
  validatePackagePins(character, index, state);
  const classLevels = materializeFacts(character, state);
  evaluateAbilities(state);
  evaluateProficiency(state);
  evaluateD20Tests(character, index, state, input.context);
  evaluateHitPoints(character, index, state);
  const granted = grantedFeatureIds(classLevels, index);
  const rules = applicableRules(index, granted);
  const resourceAmounts = evaluateResources(character, rules, granted, index, state);
  evaluateArmorClass(rules, granted, index, state);
  evaluateConditionalRules(character, rules, granted, resourceAmounts, index, state);
  validateActiveState(character, state);
  const coverageWarnings = index.authoringIr
    .filter((ir) => granted.has(ir.id) && ir.review.semantics !== "approved")
    .map((ir) => ({
      entityId: ir.id,
      status: ir.review.semantics,
      message: `${ir.text.title} mechanics are proposed and require semantic review.`,
    }));
  return {
    facts: state.facts,
    values: state.values,
    proficiencies: state.proficiencies,
    d20Tests: state.d20Tests,
    actions: state.actions,
    resources: state.resources,
    resistances: [...state.resistances].sort(),
    validations: state.validations,
    traces: state.traces,
    coverageWarnings,
  };
}
