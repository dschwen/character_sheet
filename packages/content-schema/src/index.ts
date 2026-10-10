import { z } from "zod";

export const entityIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Must be a stable, namespaced entity ID");

export const factPathSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*$/, "Must be a dotted fact path");

export const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export type JsonScalar = z.infer<typeof jsonScalarSchema>;
export type EntityId = z.infer<typeof entityIdSchema>;
export type FactPath = z.infer<typeof factPathSchema>;

export type Expr =
  | { kind: "literal"; value: JsonScalar }
  | { kind: "ref"; path: FactPath }
  | { kind: "add"; args: Expr[] }
  | { kind: "multiply"; args: Expr[] }
  | { kind: "floor"; value: Expr }
  | { kind: "min"; args: Expr[] }
  | { kind: "max"; args: Expr[] }
  | { kind: "if"; condition: Predicate; then: Expr; else: Expr }
  | { kind: "tableLookup"; table: EntityId; key: Expr };

export type Predicate =
  | { kind: "all"; args: Predicate[] }
  | { kind: "any"; args: Predicate[] }
  | { kind: "not"; arg: Predicate }
  | { kind: "equals"; left: Expr; right: Expr }
  | { kind: "compare"; op: "lt" | "lte" | "gt" | "gte"; left: Expr; right: Expr }
  | { kind: "hasEntity"; entityId: EntityId }
  | { kind: "hasTag"; subject: Expr; tag: string }
  | { kind: "isEquipped"; itemId: EntityId }
  | { kind: "resourceAvailable"; resourceId: EntityId };

export const exprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("literal"), value: jsonScalarSchema }).strict(),
    z.object({ kind: z.literal("ref"), path: factPathSchema }).strict(),
    z.object({ kind: z.literal("add"), args: z.array(exprSchema).min(1) }).strict(),
    z.object({ kind: z.literal("multiply"), args: z.array(exprSchema).min(1) }).strict(),
    z.object({ kind: z.literal("floor"), value: exprSchema }).strict(),
    z.object({ kind: z.literal("min"), args: z.array(exprSchema).min(1) }).strict(),
    z.object({ kind: z.literal("max"), args: z.array(exprSchema).min(1) }).strict(),
    z
      .object({
        kind: z.literal("if"),
        condition: z.lazy(() => predicateSchema),
        then: exprSchema,
        else: exprSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("tableLookup"),
        table: entityIdSchema,
        key: exprSchema,
      })
      .strict(),
  ]),
);

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("all"), args: z.array(predicateSchema) }).strict(),
    z.object({ kind: z.literal("any"), args: z.array(predicateSchema) }).strict(),
    z.object({ kind: z.literal("not"), arg: predicateSchema }).strict(),
    z.object({ kind: z.literal("equals"), left: exprSchema, right: exprSchema }).strict(),
    z
      .object({
        kind: z.literal("compare"),
        op: z.enum(["lt", "lte", "gt", "gte"]),
        left: exprSchema,
        right: exprSchema,
      })
      .strict(),
    z.object({ kind: z.literal("hasEntity"), entityId: entityIdSchema }).strict(),
    z.object({ kind: z.literal("hasTag"), subject: exprSchema, tag: z.string().min(1) }).strict(),
    z.object({ kind: z.literal("isEquipped"), itemId: entityIdSchema }).strict(),
    z.object({ kind: z.literal("resourceAvailable"), resourceId: entityIdSchema }).strict(),
  ]),
);

export const sourceSpanSchema = z
  .object({
    sourceId: z.string().min(1),
    page: z.number().int().positive(),
    blocks: z.array(z.string().min(1)).optional(),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const sourceManifestSchema = z
  .object({
    source_id: z.string().min(1),
    source_url: z.string().url().startsWith("https://"),
    retrieved_at: z.string().datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    page_count: z.number().int().positive(),
    license: z.literal("CC-BY-4.0"),
    http_headers: z.record(z.string()).optional(),
    pdf_metadata: z.record(z.string()).optional(),
  })
  .strict();

export const packageManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    ruleset: z.literal("dnd5e-2024"),
    source: z
      .object({
        id: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    license: z.literal("CC-BY-4.0"),
    dependencies: z.array(z.string().min(1)),
    engineCompatibility: z.string().min(1),
  })
  .strict();

export const reviewStatusSchema = z.enum([
  "UNCLASSIFIED",
  "TEXT_ONLY",
  "STRUCTURED",
  "EXECUTABLE",
  "TESTED",
  "VERIFIED",
]);

export const automationLevelSchema = z.enum([
  "display-only",
  "structured",
  "sheet-automated",
  "roll-assisted",
  "state-automated",
  "fully-automated",
]);

export const draftRuleTypeSchema = z.enum([
  "grant-resource",
  "grant-action",
  "grant-resistance",
  "add-modifier",
  "grant-advantage",
  "add-validation",
  "add-candidate-calculation",
  "set-attack-count",
  "set-critical-threshold",
]);

export const draftRuleSchema = z
  .object({
    id: z.string().min(1),
    type: draftRuleTypeSchema,
    target: z.string().min(1).optional(),
    when: predicateSchema.optional(),
    expression: exprSchema.optional(),
    parameters: z.record(z.unknown()).default({}),
    automationLevel: automationLevelSchema,
  })
  .strict();

export const authoringIrSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    id: entityIdSchema,
    kind: z.enum(["class-feature", "subclass-feature", "feat"]),
    parentId: entityIdSchema,
    level: z.number().int().min(1).max(20),
    source: z.array(sourceSpanSchema).min(1),
    text: z
      .object({
        title: z.string().min(1),
        nodes: z.array(
          z
            .object({
              kind: z.enum(["ParagraphNode", "ListNode"]),
              text: z.string().min(1),
              items: z.array(z.string().min(1)).optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    proposedRules: z.array(draftRuleSchema),
    review: z
      .object({
        extraction: z.literal("approved"),
        semantics: z.enum(["missing", "needs-review", "approved"]),
        tests: z.enum(["missing", "draft", "approved"]),
        notes: z.array(z.string()).default([]),
      })
      .strict(),
  })
  .strict();

export const contentEntitySchema = z
  .object({
    id: entityIdSchema,
    kind: z.string().min(1),
    name: z.record(z.string().min(2), z.string().min(1)),
    tags: z.array(z.string().min(1)),
    source: z.array(sourceSpanSchema),
    body: z.unknown(),
    rules: z.array(z.unknown()),
    review: z
      .object({
        status: reviewStatusSchema,
        extractionApproved: z.boolean(),
        semanticsApproved: z.boolean(),
        testsApproved: z.boolean(),
        notes: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const startingEquipmentItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("entity"),
      entityId: entityIdSchema,
      quantity: z.number().int().positive(),
      equipped: z.boolean().default(false),
      label: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      name: z.string().min(1),
      quantity: z.number().int().positive(),
    })
    .strict(),
]);

export const startingEquipmentOptionSchema = z
  .object({
    id: entityIdSchema,
    label: z.string().min(1),
    items: z.array(startingEquipmentItemSchema),
    currencyGp: z.number().int().nonnegative(),
  })
  .strict();

export const startingEquipmentChoiceSchema = z
  .object({
    id: entityIdSchema,
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().positive(),
    options: z.array(startingEquipmentOptionSchema).min(1),
  })
  .strict()
  .superRefine((choice, context) => {
    if (choice.minimum > choice.maximum || choice.maximum > choice.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Starting-equipment bounds must fit the available options",
        path: ["maximum"],
      });
    }
    if (new Set(choice.options.map((option) => option.id)).size !== choice.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Starting-equipment option IDs must be unique",
        path: ["options"],
      });
    }
  });

export const characterBuilderAbilitySchema = z.enum([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
]);

export const classBuilderMetadataSchema = z
  .object({
    supportedLevelMinimum: z.number().int().min(1).max(20),
    supportedLevelMaximum: z.number().int().min(1).max(20),
    defaultAbilityScores: z
      .object({
        strength: z.number().int().min(3).max(18),
        dexterity: z.number().int().min(3).max(18),
        constitution: z.number().int().min(3).max(18),
        intelligence: z.number().int().min(3).max(18),
        wisdom: z.number().int().min(3).max(18),
        charisma: z.number().int().min(3).max(18),
      })
      .strict(),
    defaultAbilityScoreImprovementAbility: characterBuilderAbilitySchema,
    defaultClassSkillIds: z.array(entityIdSchema),
    defaultGrantedFeatIds: z.array(entityIdSchema).default([]),
    expertiseChoice: z
      .object({
        sourceId: entityIdSchema,
        minimumLevel: z.number().int().min(1).max(20),
        eligibleSkillIds: z.array(entityIdSchema).min(1),
        requireClassProficiency: z.boolean().default(true),
        countByLevel: z.record(z.string(), z.number().int().nonnegative()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    if (metadata.supportedLevelMaximum < metadata.supportedLevelMinimum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supportedLevelMaximum"],
        message: "Must be greater than or equal to supportedLevelMinimum",
      });
    }
  });

export const classFeatureChoiceSchema = z
  .object({
    id: entityIdSchema,
    level: z.number().int().min(1).max(20),
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().positive(),
    countByLevel: z.record(z.string(), z.number().int().nonnegative()).optional(),
    options: z.array(entityIdSchema).min(1),
    defaultOptionIds: z.array(entityIdSchema).optional(),
    changeOn: z.array(z.enum(["level-up", "short-rest", "long-rest"])).optional(),
    replacementMaximum: z.number().int().positive().optional(),
    spellSelection: z
      .object({
        sourceFeatureId: entityIdSchema,
        castingClassId: entityIdSchema,
        sourceClassIds: z.array(entityIdSchema).min(1),
        alwaysPrepared: z.boolean(),
        spellbookAddition: z.literal(true).optional(),
        allowCantrips: z.boolean(),
        school: z.string().min(1).optional(),
        maximumSpellLevel: z.number().int().min(0).max(9).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((choice, context) => {
    if (
      choice.spellSelection?.alwaysPrepared !== undefined &&
      choice.spellSelection.alwaysPrepared === (choice.spellSelection.spellbookAddition === true)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Spell choices must grant either preparation or spellbook additions, not both",
        path: ["spellSelection"],
      });
    }
    if (choice.minimum > choice.maximum || choice.maximum > choice.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Class-feature choice bounds must fit the available options",
        path: ["maximum"],
      });
    }
    if (
      choice.countByLevel !== undefined &&
      Object.entries(choice.countByLevel).some(
        ([level, count]) =>
          !/^([1-9]|1\d|20)$/u.test(level) || count < choice.minimum || count > choice.maximum,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Level-indexed choice counts must use levels 1–20 and fit the choice bounds",
        path: ["countByLevel"],
      });
    }
    if (
      choice.defaultOptionIds !== undefined &&
      (choice.defaultOptionIds.length < choice.minimum ||
        choice.defaultOptionIds.length > choice.maximum ||
        new Set(choice.defaultOptionIds).size !== choice.defaultOptionIds.length ||
        choice.defaultOptionIds.some((optionId) => !choice.options.includes(optionId)))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Defaults must be unique listed options within the choice bounds",
        path: ["defaultOptionIds"],
      });
    }
    if (choice.replacementMaximum !== undefined && !choice.changeOn?.includes("level-up")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replacement limits require a level-up change event",
        path: ["replacementMaximum"],
      });
    }
  });

export const savingThrowAuraSchema = z
  .object({
    auraId: entityIdSchema,
    ability: z.enum([
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ]),
    minimumBonus: z.number().int().nonnegative(),
    radiusFeet: z.number().positive(),
    recipientStatusId: entityIdSchema,
    inactiveConditionIds: z.array(entityIdSchema),
  })
  .strict();

export const savingThrowAuraRecipientSchema = z
  .object({
    auraId: entityIdSchema,
    selectionLabel: z.string().min(1),
    minimum: z.number().int(),
    maximum: z.number().int(),
  })
  .strict()
  .refine((value) => value.maximum >= value.minimum);

export const featureAutomationBodySchema = z
  .object({
    spellProtection: z
      .object({
        school: z.string().min(1),
        additionalTargets: z.number().int().nonnegative(),
        requiresSight: z.literal(true),
        othersOnly: z.literal(true),
        automaticSaveSuccess: z.literal(true),
        noDamageOnSuccessfulHalfSave: z.literal(true),
      })
      .strict()
      .optional(),
    spellSlotRecovery: z
      .object({
        classId: entityIdSchema,
        resourceId: entityIdSchema,
        levelDivisor: z.number().int().positive(),
        maximumSlotLevel: z.number().int().min(1).max(9),
        event: z.literal("short-rest"),
      })
      .strict()
      .optional(),
    freeSpellCasting: z
      .object({
        classId: entityIdSchema,
        resourceId: entityIdSchema,
        optionChoiceId: entityIdSchema,
      })
      .strict()
      .optional(),
    savingThrowAura: savingThrowAuraSchema.optional(),
    unarmedStrikeDamageTypes: z.array(z.string().min(1)).default([]),
    spellHealingEffects: z
      .array(
        z
          .object({
            target: z.enum(["healed-creature", "caster-after-healing-other"]),
            base: z.number().int().nonnegative(),
            perSlotLevel: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .default([]),
    activeEffectConditionImmunities: z
      .array(
        z
          .object({
            activeEffectId: entityIdSchema,
            conditionIds: z.array(entityIdSchema).min(1),
          })
          .strict(),
      )
      .default([]),
    actionEnhancements: z
      .array(
        z
          .object({
            actionId: z.string().min(1),
            endsConditionIds: z.array(entityIdSchema).min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .passthrough();

export type PackageManifest = z.infer<typeof packageManifestSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type SourceSpan = z.infer<typeof sourceSpanSchema>;
export type ContentEntity = z.infer<typeof contentEntitySchema>;
export type StartingEquipmentItem = z.infer<typeof startingEquipmentItemSchema>;
export type StartingEquipmentOption = z.infer<typeof startingEquipmentOptionSchema>;
export type StartingEquipmentChoice = z.infer<typeof startingEquipmentChoiceSchema>;
export type ClassBuilderMetadata = z.infer<typeof classBuilderMetadataSchema>;
export type ClassFeatureChoice = z.infer<typeof classFeatureChoiceSchema>;
export type FeatureAutomationBody = z.infer<typeof featureAutomationBodySchema>;
export type DraftRule = z.infer<typeof draftRuleSchema>;
export type AuthoringIr = z.infer<typeof authoringIrSchema>;
