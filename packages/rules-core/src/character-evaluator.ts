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
    weaponMasteryChoice: z
      .object({
        categories: z.array(z.enum(["simple", "martial"])),
        attackTypes: z.array(z.enum(["melee", "ranged"])),
      })
      .strict()
      .optional(),
    conditionalWeaponProficiencies: z
      .array(
        z
          .object({
            category: z.enum(["simple", "martial"]),
            attackType: z.enum(["melee", "ranged"]),
            requiredProperties: z.array(z.string()),
          })
          .strict(),
      )
      .default([]),
    armorTraining: z.array(z.enum(["light", "medium", "heavy", "shield"])).default([]),
    skillProficiencyChoice: z
      .object({
        minimum: z.number().int().min(0),
        maximum: z.number().int().min(0),
        options: z.array(z.string()),
        countByLevel: z.record(z.string(), z.number().int().nonnegative()).optional(),
      })
      .optional(),
    progression: z.array(
      z.object({
        level: z.number().int().min(1).max(20),
        weaponMastery: z.number().int().min(0).optional(),
        martialArtsDie: z
          .object({
            diceCount: z.number().int().positive(),
            diceSize: z.number().int().positive(),
          })
          .strict()
          .optional(),
        focusPoints: z.number().int().nonnegative().optional(),
        unarmoredMovement: z.number().int().nonnegative().optional(),
        walkingSpeedBonus: z.number().int().nonnegative().optional(),
        sneakAttack: z
          .object({
            diceCount: z.number().int().positive(),
            diceSize: z.number().int().positive(),
          })
          .strict()
          .optional(),
        features: z.array(
          z.object({
            name: z.string(),
            entityId: z.string().nullable(),
          }),
        ),
      }),
    ),
    featureSaveAbility: z.enum(abilities).optional(),
    martialArts: z
      .object({
        ability: z.enum(abilities),
        monkWeapon: z
          .object({
            attackType: z.enum(["melee", "ranged"]),
            categories: z.array(z.enum(["simple", "martial"])),
            conditionalCategories: z.array(
              z
                .object({
                  category: z.enum(["simple", "martial"]),
                  requiredProperties: z.array(z.string()),
                })
                .strict(),
            ),
          })
          .strict(),
      })
      .strict()
      .optional(),
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
const spellcastingSubclassBodySchema = subclassBodySchema.and(
  z
    .object({
      alwaysPreparedSpells: z.record(z.array(z.string().min(1))).default({}),
      alwaysPreparedSpellChoices: z.record(z.record(z.array(z.string().min(1)))).default({}),
    })
    .passthrough(),
);
const warlockProgressionBodySchema = z
  .object({
    progression: z.array(
      z.object({
        level: z.number().int().min(1).max(20),
        eldritchInvocations: z.number().int().nonnegative(),
      }),
    ),
  })
  .passthrough();
const warlockInvocationBodySchema = z
  .object({
    choiceId: z.literal("srd521.choice.warlock.eldritch-invocation"),
    minimumWarlockLevel: z.number().int().min(1).max(20),
    prerequisiteInvocationIds: z.array(z.string().min(1)).default([]),
  })
  .passthrough();
const spellcastingProgressionRowSchema = z
  .object({
    level: z.number().int().min(1).max(20),
    cantrips: z.number().int().nonnegative(),
    preparedSpells: z.number().int().nonnegative(),
    spellSlots: z.record(z.coerce.number().int().min(1).max(9), z.number().int().nonnegative()),
    pactSlots: z.number().int().positive().optional(),
    pactSlotLevel: z.number().int().min(1).max(5).optional(),
  })
  .passthrough();
const spellcastingClassBodySchema = z
  .object({
    spellcastingAbility: z.enum(abilities),
    spellPreparation: z.enum(["spellbook", "full-list"]).default("spellbook"),
    spellcastingModel: z.enum(["standard", "pact-magic"]).default("standard"),
    slotRecharge: z.enum(["long-rest", "short-rest"]).default("long-rest"),
    spellbookStartingSpells: z.number().int().positive().optional(),
    spellbookSpellsPerLevel: z.number().int().positive().optional(),
    spellList: z.array(z.string().min(1)),
    alwaysPreparedSpells: z.record(z.array(z.string().min(1))).default({}),
    progression: z.array(spellcastingProgressionRowSchema),
  })
  .passthrough();
const spellBodySchema = z
  .object({
    level: z.number().int().min(0).max(9),
    school: z.string().min(1),
    classes: z.array(z.string().min(1)),
    ritual: z.boolean(),
    castingTime: z.string().min(1),
    range: z.string().min(1),
    duration: z.string().min(1),
    concentration: z.boolean(),
    attackType: z.enum(["melee", "ranged"]).nullable(),
    savingThrows: z.array(z.string().min(1)),
    damage: z
      .array(
        z.object({
          diceCount: z.number().int().positive(),
          diceSize: z.number().int().positive(),
          type: z.string().min(1),
        }),
      )
      .nullish()
      .transform((damage) => damage ?? []),
    hasHigherLevelEffect: z.boolean().default(false),
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
    spellId: z.string().min(1).optional(),
    extraDamage: z
      .object({
        diceSize: z.number().int().positive(),
        type: z.string().min(1),
        frequency: z.string().min(1),
      })
      .strict()
      .optional(),
    requirements: z.array(z.string().min(1)).optional(),
    setsSpeed: z.number().nonnegative().optional(),
    sneakAttackDiceCost: z.number().int().positive().optional(),
    savingThrow: z
      .object({
        ability: z.enum(abilities),
        difficultyClassFact: z.string().min(1),
      })
      .strict()
      .optional(),
    damageReductionFraction: z.number().positive().max(1).optional(),
    restoresResource: z
      .object({
        resourceId: z.string().min(1),
        amountFact: z.string().min(1),
        fraction: z.number().positive().default(1),
        round: z.enum(["down", "up"]).default("down"),
      })
      .strict()
      .optional(),
    restoresSpellSlots: z
      .object({
        amountFact: z.string().min(1),
        fraction: z.number().positive().default(1),
        round: z.enum(["down", "up"]).default("down"),
        slotLevelFact: z.string().min(1),
      })
      .strict()
      .optional(),
    variableSpend: z.object({ minimum: z.number().int().positive() }).strict().optional(),
    healing: z
      .union([
        z
          .object({
            diceCount: z.number().int().positive(),
            diceSize: z.number().int().positive(),
            bonusFact: z.string().min(1),
          })
          .strict(),
        z.object({ perResourcePoint: z.number().positive() }).strict(),
      ])
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
  readonly conditionalWeaponProficiencies: z.infer<
    typeof classBodySchema
  >["conditionalWeaponProficiencies"];
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
  const clericLevel = classLevelCounts.get("srd521.class.cleric") ?? 0;
  const druidLevel = classLevelCounts.get("srd521.class.druid") ?? 0;
  const monkLevel = classLevelCounts.get("srd521.class.monk") ?? 0;
  const paladinLevel = classLevelCounts.get("srd521.class.paladin") ?? 0;
  const rangerLevel = classLevelCounts.get("srd521.class.ranger") ?? 0;
  const rogueLevel = classLevelCounts.get("srd521.class.rogue") ?? 0;
  const sorcererLevel = classLevelCounts.get("srd521.class.sorcerer") ?? 0;
  const warlockLevel = classLevelCounts.get("srd521.class.warlock") ?? 0;
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
  if (clericLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "CLERIC_SUBCLASS_REQUIRED",
      "A Cleric of level 3 or higher must select a Cleric subclass.",
      ["build.subclassId"],
    );
  }
  if (clericLevel < 3 && subclassParentId === "srd521.class.cleric") {
    addValidation(
      state,
      "CLERIC_SUBCLASS_LEVEL_REQUIRED",
      "A Cleric subclass requires Cleric level 3.",
      ["build.subclassId"],
    );
  }
  if (druidLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "DRUID_SUBCLASS_REQUIRED",
      "A Druid of level 3 or higher must select a Druid subclass.",
      ["build.subclassId"],
    );
  }
  if (druidLevel < 3 && subclassParentId === "srd521.class.druid") {
    addValidation(
      state,
      "DRUID_SUBCLASS_LEVEL_REQUIRED",
      "A Druid subclass requires Druid level 3.",
      ["build.subclassId"],
    );
  }
  if (monkLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "MONK_SUBCLASS_REQUIRED",
      "A Monk of level 3 or higher must select a Monk subclass.",
      ["build.subclassId"],
    );
  }
  if (monkLevel < 3 && subclassParentId === "srd521.class.monk") {
    addValidation(state, "MONK_SUBCLASS_LEVEL_REQUIRED", "A Monk subclass requires Monk level 3.", [
      "build.subclassId",
    ]);
  }
  if (paladinLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "PALADIN_SUBCLASS_REQUIRED",
      "A Paladin of level 3 or higher must select a Paladin subclass.",
      ["build.subclassId"],
    );
  }
  if (paladinLevel < 3 && subclassParentId === "srd521.class.paladin") {
    addValidation(
      state,
      "PALADIN_SUBCLASS_LEVEL_REQUIRED",
      "A Paladin subclass requires Paladin level 3.",
      ["build.subclassId"],
    );
  }
  if (rangerLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "RANGER_SUBCLASS_REQUIRED",
      "A Ranger of level 3 or higher must select a Ranger subclass.",
      ["build.subclassId"],
    );
  }
  if (rangerLevel < 3 && subclassParentId === "srd521.class.ranger") {
    addValidation(
      state,
      "RANGER_SUBCLASS_LEVEL_REQUIRED",
      "A Ranger subclass requires Ranger level 3.",
      ["build.subclassId"],
    );
  }
  if (rogueLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "ROGUE_SUBCLASS_REQUIRED",
      "A Rogue of level 3 or higher must select a Rogue subclass.",
      ["build.subclassId"],
    );
  }
  if (rogueLevel < 3 && subclassParentId === "srd521.class.rogue") {
    addValidation(
      state,
      "ROGUE_SUBCLASS_LEVEL_REQUIRED",
      "A Rogue subclass requires Rogue level 3.",
      ["build.subclassId"],
    );
  }
  if (sorcererLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "SORCERER_SUBCLASS_REQUIRED",
      "A Sorcerer of level 3 or higher must select a Sorcerer subclass.",
      ["build.subclassId"],
    );
  }
  if (sorcererLevel < 3 && subclassParentId === "srd521.class.sorcerer") {
    addValidation(
      state,
      "SORCERER_SUBCLASS_LEVEL_REQUIRED",
      "A Sorcerer subclass requires Sorcerer level 3.",
      ["build.subclassId"],
    );
  }
  if (warlockLevel >= 3 && character.build.subclassId === undefined) {
    addValidation(
      state,
      "WARLOCK_SUBCLASS_REQUIRED",
      "A Warlock of level 3 or higher must select a Warlock subclass.",
      ["build.subclassId"],
    );
  }
  if (warlockLevel < 3 && subclassParentId === "srd521.class.warlock") {
    addValidation(
      state,
      "WARLOCK_SUBCLASS_LEVEL_REQUIRED",
      "A Warlock subclass requires Warlock level 3.",
      ["build.subclassId"],
    );
  }
  const classesWithLegacySubclassValidation = new Set([
    "srd521.class.fighter",
    "srd521.class.wizard",
    "srd521.class.cleric",
    "srd521.class.druid",
    "srd521.class.monk",
    "srd521.class.paladin",
    "srd521.class.ranger",
    "srd521.class.rogue",
    "srd521.class.sorcerer",
    "srd521.class.warlock",
  ]);
  const loadedSubclasses = [...index.entities.values()].flatMap((entity) =>
    entity.kind === "subclass" ? [{ entity, body: subclassBodySchema.parse(entity.body) }] : [],
  );
  for (const [classId, classLevel] of classLevelCounts) {
    if (classesWithLegacySubclassValidation.has(classId)) continue;
    const availableSubclasses = loadedSubclasses.filter(
      (candidate) => candidate.body.parentClassId === classId,
    );
    if (availableSubclasses.length === 0) continue;
    const subclassLevel = Math.min(
      ...availableSubclasses.flatMap((candidate) =>
        candidate.body.progression.map((row) => row.level),
      ),
    );
    const classEntity = index.entities.get(classId);
    const className = classEntity?.name.en ?? classId;
    const validationPrefix = classId.split(".").at(-1)?.toUpperCase() ?? "CLASS";
    if (classLevel >= subclassLevel && subclassParentId !== classId) {
      addValidation(
        state,
        `${validationPrefix}_SUBCLASS_REQUIRED`,
        `A ${className} of level ${String(subclassLevel)} or higher must select a ${className} subclass.`,
        ["build.subclassId"],
      );
    }
    if (classLevel < subclassLevel && subclassParentId === classId) {
      addValidation(
        state,
        `${validationPrefix}_SUBCLASS_LEVEL_REQUIRED`,
        `A ${className} subclass requires ${className} level ${String(subclassLevel)}.`,
        ["build.subclassId"],
      );
    }
  }
  const divineOrderSelections = character.build.levels
    .flatMap((level) => level.selectedFeatureChoices)
    .filter((choice) => choice.choiceId === "srd521.choice.cleric.divine-order")
    .flatMap((choice) => choice.optionIds);
  if (clericLevel > 0 && divineOrderSelections.length !== 1) {
    addValidation(
      state,
      "CLERIC_DIVINE_ORDER_CHOICE_COUNT",
      "A Cleric must select exactly one Divine Order.",
      ["build.levels"],
    );
  }
  const divineOrderOptions = new Set([
    "srd521.option.cleric.divine-order.protector",
    "srd521.option.cleric.divine-order.thaumaturge",
  ]);
  if (divineOrderSelections.some((optionId) => !divineOrderOptions.has(optionId))) {
    addValidation(
      state,
      "CLERIC_DIVINE_ORDER_OPTION_INVALID",
      "The selected Divine Order is not supported by the loaded Cleric content.",
      ["build.levels"],
    );
  }
  const primalOrderSelections = character.build.levels
    .flatMap((level) => level.selectedFeatureChoices)
    .filter((choice) => choice.choiceId === "srd521.choice.druid.primal-order")
    .flatMap((choice) => choice.optionIds);
  if (druidLevel > 0 && primalOrderSelections.length !== 1) {
    addValidation(
      state,
      "DRUID_PRIMAL_ORDER_CHOICE_COUNT",
      "A Druid must select exactly one Primal Order.",
      ["build.levels"],
    );
  }
  const primalOrderOptions = new Set([
    "srd521.option.druid.primal-order.magician",
    "srd521.option.druid.primal-order.warden",
  ]);
  if (primalOrderSelections.some((optionId) => !primalOrderOptions.has(optionId))) {
    addValidation(
      state,
      "DRUID_PRIMAL_ORDER_OPTION_INVALID",
      "The selected Primal Order is not supported by the loaded Druid content.",
      ["build.levels"],
    );
  }
  const landSelections = character.build.levels
    .flatMap((level) => level.selectedFeatureChoices)
    .filter((choice) => choice.choiceId === "srd521.choice.druid.circle-of-land")
    .flatMap((choice) => choice.optionIds);
  if (
    druidLevel >= 3 &&
    character.build.subclassId === "srd521.subclass.druid.circle-of-the-land" &&
    landSelections.length !== 1
  ) {
    addValidation(
      state,
      "DRUID_CIRCLE_LAND_CHOICE_COUNT",
      "A Circle of the Land Druid must select exactly one land type.",
      ["build.levels"],
    );
  }
  const landOptions = new Set([
    "srd521.option.druid.land.arid",
    "srd521.option.druid.land.polar",
    "srd521.option.druid.land.temperate",
    "srd521.option.druid.land.tropical",
  ]);
  if (landSelections.some((optionId) => !landOptions.has(optionId))) {
    addValidation(
      state,
      "DRUID_CIRCLE_LAND_OPTION_INVALID",
      "The selected Circle of the Land type is not supported by the loaded Druid content.",
      ["build.levels"],
    );
  }
  const huntersPreySelections = character.build.levels
    .flatMap((level) => level.selectedFeatureChoices)
    .filter((choice) => choice.choiceId === "srd521.choice.ranger.hunters-prey")
    .flatMap((choice) => choice.optionIds);
  if (
    rangerLevel >= 3 &&
    character.build.subclassId === "srd521.subclass.ranger.hunter" &&
    huntersPreySelections.length !== 1
  ) {
    addValidation(
      state,
      "RANGER_HUNTERS_PREY_CHOICE_COUNT",
      "A Hunter Ranger must select exactly one Hunter’s Prey option.",
      ["build.levels"],
    );
  }
  const huntersPreyOptions = new Set([
    "srd521.option.ranger.hunters-prey.colossus-slayer",
    "srd521.option.ranger.hunters-prey.horde-breaker",
  ]);
  if (huntersPreySelections.some((optionId) => !huntersPreyOptions.has(optionId))) {
    addValidation(
      state,
      "RANGER_HUNTERS_PREY_OPTION_INVALID",
      "The selected Hunter’s Prey option is not supported by the loaded Ranger content.",
      ["build.levels"],
    );
  }
  const deftExplorerExpertise = character.build.proficiencyChoices.expertise.filter(
    (choice) => choice.sourceId === "srd521.class-feature.ranger.deft-explorer",
  );
  if (rangerLevel >= 2 && deftExplorerExpertise.length !== 1) {
    addValidation(
      state,
      "RANGER_DEFT_EXPLORER_EXPERTISE_COUNT",
      "A Ranger of level 2 or higher selects one proficient skill for Deft Explorer Expertise.",
      ["build.proficiencyChoices.expertise"],
    );
  }
  const rogueExpertise = character.build.proficiencyChoices.expertise.filter(
    (choice) => choice.sourceId === "srd521.class-feature.rogue.expertise",
  );
  const expectedRogueExpertise = rogueLevel >= 6 ? 4 : rogueLevel > 0 ? 2 : 0;
  if (rogueExpertise.length !== expectedRogueExpertise) {
    addValidation(
      state,
      "ROGUE_EXPERTISE_CHOICE_COUNT",
      `A Rogue of level ${String(rogueLevel)} requires ${String(expectedRogueExpertise)} Expertise selections.`,
      ["build.proficiencyChoices.expertise"],
    );
  }
  const metamagicSelections = character.build.levels
    .flatMap((level) => level.selectedFeatureChoices)
    .filter((choice) => choice.choiceId === "srd521.choice.sorcerer.metamagic")
    .flatMap((choice) => choice.optionIds);
  if (sorcererLevel < 2 && metamagicSelections.length > 0) {
    addValidation(
      state,
      "SORCERER_METAMAGIC_LEVEL_REQUIRED",
      "Metamagic selections require Sorcerer level 2.",
      ["build.levels"],
    );
  }
  if (
    sorcererLevel >= 2 &&
    (metamagicSelections.length !== 2 || new Set(metamagicSelections).size !== 2)
  ) {
    addValidation(
      state,
      "SORCERER_METAMAGIC_CHOICE_COUNT",
      "A Sorcerer of levels 2–9 selects exactly two Metamagic options.",
      ["build.levels"],
    );
  }
  const metamagicOptions = new Set([
    "srd521.option.sorcerer.metamagic.careful",
    "srd521.option.sorcerer.metamagic.distant",
    "srd521.option.sorcerer.metamagic.empowered",
    "srd521.option.sorcerer.metamagic.extended",
    "srd521.option.sorcerer.metamagic.heightened",
    "srd521.option.sorcerer.metamagic.quickened",
    "srd521.option.sorcerer.metamagic.seeking",
    "srd521.option.sorcerer.metamagic.subtle",
    "srd521.option.sorcerer.metamagic.transmuted",
    "srd521.option.sorcerer.metamagic.twinned",
  ]);
  if (metamagicSelections.some((optionId) => !metamagicOptions.has(optionId))) {
    addValidation(
      state,
      "SORCERER_METAMAGIC_OPTION_INVALID",
      "The selected Metamagic option is not supported by the loaded Sorcerer content.",
      ["build.levels"],
    );
  }
  const invocationSelections = character.build.levels.flatMap((level, levelIndex) =>
    level.selectedFeatureChoices
      .filter((choice) => choice.choiceId === "srd521.choice.warlock.eldritch-invocation")
      .flatMap((choice) => choice.optionIds.map((optionId) => ({ levelIndex, optionId }))),
  );
  const warlockEntity = index.entities.get("srd521.class.warlock");
  const expectedInvocations =
    warlockEntity?.kind === "class"
      ? (warlockProgressionBodySchema
          .parse(warlockEntity.body)
          .progression.find((row) => row.level === warlockLevel)?.eldritchInvocations ?? 0)
      : 0;
  const invocationIds = invocationSelections.map((selection) => selection.optionId);
  const selectedInvocationIds = new Set(invocationIds);
  if (
    invocationIds.length !== expectedInvocations ||
    selectedInvocationIds.size !== invocationIds.length
  ) {
    addValidation(
      state,
      "WARLOCK_ELDRITCH_INVOCATION_CHOICE_COUNT",
      `A Warlock of level ${String(warlockLevel)} requires ${String(expectedInvocations)} distinct Eldritch Invocation selections.`,
      ["build.levels"],
    );
  }
  for (const selection of invocationSelections) {
    const option = index.entities.get(selection.optionId);
    const parsed =
      option?.kind === "class-option"
        ? warlockInvocationBodySchema.safeParse(option.body)
        : undefined;
    if (parsed?.success !== true) {
      addValidation(
        state,
        "WARLOCK_ELDRITCH_INVOCATION_OPTION_INVALID",
        `${selection.optionId} is not a loaded Eldritch Invocation option.`,
        ["build.levels"],
      );
      continue;
    }
    const levelAtSelection = character.build.levels
      .slice(0, selection.levelIndex + 1)
      .filter((level) => level.classId === "srd521.class.warlock").length;
    if (levelAtSelection < parsed.data.minimumWarlockLevel) {
      addValidation(
        state,
        "WARLOCK_ELDRITCH_INVOCATION_LEVEL_REQUIRED",
        `${selection.optionId} requires Warlock level ${String(parsed.data.minimumWarlockLevel)}.`,
        ["build.levels"],
      );
    }
    const invocationsAvailableAtSelection = new Set(
      invocationSelections
        .filter((candidate) => candidate.levelIndex <= selection.levelIndex)
        .map((candidate) => candidate.optionId),
    );
    const missingPrerequisites = parsed.data.prerequisiteInvocationIds.filter(
      (optionId) => !invocationsAvailableAtSelection.has(optionId),
    );
    if (missingPrerequisites.length > 0) {
      addValidation(
        state,
        "WARLOCK_ELDRITCH_INVOCATION_PREREQUISITE_MISSING",
        `${selection.optionId} requires ${missingPrerequisites.join(", ")}.`,
        ["build.levels"],
      );
    }
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
  state.facts["equipment.wieldingShield"] = equippedEntityIds.includes("srd521.equipment.shield");
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
  const selectedClassOptions = new Set(
    character.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .flatMap((choice) => choice.optionIds),
  );
  if (selectedClassOptions.has("srd521.option.cleric.divine-order.protector")) {
    armorTraining.add("heavy");
    weaponProficiencies.add("martial");
  }
  if (selectedClassOptions.has("srd521.option.druid.primal-order.warden")) {
    armorTraining.add("medium");
    weaponProficiencies.add("martial");
  }
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
  return {
    items,
    armorTraining,
    weaponProficiencies,
    conditionalWeaponProficiencies: classBody?.conditionalWeaponProficiencies ?? [],
    rollEffects,
  };
}

function evaluateWalkingSpeed(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): void {
  const base = state.facts["speed.walking.base"];
  const armorPenalty = state.facts["speed.armorPenalty"];
  if (typeof base !== "number" || typeof armorPenalty !== "number") {
    return;
  }
  const classEntity = startingClassEntity(character, index);
  const classBody = classEntity === undefined ? undefined : classBodySchema.parse(classEntity.body);
  const classLevel =
    classEntity === undefined
      ? 0
      : character.build.levels.filter((level) => level.classId === classEntity.id).length;
  const unarmoredMovement =
    state.facts["equipment.wearingArmor"] === false &&
    state.facts["equipment.wieldingShield"] === false
      ? (classBody?.progression.find((row) => row.level === classLevel)?.unarmoredMovement ?? 0)
      : 0;
  const walkingSpeedBonus =
    state.facts["equipment.wearingHeavyArmor"] === false
      ? (classBody?.progression.find((row) => row.level === classLevel)?.walkingSpeedBonus ?? 0)
      : 0;
  const movementTraceId = "speed.unarmoredMovement";
  state.facts[movementTraceId] = unarmoredMovement;
  state.values[movementTraceId] = { value: unarmoredMovement, traceId: movementTraceId };
  state.traces[movementTraceId] = {
    id: movementTraceId,
    result: unarmoredMovement,
    nodes: [
      {
        id: `${movementTraceId}.class-progression`,
        operation: "apply-unarmored-movement",
        inputs: [
          classLevel,
          state.facts["equipment.wearingArmor"] ?? false,
          state.facts["equipment.wieldingShield"] ?? false,
        ],
        output: unarmoredMovement,
      },
    ],
    sourceReferences: classEntity === undefined ? [] : entitySourceReferences(classEntity),
  };
  const classBonusTraceId = "speed.classBonus";
  state.facts[classBonusTraceId] = walkingSpeedBonus;
  state.values[classBonusTraceId] = { value: walkingSpeedBonus, traceId: classBonusTraceId };
  state.traces[classBonusTraceId] = {
    id: classBonusTraceId,
    result: walkingSpeedBonus,
    nodes: [
      {
        id: `${classBonusTraceId}.class-progression`,
        operation: "apply-class-walking-speed-bonus",
        inputs: [classLevel, state.facts["equipment.wearingHeavyArmor"] ?? false],
        output: walkingSpeedBonus,
      },
    ],
    sourceReferences:
      classEntity === undefined || walkingSpeedBonus === 0
        ? []
        : entitySourceReferences(classEntity),
  };
  const traceId = "speed.walking";
  const value = Math.max(0, base + armorPenalty + unarmoredMovement + walkingSpeedBonus);
  state.facts[traceId] = value;
  state.values[traceId] = { value, traceId };
  state.traces[traceId] = {
    id: traceId,
    result: value,
    nodes: [
      {
        id: `${traceId}.combine`,
        operation: "apply-walking-speed-modifiers",
        inputs: [base, armorPenalty, unarmoredMovement, walkingSpeedBonus],
        output: value,
      },
    ],
    sourceReferences: [
      ...(state.traces["speed.walking.base"]?.sourceReferences ?? []),
      ...(state.traces["speed.armorPenalty"]?.sourceReferences ?? []),
      ...state.traces[movementTraceId].sourceReferences,
      ...state.traces[classBonusTraceId].sourceReferences,
    ],
  };
}

function evaluateFeatureSaveDifficultyClass(
  character: CharacterDocument,
  index: PackageIndex,
  state: EngineState,
): void {
  const classEntity = startingClassEntity(character, index);
  if (classEntity === undefined) {
    return;
  }
  const classBody = classBodySchema.parse(classEntity.body);
  if (classBody.featureSaveAbility === undefined) {
    return;
  }
  const classSlug = classEntity.id.split(".").at(-1) ?? classEntity.id;
  const abilityModifier = requireNumber(
    state.facts[`ability.${classBody.featureSaveAbility}.modifier`] ?? null,
    `${classEntity.name.en ?? classEntity.id} feature save ability modifier`,
  );
  const proficiencyBonus = requireNumber(state.facts.proficiencyBonus ?? null, "Proficiency Bonus");
  const value = 8 + abilityModifier + proficiencyBonus;
  const traceId = `classFeature.${classSlug}.saveDifficultyClass`;
  state.facts[traceId] = value;
  state.values[traceId] = { value, traceId };
  state.traces[traceId] = {
    id: traceId,
    result: value,
    nodes: [
      {
        id: `${traceId}.sum`,
        operation: "add-feature-save-base-ability-and-proficiency",
        inputs: [8, abilityModifier, proficiencyBonus],
        output: value,
      },
    ],
    sourceReferences: entitySourceReferences(classEntity),
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
  for (const choice of character.build.proficiencyChoices.expertise) {
    if (!selectedSkillIds.has(choice.skillId)) {
      addValidation(
        state,
        "EXPERTISE_REQUIRES_PROFICIENCY",
        `${choice.skillId} must be proficient before it can gain Expertise.`,
        ["build.proficiencyChoices.expertise"],
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
    const firstClassLevel = character.build.levels.filter(
      (level) => level.classId === firstClassId,
    ).length;
    const requiredClassSkills =
      firstClassBody.skillProficiencyChoice.countByLevel?.[String(firstClassLevel)];
    const minimum = requiredClassSkills ?? firstClassBody.skillProficiencyChoice.minimum;
    const maximum = requiredClassSkills ?? firstClassBody.skillProficiencyChoice.maximum;
    if (classChoices.length < minimum || classChoices.length > maximum) {
      addValidation(
        state,
        "CLASS_SKILL_PROFICIENCY_COUNT",
        `${firstClassId} requires ${String(minimum)} skill proficiency choices.`,
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
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  granted: ReadonlySet<string>,
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
  for (const { ir, rule } of rules) {
    if (
      rule.type !== "add-modifier" ||
      rule.target !== "hitPoints.maximum" ||
      rule.expression === undefined
    ) {
      continue;
    }
    if (
      rule.when !== undefined &&
      evaluatePredicate(rule.when, `${rule.id}.hit-points-applicable`, state, index, granted)
        .result !== true
    ) {
      continue;
    }
    const modifierTrace = evaluateExpression(
      rule.expression,
      `hitPoints.maximum.${rule.id}`,
      state,
      index,
      granted,
    );
    const modifier = requireNumber(modifierTrace.result as JsonScalar, rule.id);
    maximum += modifier;
    nodes.push({
      id: `hitPoints.maximum.${rule.id}.apply`,
      operation: "apply-hit-point-modifier",
      inputs: [modifier],
      output: modifier,
      label: ir.text.title,
    });
    sources.push(...sourceReferences(ir));
  }
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
  const spellcastingClass = [...classLevels.entries()]
    .map(([classId, classLevel]) => {
      const entity = index.entities.get(classId);
      const body =
        entity?.kind === "class" ? spellcastingClassBodySchema.safeParse(entity.body) : undefined;
      return entity?.kind === "class" && body?.success === true
        ? { classId, classLevel, entity, body: body.data }
        : undefined;
    })
    .find((entry) => entry !== undefined);
  if (spellcastingClass === undefined) {
    return;
  }
  const { classId, classLevel, entity: classEntity, body: classBody } = spellcastingClass;
  const className = classEntity.name.en ?? classId;
  const classCode = className.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
  const classSlug = classId.split(".").at(-1) ?? classId;
  const progression = classBody.progression.find((row) => row.level === classLevel);
  if (progression === undefined) {
    addValidation(
      state,
      `${classCode}_PROGRESSION_MISSING`,
      `The ${className} progression has no level ${String(classLevel)} row.`,
      ["build.levels"],
    );
    return;
  }
  const abilityModifier = requireNumber(
    state.facts[`ability.${classBody.spellcastingAbility}.modifier`] ?? null,
    `${className} spellcasting ability modifier`,
  );
  const proficiencyBonus = requireNumber(state.facts.proficiencyBonus ?? null, "Proficiency Bonus");
  const attackBonus = abilityModifier + proficiencyBonus;
  const saveDifficultyClass = 8 + abilityModifier + proficiencyBonus;
  const classSources = entitySourceReferences(classEntity);
  const attackTraceId = `spellcasting.${classSlug}.attackBonus`;
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
  const saveTraceId = `spellcasting.${classSlug}.saveDifficultyClass`;
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
      const traceId = `spellcasting.${classSlug}.slots.${level}`;
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
            inputs: [classLevel, Number(level)],
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
        `${className} level ${String(classLevel)} has no level ${level} spell slots.`,
        [`state.expendedSpellSlots.${level}`],
      );
    }
  }

  const spellList = new Set(classBody.spellList);
  const selectedPrepared = new Set(character.loadout.preparedSpellIds);
  const learned = new Set(character.build.learnedSpellIds);
  const subclass =
    character.build.subclassId === undefined
      ? undefined
      : index.entities.get(character.build.subclassId);
  const subclassBody =
    subclass?.kind === "subclass" ? spellcastingSubclassBodySchema.parse(subclass.body) : undefined;
  const selectedOptionIds = new Set(
    character.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .flatMap((choice) => choice.optionIds),
  );
  const alwaysPrepared = new Set([
    ...Object.entries(classBody.alwaysPreparedSpells).flatMap(([level, spellIds]) =>
      Number(level) <= classLevel ? spellIds : [],
    ),
    ...Object.entries(subclassBody?.alwaysPreparedSpells ?? {}).flatMap(([level, spellIds]) =>
      Number(level) <= classLevel ? spellIds : [],
    ),
    ...Object.entries(subclassBody?.alwaysPreparedSpellChoices ?? {}).flatMap(
      ([optionId, spellsByLevel]) =>
        selectedOptionIds.has(optionId)
          ? Object.entries(spellsByLevel).flatMap(([level, spellIds]) =>
              Number(level) <= classLevel ? spellIds : [],
            )
          : [],
    ),
  ]);
  const prepared = new Set([...selectedPrepared, ...alwaysPrepared]);
  const displayedSpellIds =
    classBody.spellPreparation === "spellbook"
      ? [...learned]
      : [...new Set([...learned, ...prepared])];
  const maximumSpellLevel = Math.max(...Object.keys(progression.spellSlots).map(Number));
  if (learned.size !== character.build.learnedSpellIds.length) {
    addValidation(
      state,
      "DUPLICATE_LEARNED_SPELL",
      "The spellbook cannot contain duplicate spell selections.",
      ["build.learnedSpellIds"],
    );
  }
  if (selectedPrepared.size !== character.loadout.preparedSpellIds.length) {
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
    if (!spellList.has(spellId)) {
      addValidation(
        state,
        `SPELL_NOT_ON_${classCode}_LIST`,
        `${spellId} is not on the ${className} spell list.`,
        [`build.learnedSpellIds.${String(position)}`],
      );
    }
    if (body.level > maximumSpellLevel) {
      addValidation(
        state,
        `${classCode}_SPELL_LEVEL_UNAVAILABLE`,
        `${spellId} requires level ${String(body.level)} spell slots.`,
        [`build.learnedSpellIds.${String(position)}`],
      );
    }
    if (body.level === 0) {
      learnedCantrips += 1;
    } else {
      learnedLeveledSpells += 1;
      if (classBody.spellPreparation === "full-list") {
        addValidation(
          state,
          `${classCode}_LEVELED_SPELL_RECORDED_AS_LEARNED`,
          `${className} records level 1+ spells as prepared rather than learned.`,
          [`build.learnedSpellIds.${String(position)}`],
        );
      }
    }
  }
  for (const [position, spellId] of character.loadout.preparedSpellIds.entries()) {
    const entity = index.entities.get(spellId);
    if (classBody.spellPreparation === "spellbook" && !learned.has(spellId)) {
      addValidation(
        state,
        "PREPARED_SPELL_NOT_IN_SPELLBOOK",
        `${spellId} is prepared but not recorded in the spellbook.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
    if (entity?.kind !== "spell") {
      addValidation(
        state,
        "PREPARED_SPELL_ENTITY_MISSING",
        `Prepared spell ${spellId} is not loaded.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
      continue;
    }
    const body = spellBodySchema.parse(entity.body);
    if (!spellList.has(spellId)) {
      addValidation(
        state,
        `SPELL_NOT_ON_${classCode}_LIST`,
        `${spellId} is not on the ${className} spell list.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
    if (body.level > maximumSpellLevel) {
      addValidation(
        state,
        `${classCode}_SPELL_LEVEL_UNAVAILABLE`,
        `${spellId} requires level ${String(body.level)} spell slots.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
    if (body.level === 0) {
      addValidation(
        state,
        "CANTRIP_CANNOT_BE_PREPARED",
        `${spellId} is a cantrip and does not use a prepared-spell selection.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
    if (alwaysPrepared.has(spellId)) {
      addValidation(
        state,
        "ALWAYS_PREPARED_SPELL_SELECTED",
        `${spellId} is always prepared and does not use a prepared-spell selection.`,
        [`loadout.preparedSpellIds.${String(position)}`],
      );
    }
  }
  if (selectedPrepared.size !== progression.preparedSpells) {
    addValidation(
      state,
      `${classCode}_PREPARED_SPELL_COUNT`,
      `${className} level ${String(classLevel)} requires ${String(progression.preparedSpells)} prepared spells.`,
      ["loadout.preparedSpellIds"],
    );
  }
  const additionalOrderCantrips = [
    "srd521.option.cleric.divine-order.thaumaturge",
    "srd521.option.druid.primal-order.magician",
  ].filter((optionId) => selectedOptionIds.has(optionId)).length;
  const expectedCantrips = progression.cantrips + additionalOrderCantrips;
  if (learnedCantrips !== expectedCantrips) {
    addValidation(
      state,
      `${classCode}_CANTRIP_COUNT`,
      `${className} level ${String(classLevel)} knows ${String(expectedCantrips)} cantrips.`,
      ["build.learnedSpellIds"],
    );
  }
  const spellbookMinimum =
    classBody.spellPreparation === "spellbook" &&
    classBody.spellbookStartingSpells !== undefined &&
    classBody.spellbookSpellsPerLevel !== undefined
      ? classBody.spellbookStartingSpells +
        classBody.spellbookSpellsPerLevel * Math.max(0, classLevel - 1)
      : undefined;
  if (spellbookMinimum !== undefined && learnedLeveledSpells < spellbookMinimum) {
    addValidation(
      state,
      `${classCode}_SPELLBOOK_BELOW_MINIMUM`,
      `${className} level ${String(classLevel)} has at least ${String(spellbookMinimum)} level 1+ spells in the spellbook.`,
      ["build.learnedSpellIds"],
    );
  }
  for (const spellId of displayedSpellIds) {
    const entity = index.entities.get(spellId);
    if (entity?.kind !== "spell") {
      if (alwaysPrepared.has(spellId)) {
        addValidation(
          state,
          "ALWAYS_PREPARED_SPELL_ENTITY_MISSING",
          `Always-prepared spell ${spellId} is not loaded.`,
          ["build.subclassId"],
        );
      }
      continue;
    }
    const body = spellBodySchema.parse(entity.body);
    const cantripDamageMultiplier =
      body.level !== 0
        ? 1
        : character.build.levels.length >= 17
          ? 4
          : character.build.levels.length >= 11
            ? 3
            : character.build.levels.length >= 5
              ? 2
              : 1;
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
      damage: body.damage.map((damage) => ({
        ...damage,
        diceCount: damage.diceCount * cantripDamageMultiplier,
      })),
      hasHigherLevelEffect: body.hasHigherLevelEffect,
      sources: entitySourceReferences(entity),
    });
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
    } else if (!displayedSpellIds.includes(character.state.concentrationSpellId)) {
      addValidation(
        state,
        "CONCENTRATION_SPELL_NOT_KNOWN",
        `${character.state.concentrationSpellId} is not available to this ${className}.`,
        ["state.concentrationSpellId"],
      );
    }
  }
  state.spells.sort(
    (left, right) => left.level - right.level || left.name.localeCompare(right.name),
  );
  if (classBody.spellcastingModel === "pact-magic") {
    const pactSlots =
      progression.pactSlots ?? slots.reduce((total, slot) => total + slot.maximum, 0);
    const pactSlotLevel = progression.pactSlotLevel ?? slots[0]?.level;
    state.facts[`spellcasting.${classSlug}.pactSlots.maximum`] = pactSlots;
    if (pactSlotLevel !== undefined) {
      state.facts[`spellcasting.${classSlug}.pactSlotLevel`] = pactSlotLevel;
    }
  }
  state.spellcasting = {
    classId,
    model: classBody.spellcastingModel,
    slotRecharge: classBody.slotRecharge,
    ability: classBody.spellcastingAbility,
    abilityModifier,
    attackBonus,
    saveDifficultyClass,
    cantripsKnown: expectedCantrips,
    preparedSpellLimit: progression.preparedSpells,
    alwaysPreparedSpells: alwaysPrepared.size,
    ...(spellbookMinimum === undefined ? {} : { spellbookMinimum }),
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

function weaponIsProficient(
  weapon: z.infer<typeof weaponBodySchema>,
  equipment: EquipmentContext,
): boolean {
  return (
    equipment.weaponProficiencies.has(weapon.category) ||
    equipment.conditionalWeaponProficiencies.some(
      (grant) =>
        grant.category === weapon.category &&
        grant.attackType === weapon.attackType &&
        grant.requiredProperties.every((property) => weapon.properties.includes(property)),
    )
  );
}

function weaponIsMonkWeapon(
  weapon: z.infer<typeof weaponBodySchema>,
  martialArts: NonNullable<z.infer<typeof classBodySchema>["martialArts"]>,
): boolean {
  return (
    weapon.attackType === martialArts.monkWeapon.attackType &&
    (martialArts.monkWeapon.categories.includes(weapon.category) ||
      martialArts.monkWeapon.conditionalCategories.some(
        (grant) =>
          grant.category === weapon.category &&
          grant.requiredProperties.every((property) => weapon.properties.includes(property)),
      ))
  );
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
  const classProgression = classBody?.progression.find((row) => row.level === classLevel);
  const martialArts = classBody?.martialArts;
  const equippedWeapons = equipment.items.filter(
    (item) => item.equipped && item.entity?.kind === "equipment-weapon",
  );
  const martialArtsActive =
    martialArts !== undefined &&
    classProgression?.martialArtsDie !== undefined &&
    state.facts["equipment.wearingArmor"] === false &&
    state.facts["equipment.wieldingShield"] === false &&
    equippedWeapons.every((item) =>
      item.entity === undefined
        ? false
        : weaponIsMonkWeapon(weaponBodySchema.parse(item.entity.body), martialArts),
    );
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
      if (!weaponIsProficient(weapon, equipment)) {
        addValidation(
          state,
          "WEAPON_MASTERY_REQUIRES_PROFICIENCY",
          `${masteryId} cannot be selected without weapon proficiency.`,
          ["loadout.selectedWeaponMasteryIds"],
        );
      } else if (
        classBody?.weaponMasteryChoice !== undefined &&
        (!classBody.weaponMasteryChoice.categories.includes(weapon.category) ||
          !classBody.weaponMasteryChoice.attackTypes.includes(weapon.attackType))
      ) {
        addValidation(
          state,
          "WEAPON_MASTERY_CLASS_RESTRICTION",
          `${masteryId} is not eligible for this class's Weapon Mastery choice.`,
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
    const monkWeapon = martialArtsActive && weaponIsMonkWeapon(weapon, martialArts);
    const ability: Ability =
      finesse || monkWeapon
        ? dexterityModifier > strengthModifier
          ? "dexterity"
          : "strength"
        : weapon.attackType === "ranged"
          ? "dexterity"
          : "strength";
    const abilityModifier = ability === "strength" ? strengthModifier : dexterityModifier;
    const proficient = weaponIsProficient(weapon, equipment);
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
          operation: finesse
            ? "select-finesse-ability"
            : monkWeapon
              ? "select-martial-arts-ability"
              : "select-weapon-ability",
          inputs:
            finesse || monkWeapon
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

    const martialArtsDie = monkWeapon ? classProgression.martialArtsDie : undefined;
    const damage =
      martialArtsDie !== undefined && (weapon.damage.diceSize ?? 0) < martialArtsDie.diceSize
        ? {
            ...weapon.damage,
            diceCount: martialArtsDie.diceCount,
            diceSize: martialArtsDie.diceSize,
          }
        : weapon.damage;
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
  if (martialArts !== undefined && classProgression?.martialArtsDie !== undefined) {
    const ability: Ability =
      martialArtsActive && dexterityModifier > strengthModifier ? martialArts.ability : "strength";
    const abilityModifier = ability === "dexterity" ? dexterityModifier : strengthModifier;
    const attackBonus = abilityModifier + proficiencyBonus;
    const attackId = "attack.unarmed-strike";
    const traceId = `${attackId}.bonus`;
    const sources = classEntity === undefined ? [] : entitySourceReferences(classEntity);
    state.traces[traceId] = {
      id: traceId,
      result: attackBonus,
      nodes: [
        {
          id: `${traceId}.ability`,
          operation: martialArtsActive
            ? "select-martial-arts-ability"
            : "select-unarmed-strike-ability",
          inputs: [strengthModifier, dexterityModifier, martialArtsActive],
          output: abilityModifier,
          label: ability,
        },
        {
          id: `${traceId}.proficiency`,
          operation: "apply-unarmed-strike-proficiency",
          inputs: [proficiencyBonus],
          output: proficiencyBonus,
        },
        {
          id: `${traceId}.total`,
          operation: "add",
          inputs: [abilityModifier, proficiencyBonus],
          output: attackBonus,
        },
      ],
      sourceReferences: sources,
    };
    state.facts[traceId] = attackBonus;
    state.values[traceId] = { value: attackBonus, traceId };
    const damageBonusTraceId = `${attackId}.damageBonus`;
    state.traces[damageBonusTraceId] = {
      id: damageBonusTraceId,
      result: abilityModifier,
      nodes: [
        {
          id: `${damageBonusTraceId}.ability`,
          operation: "apply-damage-ability-modifier",
          inputs: [ability, abilityModifier],
          output: abilityModifier,
        },
      ],
      sourceReferences: sources,
    };
    state.facts[damageBonusTraceId] = abilityModifier;
    state.values[damageBonusTraceId] = { value: abilityModifier, traceId: damageBonusTraceId };
    state.attacks.push({
      id: attackId,
      itemId: "unarmed-strike",
      weaponId: "srd521.attack.unarmed-strike",
      name: "Unarmed Strike",
      ability,
      attackBonus,
      proficient: true,
      damage: {
        ...(martialArtsActive
          ? {
              diceCount: classProgression.martialArtsDie.diceCount,
              diceSize: classProgression.martialArtsDie.diceSize,
            }
          : { flat: 1 }),
        bonus: abilityModifier,
        type: "bludgeoning",
        traceId: damageBonusTraceId,
      },
      attackType: "melee",
      properties: ["unarmed-strike", ...(martialArtsActive ? ["martial-arts"] : [])],
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
      if (parameters.spellId !== undefined) {
        actionParameters.spellId = parameters.spellId;
      }
      if (parameters.extraDamage !== undefined && rule.expression !== undefined) {
        const damageTraceId = `${rule.target ?? rule.id}.extraDamage.diceCount`;
        const damageTrace = evaluateExpression(
          rule.expression,
          damageTraceId,
          state,
          index,
          granted,
          resourceAmounts,
        );
        const diceCount = requireNumber(damageTrace.result as JsonScalar, damageTraceId);
        state.traces[damageTraceId] = withRuleSource(damageTrace, ir);
        state.facts[damageTraceId] = diceCount;
        state.values[damageTraceId] = { value: diceCount, traceId: damageTraceId };
        actionParameters.extraDamage = { ...parameters.extraDamage, diceCount };
      }
      if (parameters.requirements !== undefined) {
        actionParameters.requirements = parameters.requirements;
      }
      if (parameters.setsSpeed !== undefined) {
        actionParameters.setsSpeed = parameters.setsSpeed;
      }
      if (parameters.sneakAttackDiceCost !== undefined) {
        actionParameters.sneakAttackDiceCost = parameters.sneakAttackDiceCost;
      }
      if (parameters.savingThrow !== undefined) {
        const difficultyClass = requireNumber(
          state.facts[parameters.savingThrow.difficultyClassFact] ?? null,
          parameters.savingThrow.difficultyClassFact,
        );
        actionParameters.savingThrow = {
          ability: parameters.savingThrow.ability,
          difficultyClass,
        };
      }
      if (parameters.damageReductionFraction !== undefined) {
        actionParameters.damageReductionFraction = parameters.damageReductionFraction;
      }
      if (parameters.restoresResource !== undefined) {
        const baseAmount = requireNumber(
          state.facts[parameters.restoresResource.amountFact] ?? null,
          parameters.restoresResource.amountFact,
        );
        const scaledAmount = baseAmount * parameters.restoresResource.fraction;
        actionParameters.restoresResource = {
          resourceId: parameters.restoresResource.resourceId,
          amount:
            parameters.restoresResource.round === "up"
              ? Math.ceil(scaledAmount)
              : Math.floor(scaledAmount),
        };
      }
      if (parameters.restoresSpellSlots !== undefined) {
        const baseAmount = requireNumber(
          state.facts[parameters.restoresSpellSlots.amountFact] ?? null,
          parameters.restoresSpellSlots.amountFact,
        );
        const slotLevel = requireNumber(
          state.facts[parameters.restoresSpellSlots.slotLevelFact] ?? null,
          parameters.restoresSpellSlots.slotLevelFact,
        );
        const scaledAmount = baseAmount * parameters.restoresSpellSlots.fraction;
        actionParameters.restoresSpellSlots = {
          amount:
            parameters.restoresSpellSlots.round === "up"
              ? Math.ceil(scaledAmount)
              : Math.floor(scaledAmount),
          slotLevel,
        };
      }
      if (parameters.variableSpend !== undefined) {
        actionParameters.variableSpend = parameters.variableSpend;
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

function evaluateMovementRules(
  rules: { ir: AuthoringIr; rule: DraftRule }[],
  granted: ReadonlySet<string>,
  index: PackageIndex,
  state: EngineState,
): void {
  for (const { ir, rule } of rules) {
    if (
      rule.type !== "add-candidate-calculation" ||
      rule.target?.startsWith("speed.") !== true ||
      rule.expression === undefined
    ) {
      continue;
    }
    if (
      rule.when !== undefined &&
      evaluatePredicate(rule.when, `${rule.target}.applicable`, state, index, granted).result !==
        true
    ) {
      continue;
    }
    const trace = evaluateExpression(rule.expression, rule.target, state, index, granted);
    const value = requireNumber(trace.result as JsonScalar, rule.target);
    state.traces[rule.target] = withRuleSource(trace, ir);
    state.facts[rule.target] = value;
    state.values[rule.target] = { value, traceId: rule.target };
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
  character.build.levels
    .flatMap((level) => level.selectedFeatureChoices)
    .flatMap((choice) => choice.optionIds)
    .forEach((optionId) => granted.add(optionId));
  const rules = applicableRules(index, granted);
  evaluateAbilities(state);
  evaluateProficiency(state);
  evaluateFeatureSaveDifficultyClass(character, index, state);
  const equipment = resolveEquipment(character, index, state);
  evaluateWalkingSpeed(character, index, state);
  evaluateMovementRules(rules, granted, index, state);
  evaluateD20Tests(character, origins, index, state, input.context, [
    ...equipment.rollEffects,
    ...ruleRollEffects(rules, state, index, granted),
  ]);
  evaluateHitPoints(character, rules, granted, index, state);
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
