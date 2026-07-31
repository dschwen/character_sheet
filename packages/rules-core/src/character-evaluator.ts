import { z } from "zod";

import type {
  CalculationTrace,
  JsonScalar,
  JsonValue,
  SourceReference,
  TraceNode,
} from "@dnd/calculation-trace";
import {
  characterDocumentSchema,
  type CharacterDocument,
  type CharacterLevel,
  type InventoryItem,
} from "@dnd/character-model";
import type { AuthoringIr, ContentEntity, DraftRule, Expr, Predicate } from "@dnd/content-schema";
import type {
  ActionSummary,
  AttackSummary,
  CharacterEvaluation,
  D20RollEffect,
  D20TestSummary,
  DerivedValue,
  EvaluateCharacterInput,
  InventoryItemSummary,
  LoadedRulesPackage,
  ProficiencyEntry,
  ProficiencyLevel,
  ResourceInstance,
  SpellcastingSummary,
  SpellSummary,
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
    weaponProficiencies: z.array(z.enum(["simple", "martial"])).default([]),
    armorTraining: z.array(z.enum(["light", "medium", "heavy", "shield"])).default([]),
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
        weaponMastery: z.number().int().min(0).optional(),
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

const damageBodySchema = z
  .object({
    diceCount: z.number().int().positive().nullable(),
    diceSize: z.number().int().positive().nullable(),
    flat: z.number().int().nonnegative().nullable(),
    type: z.string().min(1),
  })
  .strict();
const weaponBodySchema = z
  .object({
    category: z.enum(["simple", "martial"]),
    attackType: z.enum(["melee", "ranged"]),
    damage: damageBodySchema,
    properties: z.array(z.string()),
    mastery: z.string().min(1),
    range: z
      .object({
        normal: z.number().int().positive(),
        long: z.number().int().positive(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const armorClassBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), base: z.number().int() }).strict(),
  z
    .object({
      kind: z.literal("formula"),
      base: z.number().int(),
      dexterityCap: z.number().int().nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("bonus"), bonus: z.number().int() }).strict(),
]);
const armorBodySchema = z
  .object({
    category: z.enum(["light", "medium", "heavy", "shield"]),
    armorClass: armorClassBodySchema,
    strengthRequirement: z.number().int().positive().nullable(),
    stealthDisadvantage: z.boolean(),
  })
  .passthrough();

const backgroundBodySchema = z
  .object({
    abilityScoreOptions: z.array(z.enum(abilities)).length(3),
    abilityScoreIncreasePatterns: z.array(z.array(z.number().int().positive())),
    featId: z.string().min(1),
    skillProficiencies: z.array(z.string().min(1)),
  })
  .passthrough();
const speciesBodySchema = z
  .object({
    creatureType: z.string().min(1),
    sizeOptions: z.array(z.enum(["small", "medium", "large"])).min(1),
    walkingSpeed: z.number().int().positive(),
    longRestGrantsHeroicInspiration: z.boolean().default(false),
    skillProficiencyChoice: z
      .object({
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative(),
        options: z.literal("any-skill"),
      })
      .optional(),
    originFeatChoice: z
      .object({
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative(),
        category: z.literal("origin"),
      })
      .optional(),
  })
  .passthrough();
const featBodySchema = z
  .object({
    category: z.string().min(1),
    repeatable: z.boolean().default(false),
    prerequisite: z
      .object({
        minimumCharacterLevel: z.number().int().positive(),
      })
      .optional(),
    abilityScoreIncreasePatterns: z.array(z.array(z.number().int().positive())).optional(),
    maximumAbilityScore: z.number().int().positive().optional(),
    proficiencyChoice: z
      .object({
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative(),
        categories: z.array(z.enum(["skill", "tool"])),
      })
      .optional(),
  })
  .passthrough();
const subclassBodySchema = z
  .object({
    parentClassId: z.string().min(1),
    progression: z.array(
      z
        .object({
          level: z.number().int().min(1).max(20),
          features: z.array(z.string().min(1)),
        })
        .strict(),
    ),
  })
  .passthrough();
const wizardProgressionRowSchema = z
  .object({
    level: z.number().int().min(1).max(20),
    cantrips: z.number().int().nonnegative(),
    preparedSpells: z.number().int().nonnegative(),
    spellSlots: z.record(z.coerce.number().int().min(1).max(9), z.number().int().nonnegative()),
  })
  .passthrough();
const wizardClassBodySchema = z
  .object({
    spellcastingAbility: z.literal("intelligence"),
    spellbookStartingSpells: z.number().int().positive(),
    spellbookSpellsPerLevel: z.number().int().positive(),
    spellList: z.array(z.string().min(1)),
    progression: z.array(wizardProgressionRowSchema),
  })
  .passthrough();
const spellBodySchema = z
  .object({
    level: z.number().int().min(0).max(9),
    school: z.string().min(1),
    classes: z.array(z.string().min(1)),
    wizardSpell: z.boolean(),
    ritual: z.boolean(),
    castingTime: z.string().min(1),
    range: z.string().min(1),
    duration: z.string().min(1),
    concentration: z.boolean(),
    attackType: z.enum(["melee", "ranged"]).nullable(),
    savingThrows: z.array(z.string().min(1)),
  })
  .passthrough();
const tableBodySchema = z.object({ entries: z.record(z.number()) });
const rechargeRuleSchema = z
  .object({
    event: z.enum(["short-rest", "long-rest", "initiative", "dawn", "manual"]),
    amount: z.union([z.number().nonnegative(), z.literal("all")]),
  })
  .strict();
const resourceParametersSchema = z
  .object({ recharge: z.array(rechargeRuleSchema).default([]) })
  .passthrough();
const actionParametersSchema = z
  .object({
    actionEconomy: z.string().optional(),
    spends: z.number().int().positive().optional(),
    resourceId: z.string().min(1).optional(),
    healing: z
      .object({
        diceCount: z.number().int().positive(),
        diceSize: z.number().int().positive(),
        bonusFact: z.string().min(1),
      })
      .strict()
      .optional(),
    damageReroll: z
      .object({
        rolls: z.number().int().min(2),
        choose: z.string().min(1),
        appliesTo: z.string().min(1),
      })
      .strict()
      .optional(),
    grantsAction: z.string().min(1).optional(),
    excludes: z.array(z.string().min(1)).optional(),
    checkBonus: z
      .object({
        diceCount: z.number().int().positive(),
        diceSize: z.number().int().positive(),
      })
      .strict()
      .optional(),
    refundIfCheckStillFails: z.boolean().optional(),
    movement: z
      .object({
        speedFraction: z.number().positive(),
        provokesOpportunityAttacks: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .passthrough();
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
  readonly inventory: InventoryItemSummary[];
  readonly attacks: AttackSummary[];
  readonly spells: SpellSummary[];
  spellcasting?: SpellcastingSummary;
}

interface PackageIndex {
  readonly entities: Map<string, ContentEntity>;
  readonly authoringIr: AuthoringIr[];
  readonly tables: Record<string, Readonly<Record<string, JsonScalar>>>;
  readonly packages: LoadedRulesPackage[];
}

interface ResolvedInventoryItem {
  readonly item: InventoryItem;
  readonly entity?: ContentEntity;
  readonly equipped: boolean;
}

interface EquipmentContext {
  readonly items: ResolvedInventoryItem[];
  readonly armorTraining: ReadonlySet<string>;
  readonly weaponProficiencies: ReadonlySet<string>;
  readonly rollEffects: D20RollEffect[];
}

interface OriginContext {
  readonly background?: ContentEntity;
  readonly backgroundBody?: z.infer<typeof backgroundBodySchema>;
  readonly species?: ContentEntity;
  readonly speciesBody?: z.infer<typeof speciesBodySchema>;
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

function resolveOrigins(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): OriginContext {
  const background =
    character.build.backgroundId === undefined
      ? undefined
      : index.entities.get(character.build.backgroundId);
  const species =
    character.build.speciesId === undefined
      ? undefined
      : index.entities.get(character.build.speciesId);
  if (character.build.backgroundId !== undefined && background?.kind !== "background") {
    addValidation(
      state,
      "BACKGROUND_ENTITY_MISSING",
      `Background entity ${character.build.backgroundId} is not loaded.`,
      ["build.backgroundId"],
    );
  }
  if (character.build.speciesId !== undefined && species?.kind !== "species") {
    addValidation(
      state,
      "SPECIES_ENTITY_MISSING",
      `Species entity ${character.build.speciesId} is not loaded.`,
      ["build.speciesId"],
    );
  }
  const backgroundBody =
    background?.kind === "background" ? backgroundBodySchema.parse(background.body) : undefined;
  const speciesBody =
    species?.kind === "species" ? speciesBodySchema.parse(species.body) : undefined;
  const increases = Object.entries(character.build.backgroundAbilityScoreIncreases) as [
    Ability,
    number,
  ][];
  if (backgroundBody === undefined && increases.length > 0) {
    addValidation(
      state,
      "BACKGROUND_ABILITY_INCREASE_WITHOUT_BACKGROUND",
      "Background ability increases require a loaded background.",
      ["build.backgroundAbilityScoreIncreases"],
    );
  }
  if (background !== undefined && backgroundBody !== undefined) {
    const allowed = new Set(backgroundBody.abilityScoreOptions);
    for (const [ability] of increases) {
      if (!allowed.has(ability)) {
        addValidation(
          state,
          "BACKGROUND_ABILITY_INCREASE_NOT_ALLOWED",
          `${ability} cannot be increased by ${background.id}.`,
          [`build.backgroundAbilityScoreIncreases.${ability}`],
        );
      }
    }
    const selectedPattern = increases
      .map(([, amount]) => amount)
      .sort((left, right) => right - left);
    const patternIsAllowed = backgroundBody.abilityScoreIncreasePatterns.some(
      (pattern) =>
        JSON.stringify([...pattern].sort((left, right) => right - left)) ===
        JSON.stringify(selectedPattern),
    );
    if (!patternIsAllowed) {
      addValidation(
        state,
        "BACKGROUND_ABILITY_INCREASE_PATTERN",
        `${background.id} requires either +2/+1 or +1/+1/+1 ability increases.`,
        ["build.backgroundAbilityScoreIncreases"],
      );
    }
    if (!character.build.featIds.includes(backgroundBody.featId)) {
      addValidation(
        state,
        "BACKGROUND_FEAT_MISSING",
        `${background.id} grants ${backgroundBody.featId}.`,
        ["build.featIds"],
      );
    }
  }
  for (const [ability, increase] of increases) {
    if (character.build.abilityScores[ability] + increase > 20) {
      addValidation(
        state,
        "BACKGROUND_ABILITY_SCORE_ABOVE_MAXIMUM",
        `The ${ability} background increase would raise the score above 20.`,
        [`build.backgroundAbilityScoreIncreases.${ability}`],
      );
    }
  }
  if (species !== undefined && speciesBody !== undefined) {
    if (
      character.build.speciesSize === undefined ||
      !speciesBody.sizeOptions.includes(character.build.speciesSize)
    ) {
      addValidation(
        state,
        "SPECIES_SIZE_INVALID",
        `${species.id} requires one of: ${speciesBody.sizeOptions.join(", ")}.`,
        ["build.speciesSize"],
      );
    }
    const selectedOriginFeats = character.build.featIds.filter((featId) => {
      const entity = index.entities.get(featId);
      return entity?.kind === "feat" && featBodySchema.parse(entity.body).category === "origin";
    });
    const backgroundFeatId = backgroundBody?.featId;
    let backgroundGrantRemaining = backgroundFeatId === undefined ? 0 : 1;
    const versatileSelections = selectedOriginFeats.filter((featId) => {
      if (featId === backgroundFeatId && backgroundGrantRemaining > 0) {
        backgroundGrantRemaining -= 1;
        return false;
      }
      return true;
    });
    const choice = speciesBody.originFeatChoice;
    if (
      choice !== undefined &&
      (versatileSelections.length < choice.minimum || versatileSelections.length > choice.maximum)
    ) {
      addValidation(
        state,
        "SPECIES_ORIGIN_FEAT_COUNT",
        `${species.id} requires ${String(choice.minimum)} additional Origin feat.`,
        ["build.featIds"],
      );
    }
    state.facts["species.creatureType"] = speciesBody.creatureType;
    state.facts["species.size"] = character.build.speciesSize ?? null;
    state.facts["species.longRestGrantsHeroicInspiration"] =
      speciesBody.longRestGrantsHeroicInspiration;
    const resourcefulTraceId = "species.longRestGrantsHeroicInspiration";
    state.traces[resourcefulTraceId] = {
      id: resourcefulTraceId,
      result: speciesBody.longRestGrantsHeroicInspiration,
      nodes: [
        {
          id: `${resourcefulTraceId}.grant`,
          operation: "grant-species-trait",
          inputs: [species.id],
          output: speciesBody.longRestGrantsHeroicInspiration,
          label: "Resourceful",
        },
      ],
      sourceReferences: entitySourceReferences(species),
    };
    const speedTraceId = "speed.walking.base";
    state.facts[speedTraceId] = speciesBody.walkingSpeed;
    state.values[speedTraceId] = { value: speciesBody.walkingSpeed, traceId: speedTraceId };
    state.traces[speedTraceId] = {
      id: speedTraceId,
      result: speciesBody.walkingSpeed,
      nodes: [
        {
          id: `${speedTraceId}.species`,
          operation: "grant-species-walking-speed",
          inputs: [species.id],
          output: speciesBody.walkingSpeed,
        },
      ],
      sourceReferences: entitySourceReferences(species),
    };
  }
  for (const [indexInBuild, featId] of character.build.featIds.entries()) {
    const feat = index.entities.get(featId);
    if (feat?.kind !== "feat") {
      addValidation(state, "FEAT_ENTITY_MISSING", `Feat entity ${featId} is not loaded.`, [
        `build.featIds.${String(indexInBuild)}`,
      ]);
      continue;
    }
    if (
      character.build.featIds.indexOf(featId) !== indexInBuild &&
      !featBodySchema.parse(feat.body).repeatable
    ) {
      addValidation(state, "FEAT_NOT_REPEATABLE", `${featId} can be selected only once.`, [
        `build.featIds.${String(indexInBuild)}`,
      ]);
    }
  }
  return {
    ...(background?.kind === "background" && backgroundBody !== undefined
      ? { background, backgroundBody }
      : {}),
    ...(species?.kind === "species" && speciesBody !== undefined ? { species, speciesBody } : {}),
  };
}

function validateProgressionSelections(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): void {
  const classLevelCounts = new Map<string, number>();
  for (const level of character.build.levels) {
    classLevelCounts.set(level.classId, (classLevelCounts.get(level.classId) ?? 0) + 1);
  }
  const fighterLevel = classLevelCounts.get("srd521.class.fighter") ?? 0;
  const wizardLevel = classLevelCounts.get("srd521.class.wizard") ?? 0;
  const subclass =
    character.build.subclassId === undefined
      ? undefined
      : index.entities.get(character.build.subclassId);
  const subclassParentId =
    subclass?.kind === "subclass"
      ? subclassBodySchema.parse(subclass.body).parentClassId
      : undefined;
  if (fighterLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "FIGHTER_SUBCLASS_REQUIRED",
      "A Fighter of level 3 or higher must select a Fighter subclass.",
      ["build.subclassId"],
    );
  }
  if (fighterLevel < 3 && subclassParentId === "srd521.class.fighter") {
    addValidation(
      state,
      "FIGHTER_SUBCLASS_LEVEL_REQUIRED",
      "A Fighter subclass requires Fighter level 3.",
      ["build.subclassId"],
    );
  }
  if (wizardLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "WIZARD_SUBCLASS_REQUIRED",
      "A Wizard of level 3 or higher must select a Wizard subclass.",
      ["build.subclassId"],
    );
  }
  if (wizardLevel < 3 && subclassParentId === "srd521.class.wizard") {
    addValidation(
      state,
      "WIZARD_SUBCLASS_LEVEL_REQUIRED",
      "A Wizard subclass requires Wizard level 3.",
      ["build.subclassId"],
    );
  }
  if (character.build.subclassId !== undefined && subclass?.kind !== "subclass") {
    addValidation(
      state,
      "SUBCLASS_ENTITY_MISSING",
      `Subclass entity ${character.build.subclassId} is not loaded.`,
      ["build.subclassId"],
    );
  } else if (
    subclass?.kind === "subclass" &&
    (classLevelCounts.get(subclassParentId ?? "") ?? 0) === 0
  ) {
    addValidation(
      state,
      "SUBCLASS_CLASS_MISMATCH",
      `${subclass.id} does not match any of the character's classes.`,
      ["build.subclassId"],
    );
  }

  const characterLevel = character.build.levels.length;
  const selectedGeneralFeats = character.build.featIds.filter((featId) => {
    const feat = index.entities.get(featId);
    return feat?.kind === "feat" && featBodySchema.parse(feat.body).category === "general";
  });
  const grantedGeneralFeatChoices = [...classLevelCounts.entries()].reduce(
    (count, [classId, classLevel]) => {
      const classEntity = index.entities.get(classId);
      if (classEntity?.kind !== "class") {
        return count;
      }
      return (
        count +
        classBodySchema
          .parse(classEntity.body)
          .progression.filter((row) => row.level <= classLevel)
          .flatMap((row) => row.features)
          .filter((feature) => feature.name === "Ability Score Improvement").length
      );
    },
    0,
  );
  if (selectedGeneralFeats.length !== grantedGeneralFeatChoices) {
    addValidation(
      state,
      classLevelCounts.size === 1 && fighterLevel > 0
        ? "FIGHTER_GENERAL_FEAT_CHOICE_COUNT"
        : "GENERAL_FEAT_CHOICE_COUNT",
      `This class progression grants ${String(grantedGeneralFeatChoices)} General feat choice.`,
      ["build.featIds"],
    );
  }
  for (const featId of character.build.featIds) {
    const feat = index.entities.get(featId);
    if (feat?.kind !== "feat") {
      continue;
    }
    const body = featBodySchema.parse(feat.body);
    if (
      body.prerequisite !== undefined &&
      characterLevel < body.prerequisite.minimumCharacterLevel
    ) {
      addValidation(
        state,
        "FEAT_LEVEL_PREREQUISITE",
        `${featId} requires character level ${String(body.prerequisite.minimumCharacterLevel)}.`,
        ["build.featIds"],
      );
    }
  }

  const increases = Object.entries(character.build.featAbilityScoreIncreases) as [
    Ability,
    number,
  ][];
  const abilityIncreaseFeat = character.build.featIds
    .map((featId) => index.entities.get(featId))
    .find(
      (feat): feat is ContentEntity =>
        feat?.kind === "feat" &&
        featBodySchema.parse(feat.body).abilityScoreIncreasePatterns !== undefined,
    );
  if (abilityIncreaseFeat === undefined && increases.length > 0) {
    addValidation(
      state,
      "FEAT_ABILITY_INCREASE_WITHOUT_FEAT",
      "Feat ability increases require a selected feat that grants them.",
      ["build.featAbilityScoreIncreases"],
    );
  }
  if (abilityIncreaseFeat !== undefined) {
    const body = featBodySchema.parse(abilityIncreaseFeat.body);
    const selectedPattern = increases
      .map(([, amount]) => amount)
      .sort((left, right) => right - left);
    const patternIsAllowed = body.abilityScoreIncreasePatterns?.some(
      (pattern) =>
        JSON.stringify([...pattern].sort((left, right) => right - left)) ===
        JSON.stringify(selectedPattern),
    );
    if (patternIsAllowed !== true) {
      addValidation(
        state,
        "FEAT_ABILITY_INCREASE_PATTERN",
        `${abilityIncreaseFeat.id} requires either one +2 or two +1 increases.`,
        ["build.featAbilityScoreIncreases"],
      );
    }
    for (const [ability, increase] of increases) {
      const finalScore =
        character.build.abilityScores[ability] +
        (character.build.backgroundAbilityScoreIncreases[ability] ?? 0) +
        increase;
      if (body.maximumAbilityScore !== undefined && finalScore > body.maximumAbilityScore) {
        addValidation(
          state,
          "FEAT_ABILITY_SCORE_ABOVE_MAXIMUM",
          `${ability} cannot exceed ${String(body.maximumAbilityScore)} from ${abilityIncreaseFeat.id}.`,
          [`build.featAbilityScoreIncreases.${ability}`],
        );
      }
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
    state.facts[`ability.${ability}.score`] =
      character.build.abilityScores[ability] +
      (character.build.backgroundAbilityScoreIncreases[ability] ?? 0) +
      (character.build.featAbilityScoreIncreases[ability] ?? 0);
  }
  const equippedIds = new Set(character.loadout.equippedItemIds);
  const equippedEntityIds = character.loadout.inventory
    .filter((item) => equippedIds.has(item.id))
    .map((item) => item.entityId);
  state.facts["equipment.wearingArmor"] = equippedEntityIds.some((entityId) =>
    entityId.includes(".armor."),
  );
  state.facts["equipment.wearingHeavyArmor"] = equippedEntityIds.some((entityId) =>
    entityId.includes(".armor.heavy."),
  );
  state.facts["state.rage.active"] = character.state.activeEffectIds.includes(
    "srd521.effect.barbarian.rage",
  );
  state.facts["state.concentrating"] = character.state.concentrationSpellId !== undefined;
  state.facts["hitPoints.current"] = character.state.currentHitPoints;
  return classLevels;
}

function startingClassEntity(
  character: CharacterDocument,
  index: PackageIndex,
): ContentEntity | undefined {
  const classId = character.build.levels[0]?.classId;
  const entity = classId === undefined ? undefined : index.entities.get(classId);
  return entity?.kind === "class" ? entity : undefined;
}

function equipmentRollTestIds(ability: Ability): string[] {
  return [
    `savingThrow.${ability}`,
    ...skillDefinitions
      .filter((skill) => skill.ability === ability)
      .map((skill) => `skill.${skill.id}`),
    ...(ability === "dexterity" ? ["initiative"] : []),
  ];
}

function resolveEquipment(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): EquipmentContext {
  const equippedIds = new Set(character.loadout.equippedItemIds);
  const classEntity = startingClassEntity(character, index);
  const classBody = classEntity === undefined ? undefined : classBodySchema.parse(classEntity.body);
  const armorTraining = new Set(classBody?.armorTraining ?? []);
  const weaponProficiencies = new Set(classBody?.weaponProficiencies ?? []);
  const items = character.loadout.inventory.map((item): ResolvedInventoryItem => {
    const entity = index.entities.get(item.entityId);
    if (entity === undefined) {
      addValidation(
        state,
        "INVENTORY_ENTITY_MISSING",
        `Inventory entity ${item.entityId} is not loaded.`,
        ["loadout.inventory"],
      );
    }
    state.inventory.push({
      id: item.id,
      entityId: item.entityId,
      name: entity?.name.en ?? item.entityId,
      quantity: item.quantity,
      equipped: equippedIds.has(item.id),
      kind: entity?.kind ?? "unknown",
    });
    return {
      item,
      ...(entity === undefined ? {} : { entity }),
      equipped: equippedIds.has(item.id),
    };
  });
  const equippedArmor = items.filter(
    (item) => item.equipped && item.entity?.kind === "equipment-armor",
  );
  const equippedShields = items.filter(
    (item) => item.equipped && item.entity?.kind === "equipment-shield",
  );
  if (equippedArmor.length > 1) {
    addValidation(
      state,
      "MULTIPLE_ARMOR_SUITES_EQUIPPED",
      "A character can wear only one suit of armor at a time.",
      ["loadout.equippedItemIds"],
    );
  }
  if (equippedShields.length > 1) {
    addValidation(
      state,
      "MULTIPLE_SHIELDS_EQUIPPED",
      "A character can wield only one Shield at a time.",
      ["loadout.equippedItemIds"],
    );
  }

  const rollEffects: D20RollEffect[] = [];
  let armorSpeedPenalty = 0;
  for (const resolved of [...equippedArmor, ...equippedShields]) {
    const entity = resolved.entity;
    if (entity === undefined) {
      continue;
    }
    const armor = armorBodySchema.parse(entity.body);
    if (armor.category !== "shield" && !armorTraining.has(armor.category)) {
      addValidation(
        state,
        "ARMOR_TRAINING_MISSING",
        `${entity.name.en ?? entity.id} is equipped without ${armor.category} armor training.`,
        ["loadout.equippedItemIds"],
        "warning",
      );
      for (const ability of ["strength", "dexterity"] as const) {
        for (const testId of equipmentRollTestIds(ability)) {
          rollEffects.push({
            testId,
            kind: "disadvantage",
            source: `${entity.id}:untrained`,
          });
        }
      }
    }
    if (armor.category === "shield" && !armorTraining.has("shield")) {
      addValidation(
        state,
        "SHIELD_TRAINING_MISSING",
        `${entity.name.en ?? entity.id} grants no Armor Class benefit without Shield training.`,
        ["loadout.equippedItemIds"],
        "warning",
      );
    }
    if (armor.stealthDisadvantage) {
      rollEffects.push({
        testId: "skill.stealth",
        kind: "disadvantage",
        source: `${entity.id}:stealth`,
      });
    }
    const strengthScore = requireNumber(
      state.facts["ability.strength.score"] ?? null,
      "Strength score",
    );
    if (
      armor.category !== "shield" &&
      armor.strengthRequirement !== null &&
      strengthScore < armor.strengthRequirement
    ) {
      armorSpeedPenalty = -10;
    }
  }
  const speedTraceId = "speed.armorPenalty";
  state.facts[speedTraceId] = armorSpeedPenalty;
  state.values[speedTraceId] = { value: armorSpeedPenalty, traceId: speedTraceId };
  state.traces[speedTraceId] = {
    id: speedTraceId,
    result: armorSpeedPenalty,
    nodes: [
      {
        id: `${speedTraceId}.requirements`,
        operation: "apply-armor-strength-requirement",
        inputs: [
          state.facts["ability.strength.score"] ?? null,
          ...equippedArmor.map((item) => {
            const body = armorBodySchema.parse(item.entity?.body);
            return body.strengthRequirement;
          }),
        ],
        output: armorSpeedPenalty,
      },
    ],
    sourceReferences: equippedArmor.flatMap((item) =>
      item.entity === undefined ? [] : entitySourceReferences(item.entity),
    ),
  };
  return { items, armorTraining, weaponProficiencies, rollEffects };
}

function evaluateWalkingSpeed(state: EngineState): void {
  const base = state.facts["speed.walking.base"];
  const armorPenalty = state.facts["speed.armorPenalty"];
  if (typeof base !== "number" || typeof armorPenalty !== "number") {
    return;
  }
  const traceId = "speed.walking";
  const value = Math.max(0, base + armorPenalty);
  state.facts[traceId] = value;
  state.values[traceId] = { value, traceId };
  state.traces[traceId] = {
    id: traceId,
    result: value,
    nodes: [
      {
        id: `${traceId}.combine`,
        operation: "apply-walking-speed-modifiers",
        inputs: [base, armorPenalty],
        output: value,
      },
    ],
    sourceReferences: [
      ...(state.traces["speed.walking.base"]?.sourceReferences ?? []),
      ...(state.traces["speed.armorPenalty"]?.sourceReferences ?? []),
    ],
  };
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
  additionalRollEffects: readonly D20RollEffect[],
  sourceReferencesForTest: SourceReference[],
  state: EngineState,
): void {
  const abilityModifier = requireNumber(
    state.facts[`ability.${ability}.modifier`] ?? null,
    `${ability} modifier`,
  );
  const modifier = abilityModifier + proficiency.bonus;
  const effects = [
    ...(context?.d20RollEffects?.filter((effect) => effect.testId === testId) ?? []),
    ...additionalRollEffects.filter((effect) => effect.testId === testId),
  ];
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
  origins: OriginContext,
  index: PackageIndex,
  state: EngineState,
  context: EvaluateCharacterInput["context"],
  additionalRollEffects: readonly D20RollEffect[],
): void {
  const proficiencyBonus = requireNumber(state.facts.proficiencyBonus ?? null, "Proficiency Bonus");
  const firstClassId = character.build.levels[0]?.classId;
  const firstClassEntity =
    firstClassId === undefined ? undefined : index.entities.get(firstClassId);
  const firstClassBody =
    firstClassEntity?.kind === "class" ? classBodySchema.parse(firstClassEntity.body) : undefined;
  const allowedSkillChoiceSources = new Set<string>();
  if (firstClassId !== undefined && firstClassBody?.skillProficiencyChoice !== undefined) {
    allowedSkillChoiceSources.add(firstClassId);
  }
  if (origins.species !== undefined && origins.speciesBody?.skillProficiencyChoice !== undefined) {
    allowedSkillChoiceSources.add(origins.species.id);
  }
  for (const featId of character.build.featIds) {
    const feat = index.entities.get(featId);
    if (
      feat?.kind === "feat" &&
      featBodySchema.parse(feat.body).proficiencyChoice?.categories.includes("skill") === true
    ) {
      allowedSkillChoiceSources.add(featId);
    }
  }

  const backgroundSkillGrants = (origins.backgroundBody?.skillProficiencies ?? []).map(
    (skillId) => ({
      skillId,
      sourceId: origins.background?.id ?? "",
    }),
  );
  const skillChoices = [...character.build.proficiencyChoices.skills, ...backgroundSkillGrants];
  const selectedSkillIds = new Set(skillChoices.map((choice) => choice.skillId));
  const expertiseSkillIds = new Set(
    character.build.proficiencyChoices.expertise.map((choice) => choice.skillId),
  );
  const knownSkillIds = new Set(skillDefinitions.map((skill) => `${skillEntityPrefix}${skill.id}`));
  const testSourceReferences = (testId: string, proficiencySources: string[]) =>
    referencesForSources(
      [
        ...proficiencySources,
        ...additionalRollEffects
          .filter((effect) => effect.testId === testId)
          .map((effect) => effect.source),
      ],
      index,
    );

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
    if (
      character.build.proficiencyChoices.skills.includes(choice) &&
      !allowedSkillChoiceSources.has(choice.sourceId)
    ) {
      addValidation(
        state,
        "SKILL_PROFICIENCY_SOURCE_NOT_GRANTED",
        `${choice.sourceId} does not grant a skill choice to this character.`,
        ["build.proficiencyChoices.skills"],
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

  if (origins.species !== undefined && origins.speciesBody?.skillProficiencyChoice !== undefined) {
    const speciesChoices = character.build.proficiencyChoices.skills.filter(
      (choice) => choice.sourceId === origins.species?.id,
    );
    const requirement = origins.speciesBody.skillProficiencyChoice;
    if (
      speciesChoices.length < requirement.minimum ||
      speciesChoices.length > requirement.maximum
    ) {
      addValidation(
        state,
        "SPECIES_SKILL_PROFICIENCY_COUNT",
        `${origins.species.id} requires ${String(requirement.minimum)} skill proficiency choice.`,
        ["build.proficiencyChoices.skills"],
      );
    }
  }
  for (const featId of character.build.featIds) {
    const feat = index.entities.get(featId);
    if (feat?.kind !== "feat") {
      continue;
    }
    const proficiencyChoice = featBodySchema.parse(feat.body).proficiencyChoice;
    if (!proficiencyChoice?.categories.includes("skill")) {
      continue;
    }
    const featChoices = character.build.proficiencyChoices.skills.filter(
      (choice) => choice.sourceId === featId,
    );
    if (
      featChoices.length < proficiencyChoice.minimum ||
      featChoices.length > proficiencyChoice.maximum
    ) {
      addValidation(
        state,
        "FEAT_SKILL_PROFICIENCY_COUNT",
        `${featId} requires ${String(proficiencyChoice.minimum)} proficiency choices in the supported skill-only slice.`,
        ["build.proficiencyChoices.skills"],
      );
    }
  }
  const duplicateSkillIds = [...selectedSkillIds].filter(
    (skillId) => skillChoices.filter((choice) => choice.skillId === skillId).length > 1,
  );
  for (const skillId of duplicateSkillIds) {
    addValidation(
      state,
      "DUPLICATE_SKILL_PROFICIENCY",
      `${skillId} is granted by more than one selected origin or class choice.`,
      ["build.proficiencyChoices.skills"],
      "warning",
    );
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
      additionalRollEffects,
      testSourceReferences(`savingThrow.${ability}`, sources),
      state,
    );
  }

  for (const skill of skillDefinitions) {
    const entityId = `${skillEntityPrefix}${skill.id}`;
    const proficiencySources = skillChoices
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
      additionalRollEffects,
      testSourceReferences(`skill.${skill.id}`, sources),
      state,
    );
  }

  const noProficiency = proficiencyEntry("none", proficiencyBonus, []);
  recordD20Test(
    "initiative",
    "dexterity",
    noProficiency,
    context,
    additionalRollEffects,
    testSourceReferences("initiative", []),
    state,
  );

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

function evaluateSpellcasting(
  character: CharacterDocument,
  classLevels: ReadonlyMap<string, number>,
  index: PackageIndex,
  state: EngineState,
): void {
  const wizardClassId = "srd521.class.wizard";
  const wizardLevel = classLevels.get(wizardClassId) ?? 0;
  if (wizardLevel === 0) {
    return;
  }
  const classEntity = index.entities.get(wizardClassId);
  if (classEntity?.kind !== "class") {
    addValidation(state, "WIZARD_CLASS_ENTITY_MISSING", "The Wizard class entity is not loaded.", [
      "build.levels",
    ]);
    return;
  }
  const classBody = wizardClassBodySchema.parse(classEntity.body);
  const progression = classBody.progression.find((row) => row.level === wizardLevel);
  if (progression === undefined) {
    addValidation(
      state,
      "WIZARD_PROGRESSION_MISSING",
      `The Wizard progression has no level ${String(wizardLevel)} row.`,
      ["build.levels"],
    );
    return;
  }
  const abilityModifier = requireNumber(
    state.facts["ability.intelligence.modifier"] ?? null,
    "Wizard spellcasting ability modifier",
  );
  const proficiencyBonus = requireNumber(state.facts.proficiencyBonus ?? null, "Proficiency Bonus");
  const attackBonus = abilityModifier + proficiencyBonus;
  const saveDifficultyClass = 8 + abilityModifier + proficiencyBonus;
  const classSources = entitySourceReferences(classEntity);
  const attackTraceId = "spellcasting.wizard.attackBonus";
  state.facts[attackTraceId] = attackBonus;
  state.values[attackTraceId] = { value: attackBonus, traceId: attackTraceId };
  state.traces[attackTraceId] = {
    id: attackTraceId,
    result: attackBonus,
    nodes: [
      {
        id: `${attackTraceId}.sum`,
        operation: "add-ability-and-proficiency",
        inputs: [abilityModifier, proficiencyBonus],
        output: attackBonus,
      },
    ],
    sourceReferences: classSources,
  };
  const saveTraceId = "spellcasting.wizard.saveDifficultyClass";
  state.facts[saveTraceId] = saveDifficultyClass;
  state.values[saveTraceId] = { value: saveDifficultyClass, traceId: saveTraceId };
  state.traces[saveTraceId] = {
    id: saveTraceId,
    result: saveDifficultyClass,
    nodes: [
      {
        id: `${saveTraceId}.sum`,
        operation: "add-spell-save-base-ability-and-proficiency",
        inputs: [8, abilityModifier, proficiencyBonus],
        output: saveDifficultyClass,
      },
    ],
    sourceReferences: classSources,
  };

  const slots = Object.entries(progression.spellSlots)
    .map(([level, maximum]) => {
      const expended = character.state.expendedSpellSlots[level] ?? 0;
      const current = Math.max(0, maximum - expended);
      const traceId = `spellcasting.wizard.slots.${level}`;
      const maximumTraceId = `${traceId}.maximum`;
      state.facts[`${traceId}.maximum`] = maximum;
      state.facts[`${traceId}.current`] = current;
      state.values[`${traceId}.maximum`] = { value: maximum, traceId: maximumTraceId };
      state.values[`${traceId}.current`] = { value: current, traceId };
      state.traces[maximumTraceId] = {
        id: maximumTraceId,
        result: maximum,
        nodes: [
          {
            id: `${maximumTraceId}.progression`,
            operation: "lookup-class-progression",
            inputs: [wizardLevel, Number(level)],
            output: maximum,
          },
        ],
        sourceReferences: classSources,
      };
      state.traces[traceId] = {
        id: traceId,
        result: current,
        nodes: [
          {
            id: `${traceId}.subtract-expended`,
            operation: "subtract-expended-spell-slots",
            inputs: [maximum, expended],
            output: current,
          },
        ],
        sourceReferences: classSources,
      };
      if (expended > maximum) {
        addValidation(
          state,
          "SPELL_SLOTS_EXPENDED_ABOVE_MAXIMUM",
          `Expended level ${level} spell slots exceed the maximum of ${String(maximum)}.`,
          [`state.expendedSpellSlots.${level}`],
        );
      }
      return { level: Number(level), maximum, expended, current, traceId };
    })
    .sort((left, right) => left.level - right.level);
  for (const level of Object.keys(character.state.expendedSpellSlots)) {
    if (!(level in progression.spellSlots)) {
      addValidation(
        state,
        "SPELL_SLOT_LEVEL_UNAVAILABLE",
        `Wizard level ${String(wizardLevel)} has no level ${level} spell slots.`,
        [`state.expendedSpellSlots.${level}`],
      );
    }
  }

  const spellList = new Set(classBody.spellList);
  const prepared = new Set(character.loadout.preparedSpellIds);
  const learned = new Set(character.build.learnedSpellIds);
  const maximumSpellLevel = Math.max(...Object.keys(progression.spellSlots).map(Number));
  if (learned.size !== character.build.learnedSpellIds.length) {
    addValidation(
      state,
      "DUPLICATE_LEARNED_SPELL",
      "The spellbook cannot contain duplicate spell selections.",
      ["build.learnedSpellIds"],
    );
  }
  if (prepared.size !== character.loadout.preparedSpellIds.length) {
    addValidation(state, "DUPLICATE_PREPARED_SPELL", "Prepared spell selections must be unique.", [
      "loadout.preparedSpellIds",
    ]);
  }
  let learnedCantrips = 0;
  let learnedLeveledSpells = 0;
  for (const [position, spellId] of character.build.learnedSpellIds.entries()) {
    const entity = index.entities.get(spellId);
    if (entity?.kind !== "spell") {
      addValidation(
        state,
        "LEARNED_SPELL_ENTITY_MISSING",
        `Learned spell ${spellId} is not loaded.`,
        [`build.learnedSpellIds.${String(position)}`],
      );
      continue;
    }
    const body = spellBodySchema.parse(entity.body);
    if (!spellList.has(spellId) || !body.wizardSpell) {
      addValidation(
        state,
        "SPELL_NOT_ON_WIZARD_LIST",
        `${spellId} is not on the Wizard spell list.`,
        [`build.learnedSpellIds.${String(position)}`],
      );
    }
    if (body.level > maximumSpellLevel) {
      addValidation(
        state,
        "WIZARD_SPELL_LEVEL_UNAVAILABLE",
        `${spellId} requires level ${String(body.level)} spell slots.`,
        [`build.learnedSpellIds.${String(position)}`],
      );
    }
    if (body.level === 0) {
      learnedCantrips += 1;
    } else {
      learnedLeveledSpells += 1;
    }
    state.spells.push({
      id: spellId,
      name: entity.name.en ?? spellId,
      level: body.level,
      school: body.school,
      prepared: prepared.has(spellId),
      ritual: body.ritual,
      concentration: body.concentration,
      castingTime: body.castingTime,
      range: body.range,
      duration: body.duration,
      ...(body.attackType === null ? {} : { attackType: body.attackType }),
      savingThrows: body.savingThrows,
      sources: entitySourceReferences(entity),
    });
  }
  for (const [position, spellId] of character.loadout.preparedSpellIds.entries()) {
    const entity = index.entities.get(spellId);
    if (!learned.has(spellId)) {
      addValidation(
        state,
        "PREPARED_SPELL_NOT_IN_SPELLBOOK",
        `${spellId} is prepared but not recorded in the spellbook.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
    if (entity?.kind === "spell" && spellBodySchema.parse(entity.body).level === 0) {
      addValidation(
        state,
        "CANTRIP_CANNOT_BE_PREPARED",
        `${spellId} is a cantrip and does not use a prepared-spell selection.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
  }
  if (prepared.size !== progression.preparedSpells) {
    addValidation(
      state,
      "WIZARD_PREPARED_SPELL_COUNT",
      `Wizard level ${String(wizardLevel)} requires ${String(progression.preparedSpells)} prepared spells.`,
      ["loadout.preparedSpellIds"],
    );
  }
  if (learnedCantrips !== progression.cantrips) {
    addValidation(
      state,
      "WIZARD_CANTRIP_COUNT",
      `Wizard level ${String(wizardLevel)} knows ${String(progression.cantrips)} cantrips.`,
      ["build.learnedSpellIds"],
    );
  }
  const spellbookMinimum =
    classBody.spellbookStartingSpells +
    classBody.spellbookSpellsPerLevel * Math.max(0, wizardLevel - 1);
  if (learnedLeveledSpells < spellbookMinimum) {
    addValidation(
      state,
      "WIZARD_SPELLBOOK_BELOW_MINIMUM",
      `Wizard level ${String(wizardLevel)} has at least ${String(spellbookMinimum)} level 1+ spells in the spellbook.`,
      ["build.learnedSpellIds"],
    );
  }
  if (character.state.concentrationSpellId !== undefined) {
    const concentration = index.entities.get(character.state.concentrationSpellId);
    if (
      concentration?.kind !== "spell" ||
      !spellBodySchema.parse(concentration.body).concentration
    ) {
      addValidation(
        state,
        "CONCENTRATION_SPELL_INVALID",
        `${character.state.concentrationSpellId} is not a loaded Concentration spell.`,
        ["state.concentrationSpellId"],
      );
    } else if (!learned.has(character.state.concentrationSpellId)) {
      addValidation(
        state,
        "CONCENTRATION_SPELL_NOT_KNOWN",
        `${character.state.concentrationSpellId} is not in the Wizard's spellbook.`,
        ["state.concentrationSpellId"],
      );
    }
  }
  state.spells.sort(
    (left, right) => left.level - right.level || left.name.localeCompare(right.name),
  );
  state.spellcasting = {
    classId: wizardClassId,
    ability: classBody.spellcastingAbility,
    abilityModifier,
    attackBonus,
    saveDifficultyClass,
    cantripsKnown: progression.cantrips,
    preparedSpellLimit: progression.preparedSpells,
    spellbookMinimum,
    slots,
    attackTraceId,
    saveTraceId,
  };
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

function grantSubclassFeatures(
  character: CharacterDocument,
  classLevels: ReadonlyMap<string, number>,
  index: PackageIndex,
  granted: Set<string>,
): void {
  if (character.build.subclassId === undefined) {
    return;
  }
  const subclass = index.entities.get(character.build.subclassId);
  if (subclass?.kind !== "subclass") {
    return;
  }
  const body = subclassBodySchema.parse(subclass.body);
  const classLevel = classLevels.get(body.parentClassId) ?? 0;
  granted.add(subclass.id);
  for (const row of body.progression) {
    if (row.level <= classLevel) {
      row.features.forEach((featureId) => granted.add(featureId));
    }
  }
}

function applicableRules(
  index: PackageIndex,
  granted: ReadonlySet<string>,
): { ir: AuthoringIr; rule: DraftRule }[] {
  return index.authoringIr.flatMap((ir) =>
    granted.has(ir.id) ? ir.proposedRules.map((rule) => ({ ir, rule })) : [],
  );
}

function ruleRollEffects(
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  state: EngineState,
  index: PackageIndex,
  granted: ReadonlySet<string>,
): D20RollEffect[] {
  return rules.flatMap(({ ir, rule }) => {
    if (rule.type !== "grant-advantage" || rule.target === undefined) {
      return [];
    }
    if (
      rule.when !== undefined &&
      evaluatePredicate(rule.when, `${rule.id}.advantage-applicable`, state, index, granted)
        .result !== true
    ) {
      return [];
    }
    return [{ testId: rule.target, kind: "advantage" as const, source: ir.id }];
  });
}

interface AttackRuleSummary {
  readonly attacksPerAction: number;
  readonly criticalHitThreshold: number;
  readonly criticalHitTraceId: string;
}

function evaluateAttackRules(
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  granted: ReadonlySet<string>,
  index: PackageIndex,
  state: EngineState,
): AttackRuleSummary {
  let attacksPerAction = 1;
  let criticalHitThreshold = 20;
  const attackCountSources: SourceReference[] = [];
  const criticalSources: SourceReference[] = [];
  for (const { ir, rule } of rules) {
    if (
      (rule.type !== "set-attack-count" && rule.type !== "set-critical-threshold") ||
      rule.expression === undefined
    ) {
      continue;
    }
    const traceId =
      rule.type === "set-attack-count"
        ? "attackAction.attacks"
        : "weaponAttacks.criticalHitThreshold";
    const trace = evaluateExpression(rule.expression, traceId, state, index, granted);
    const value = requireNumber(trace.result as JsonScalar, traceId);
    state.traces[traceId] = withRuleSource(trace, ir);
    if (rule.type === "set-attack-count") {
      attacksPerAction = value;
      attackCountSources.push(...sourceReferences(ir));
    } else {
      criticalHitThreshold = value;
      criticalSources.push(...sourceReferences(ir));
    }
  }
  const attackCountTraceId = "attackAction.attacks";
  state.traces[attackCountTraceId] ??= {
    id: attackCountTraceId,
    result: attacksPerAction,
    nodes: [
      {
        id: `${attackCountTraceId}.base`,
        operation: "base-attacks-per-action",
        inputs: [],
        output: attacksPerAction,
      },
    ],
    sourceReferences: attackCountSources,
  };
  state.facts[attackCountTraceId] = attacksPerAction;
  state.values[attackCountTraceId] = {
    value: attacksPerAction,
    traceId: attackCountTraceId,
  };
  const criticalHitTraceId = "weaponAttacks.criticalHitThreshold";
  state.traces[criticalHitTraceId] ??= {
    id: criticalHitTraceId,
    result: criticalHitThreshold,
    nodes: [
      {
        id: `${criticalHitTraceId}.base`,
        operation: "base-critical-hit-threshold",
        inputs: [],
        output: criticalHitThreshold,
      },
    ],
    sourceReferences: criticalSources,
  };
  state.facts[criticalHitTraceId] = criticalHitThreshold;
  state.values[criticalHitTraceId] = {
    value: criticalHitThreshold,
    traceId: criticalHitTraceId,
  };
  return { attacksPerAction, criticalHitThreshold, criticalHitTraceId };
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
  equipment: EquipmentContext,
): void {
  const candidates: {
    id: string;
    applicable: boolean;
    value?: number;
    rejectionReasons: string[];
    trace: CalculationTrace;
    sourceReferences: SourceReference[];
  }[] = [];
  let ruleModifierBonus = 0;
  const ruleModifierNodes: TraceNode[] = [];
  const ruleModifierSources: SourceReference[] = [];
  for (const { ir, rule } of rules) {
    if (
      rule.type !== "add-modifier" ||
      rule.target !== "armor-class" ||
      rule.expression === undefined
    ) {
      continue;
    }
    const applicable =
      rule.when === undefined ||
      evaluatePredicate(rule.when, `armorClass.${rule.id}.applicable`, state, index, granted)
        .result === true;
    if (!applicable) {
      continue;
    }
    const modifierTrace = evaluateExpression(
      rule.expression,
      `armorClass.${rule.id}.modifier`,
      state,
      index,
      granted,
    );
    const modifier = requireNumber(
      modifierTrace.result as JsonScalar,
      `armorClass.${rule.id}.modifier`,
    );
    ruleModifierBonus += modifier;
    ruleModifierNodes.push(...prefixNodes(`armorClass.${rule.id}`, modifierTrace.nodes), {
      id: `armorClass.${rule.id}.apply`,
      operation: "apply-armor-class-modifier",
      inputs: [modifier],
      output: modifier,
      label: ir.text.title,
    });
    ruleModifierSources.push(...sourceReferences(ir));
  }
  const equippedArmor = equipment.items.filter(
    (item) => item.equipped && item.entity?.kind === "equipment-armor",
  );
  const equippedShield = equipment.items.find(
    (item) => item.equipped && item.entity?.kind === "equipment-shield",
  );
  const shieldArmor =
    equippedShield === undefined ? undefined : armorBodySchema.parse(equippedShield.entity?.body);
  const shieldBonus =
    equipment.armorTraining.has("shield") && shieldArmor?.armorClass.kind === "bonus"
      ? shieldArmor.armorClass.bonus
      : 0;
  const shieldSources =
    shieldBonus > 0 && equippedShield?.entity !== undefined
      ? entitySourceReferences(equippedShield.entity)
      : [];
  const baseTrace = new ExpressionEvaluator({ facts: state.facts }).evaluate(
    {
      kind: "add",
      args: [
        { kind: "literal", value: 10 },
        { kind: "ref", path: "ability.dexterity.modifier" },
        { kind: "literal", value: shieldBonus },
        { kind: "literal", value: ruleModifierBonus },
      ],
    },
    "armorClass.base",
  );
  candidates.push({
    id: "base-unarmored",
    applicable: equippedArmor.length === 0,
    value: requireNumber(baseTrace.value, "Base Armor Class"),
    rejectionReasons:
      equippedArmor.length === 0 ? [] : ["An equipped armor suit replaces the unarmored formula."],
    trace: baseTrace.trace,
    sourceReferences: [...shieldSources, ...ruleModifierSources],
  });
  for (const resolved of equippedArmor) {
    const entity = resolved.entity;
    if (entity === undefined) {
      continue;
    }
    const armor = armorBodySchema.parse(entity.body);
    const dexterityModifier = requireNumber(
      state.facts["ability.dexterity.modifier"] ?? null,
      "Dexterity modifier",
    );
    let value: number;
    const inputs: JsonScalar[] = [];
    switch (armor.armorClass.kind) {
      case "fixed":
        value = armor.armorClass.base + shieldBonus + ruleModifierBonus;
        inputs.push(armor.armorClass.base, shieldBonus, ruleModifierBonus);
        break;
      case "formula": {
        const dexterityContribution =
          armor.armorClass.dexterityCap === null
            ? dexterityModifier
            : Math.min(dexterityModifier, armor.armorClass.dexterityCap);
        value = armor.armorClass.base + dexterityContribution + shieldBonus + ruleModifierBonus;
        inputs.push(armor.armorClass.base, dexterityContribution, shieldBonus, ruleModifierBonus);
        break;
      }
      case "bonus":
        continue;
    }
    const traceId = `armorClass.${resolved.item.id}`;
    candidates.push({
      id: `equipped-${resolved.item.id}`,
      applicable: true,
      value,
      rejectionReasons: [],
      trace: {
        id: traceId,
        result: value,
        nodes: [
          ...ruleModifierNodes,
          {
            id: `${traceId}.formula`,
            operation: "equipped-armor-formula",
            inputs,
            output: value,
            label: entity.name.en ?? entity.id,
          },
        ],
        sourceReferences: [
          ...entitySourceReferences(entity),
          ...shieldSources,
          ...ruleModifierSources,
        ],
      },
      sourceReferences: [
        ...entitySourceReferences(entity),
        ...shieldSources,
        ...ruleModifierSources,
      ],
    });
  }
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
    const unshieldedValue = requireNumber(valueTrace.result as JsonScalar, traceId);
    const value = unshieldedValue + shieldBonus + ruleModifierBonus;
    const trace =
      shieldBonus === 0 && ruleModifierBonus === 0
        ? valueTrace
        : {
            ...valueTrace,
            result: value,
            nodes: [
              ...valueTrace.nodes,
              {
                id: `${traceId}.shield`,
                operation: "add-armor-class-bonuses",
                inputs: [unshieldedValue, shieldBonus, ruleModifierBonus],
                output: value,
              },
            ],
          };
    candidates.push({
      id: rule.id,
      applicable: true,
      value,
      rejectionReasons: [],
      trace,
      sourceReferences: [...sourceReferences(ir), ...shieldSources, ...ruleModifierSources],
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

function evaluateAttacks(
  character: CharacterDocument,
  equipment: EquipmentContext,
  attackRules: AttackRuleSummary,
  index: PackageIndex,
  state: EngineState,
): void {
  const proficiencyBonus = requireNumber(state.facts.proficiencyBonus ?? null, "Proficiency Bonus");
  const strengthModifier = requireNumber(
    state.facts["ability.strength.modifier"] ?? null,
    "Strength modifier",
  );
  const dexterityModifier = requireNumber(
    state.facts["ability.dexterity.modifier"] ?? null,
    "Dexterity modifier",
  );
  const selectedMasteries = new Set(character.loadout.selectedWeaponMasteryIds);
  const classEntity = startingClassEntity(character, index);
  const classBody = classEntity === undefined ? undefined : classBodySchema.parse(classEntity.body);
  const classLevel =
    classEntity === undefined
      ? 0
      : character.build.levels.filter((level) => level.classId === classEntity.id).length;
  const masteryCapacity =
    classBody?.progression.find((row) => row.level === classLevel)?.weaponMastery ?? 0;
  if (selectedMasteries.size > masteryCapacity) {
    addValidation(
      state,
      "WEAPON_MASTERY_SELECTION_LIMIT",
      `Selected Weapon Masteries exceed the maximum of ${String(masteryCapacity)}.`,
      ["loadout.selectedWeaponMasteryIds"],
    );
  } else if (selectedMasteries.size < masteryCapacity) {
    addValidation(
      state,
      "WEAPON_MASTERY_SELECTION_COUNT",
      `Select ${String(masteryCapacity)} Weapon Masteries for this class level.`,
      ["loadout.selectedWeaponMasteryIds"],
    );
  }

  const ownedWeaponIds = new Set(
    equipment.items
      .filter((resolved) => resolved.entity?.kind === "equipment-weapon")
      .map((resolved) => resolved.item.entityId),
  );
  for (const masteryId of selectedMasteries) {
    const entity = index.entities.get(masteryId);
    if (entity?.kind !== "equipment-weapon") {
      addValidation(
        state,
        "WEAPON_MASTERY_ENTITY_INVALID",
        `${masteryId} is not a loaded weapon.`,
        ["loadout.selectedWeaponMasteryIds"],
      );
    } else if (!ownedWeaponIds.has(masteryId)) {
      addValidation(
        state,
        "WEAPON_MASTERY_WEAPON_NOT_OWNED",
        `${masteryId} is selected for mastery but is not in inventory.`,
        ["loadout.selectedWeaponMasteryIds"],
        "warning",
      );
    } else {
      const weapon = weaponBodySchema.parse(entity.body);
      if (!equipment.weaponProficiencies.has(weapon.category)) {
        addValidation(
          state,
          "WEAPON_MASTERY_REQUIRES_PROFICIENCY",
          `${masteryId} cannot be selected without weapon proficiency.`,
          ["loadout.selectedWeaponMasteryIds"],
        );
      }
    }
  }

  for (const resolved of equipment.items) {
    const entity = resolved.entity;
    if (entity?.kind !== "equipment-weapon") {
      continue;
    }
    const weapon = weaponBodySchema.parse(entity.body);
    const finesse = weapon.properties.includes("finesse");
    const ability: Ability = finesse
      ? dexterityModifier > strengthModifier
        ? "dexterity"
        : "strength"
      : weapon.attackType === "ranged"
        ? "dexterity"
        : "strength";
    const abilityModifier = ability === "strength" ? strengthModifier : dexterityModifier;
    const proficient = equipment.weaponProficiencies.has(weapon.category);
    const proficiency = proficient ? proficiencyBonus : 0;
    const attackBonus = abilityModifier + proficiency;
    const attackId = `attack.${resolved.item.id}`;
    const traceId = `${attackId}.bonus`;
    const proficiencySources =
      proficient && classEntity !== undefined ? entitySourceReferences(classEntity) : [];
    state.traces[traceId] = {
      id: traceId,
      result: attackBonus,
      nodes: [
        {
          id: `${traceId}.ability`,
          operation: finesse ? "select-finesse-ability" : "select-weapon-ability",
          inputs: finesse
            ? [strengthModifier, dexterityModifier]
            : [weapon.attackType, abilityModifier],
          output: abilityModifier,
          label: ability,
        },
        {
          id: `${traceId}.proficiency`,
          operation: "apply-weapon-proficiency",
          inputs: [weapon.category, proficiencyBonus, proficient],
          output: proficiency,
        },
        {
          id: `${traceId}.total`,
          operation: "add",
          inputs: [abilityModifier, proficiency],
          output: attackBonus,
        },
      ],
      sourceReferences: [...entitySourceReferences(entity), ...proficiencySources],
    };
    state.facts[traceId] = attackBonus;
    state.values[traceId] = { value: attackBonus, traceId };

    const rageBonusValue =
      state.facts["state.rage.active"] === true && ability === "strength"
        ? state.values["rage.damageBonus"]?.value
        : 0;
    const rageBonus = typeof rageBonusValue === "number" ? rageBonusValue : 0;
    const damageBonus = abilityModifier + rageBonus;
    const damageTraceId = `${attackId}.damageBonus`;
    state.traces[damageTraceId] = {
      id: damageTraceId,
      result: damageBonus,
      nodes: [
        {
          id: `${damageTraceId}.ability`,
          operation: "apply-damage-ability-modifier",
          inputs: [ability, abilityModifier],
          output: abilityModifier,
        },
        {
          id: `${damageTraceId}.rage`,
          operation: "apply-rage-damage",
          inputs: [state.facts["state.rage.active"] ?? false, rageBonus],
          output: rageBonus,
          suppressed: rageBonus === 0,
          ...(rageBonus === 0
            ? { reason: "Rage is inactive or the attack does not use Strength." }
            : {}),
        },
        {
          id: `${damageTraceId}.total`,
          operation: "add",
          inputs: [abilityModifier, rageBonus],
          output: damageBonus,
        },
      ],
      sourceReferences: [
        ...entitySourceReferences(entity),
        ...(rageBonus === 0 ? [] : (state.traces["rage.damageBonus"]?.sourceReferences ?? [])),
      ],
    };
    state.facts[damageTraceId] = damageBonus;
    state.values[damageTraceId] = { value: damageBonus, traceId: damageTraceId };

    const damage = weapon.damage;
    state.attacks.push({
      id: attackId,
      itemId: resolved.item.id,
      weaponId: entity.id,
      name: entity.name.en ?? entity.id,
      ability,
      attackBonus,
      proficient,
      damage: {
        ...(damage.diceCount === null ? {} : { diceCount: damage.diceCount }),
        ...(damage.diceSize === null ? {} : { diceSize: damage.diceSize }),
        ...(damage.flat === null ? {} : { flat: damage.flat }),
        bonus: damageBonus,
        type: damage.type,
        traceId: damageTraceId,
      },
      attackType: weapon.attackType,
      properties: weapon.properties,
      ...(weapon.range === undefined
        ? {}
        : {
            range: {
              normal: weapon.range.normal,
              long: weapon.range.long,
            },
          }),
      mastery: {
        property: weapon.mastery,
        enabled: selectedMasteries.has(entity.id) && masteryCapacity > 0,
      },
      criticalHitThreshold: attackRules.criticalHitThreshold,
      criticalHitTraceId: attackRules.criticalHitTraceId,
      traceId,
    });
  }
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
      const actionParameters: Record<string, JsonValue> = {};
      if (parameters.spends !== undefined) {
        actionParameters.spends = parameters.spends;
      }
      if (parameters.resourceId !== undefined) {
        actionParameters.resourceId = parameters.resourceId;
      }
      if (parameters.healing !== undefined) {
        actionParameters.healing = parameters.healing;
      }
      if (parameters.damageReroll !== undefined) {
        actionParameters.damageReroll = parameters.damageReroll;
      }
      if (parameters.grantsAction !== undefined) {
        actionParameters.grantsAction = parameters.grantsAction;
      }
      if (parameters.excludes !== undefined) {
        actionParameters.excludes = parameters.excludes;
      }
      if (parameters.checkBonus !== undefined) {
        actionParameters.checkBonus = parameters.checkBonus;
      }
      if (parameters.refundIfCheckStillFails !== undefined) {
        actionParameters.refundIfCheckStillFails = parameters.refundIfCheckStillFails;
      }
      if (parameters.movement !== undefined) {
        const walkingSpeed = state.facts["speed.walking"];
        const maximumFeet =
          typeof walkingSpeed === "number"
            ? walkingSpeed * parameters.movement.speedFraction
            : undefined;
        actionParameters.movement = {
          ...parameters.movement,
          ...(maximumFeet === undefined ? {} : { maximumFeet }),
        };
        if (maximumFeet !== undefined && typeof walkingSpeed === "number") {
          const movementTraceId = `${rule.target ?? rule.id}.maximumMovement`;
          state.facts[movementTraceId] = maximumFeet;
          state.values[movementTraceId] = { value: maximumFeet, traceId: movementTraceId };
          state.traces[movementTraceId] = {
            id: movementTraceId,
            result: maximumFeet,
            nodes: [
              {
                id: `${movementTraceId}.fraction`,
                operation: "multiply-speed-fraction",
                inputs: [walkingSpeed, parameters.movement.speedFraction],
                output: maximumFeet,
              },
            ],
            sourceReferences: sourceReferences(ir),
          };
        }
      }
      state.actions.push({
        id: rule.target ?? rule.id,
        available,
        reasons: available ? [] : ["Action prerequisites are not satisfied."],
        ...(parameters.actionEconomy === undefined
          ? {}
          : { actionEconomy: parameters.actionEconomy }),
        ...(Object.keys(actionParameters).length === 0 ? {} : { parameters: actionParameters }),
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
  const levels = new Map<string, number>();
  for (const level of character.build.levels) {
    levels.set(level.classId, (levels.get(level.classId) ?? 0) + 1);
  }
  for (const [classId, expended] of Object.entries(character.state.expendedHitDice)) {
    const maximum = levels.get(classId) ?? 0;
    if (expended > maximum) {
      addValidation(
        state,
        "HIT_DICE_EXPENDED_ABOVE_MAXIMUM",
        `Expended ${classId} Hit Dice exceed the character's ${String(maximum)} levels in that class.`,
        [`state.expendedHitDice.${classId}`],
      );
    }
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
    inventory: [],
    attacks: [],
    spells: [],
  };
  validatePackagePins(character, index, state);
  const origins = resolveOrigins(character, index, state);
  validateProgressionSelections(character, index, state);
  const classLevels = materializeFacts(character, state);
  const granted = grantedFeatureIds(classLevels, index);
  grantSubclassFeatures(character, classLevels, index, granted);
  if (character.build.speciesId !== undefined) {
    granted.add(character.build.speciesId);
  }
  if (character.build.backgroundId !== undefined) {
    granted.add(character.build.backgroundId);
  }
  character.build.featIds.forEach((featId) => granted.add(featId));
  const rules = applicableRules(index, granted);
  evaluateAbilities(state);
  evaluateProficiency(state);
  const equipment = resolveEquipment(character, index, state);
  evaluateWalkingSpeed(state);
  evaluateD20Tests(character, origins, index, state, input.context, [
    ...equipment.rollEffects,
    ...ruleRollEffects(rules, state, index, granted),
  ]);
  evaluateHitPoints(character, index, state);
  evaluateSpellcasting(character, classLevels, index, state);
  const resourceAmounts = evaluateResources(character, rules, granted, index, state);
  evaluateArmorClass(rules, granted, index, state, equipment);
  evaluateConditionalRules(character, rules, granted, resourceAmounts, index, state);
  const attackRules = evaluateAttackRules(rules, granted, index, state);
  evaluateAttacks(character, equipment, attackRules, index, state);
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
    inventory: state.inventory,
    attacks: state.attacks,
    ...(state.spellcasting === undefined ? {} : { spellcasting: state.spellcasting }),
    spells: state.spells,
    actions: state.actions,
    resources: state.resources,
    resistances: [...state.resistances].sort(),
    validations: state.validations,
    traces: state.traces,
    coverageWarnings,
  };
}
